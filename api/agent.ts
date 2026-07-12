import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseConfigured, sbSelect, sbInsert, sbUpdate, sbDelete } from './_lib/supabase.js';
import {
  verifyBearer,
  verifyWorkspace,
  TOOL_SCOPES,
  isWriteScope,
  generateId,
  generateToken,
  sha256,
  type AgentScope,
} from './_lib/agentAuth.js';

interface QueueRow {
  id: string;
  tool: string;
  scope: string;
  params: Record<string, unknown>;
  created_at: string;
}

const ALL_SCOPES: AgentScope[] = ['read', 'create', 'edit', 'delete', 'organize', 'sync'];
const MCP_WAIT_MS = 24000;
const POLL_WAIT_MS = 18000;
const POLL_STEP_MS = 1500;
const MCP_STEP_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const TOOLS = [
  {
    name: 'kb.search',
    description: '搜索知识库中的资料、知识点与已审核框架（返回当前浏览器本地数据的匹配结果）',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '搜索关键词' },
        types: {
          type: 'array',
          items: { type: 'string', enum: ['article', 'knowledge_point', 'framework'] },
        },
        tagIds: { type: 'array', items: { type: 'string' } },
        provenanceRole: {
          type: 'string',
          enum: ['owner_input', 'external_source', 'published_product', 'unknown'],
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'kb.list_knowledge_points',
    description: '列出所有知识点（概念节点）',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kb.get_knowledge_point',
    description: '按 id 获取单个知识点详情',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'kb.list_articles',
    description: '列出所有文章',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kb.list_tags',
    description: '列出所有标签',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kb.get_graph',
    description: '获取知识图谱，区分已审核正式关系与自动弱关联信号',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kb.list_frameworks',
    description: '列出所有已审核框架卡片',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kb.create_knowledge_point',
    description: '新建知识点（需用户在网页中审批后生效）',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        categoryId: { type: 'string' },
        tagIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['title'],
    },
  },
  {
    name: 'kb.update_knowledge_point',
    description: '编辑知识点（需审批）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        description: { type: 'string' },
        categoryId: { type: 'string' },
        tagIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['id'],
    },
  },
  {
    name: 'kb.delete_knowledge_point',
    description: '删除知识点（需审批）',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'kb.create_article',
    description: '新建文章（需审批）',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        content: { type: 'string' },
        categoryId: { type: 'string' },
        tagIds: { type: 'array', items: { type: 'string' } },
        provenanceRole: {
          type: 'string',
          enum: ['owner_input', 'external_source', 'published_product', 'unknown'],
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'kb.update_article',
    description: '编辑文章（需审批）',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        content: { type: 'string' },
        categoryId: { type: 'string' },
        tagIds: { type: 'array', items: { type: 'string' } },
        provenanceRole: {
          type: 'string',
          enum: ['owner_input', 'external_source', 'published_product', 'unknown'],
        },
      },
      required: ['id'],
    },
  },
  {
    name: 'kb.delete_article',
    description: '删除文章（需审批）',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  },
  {
    name: 'kb.create_tag',
    description: '新建标签（需审批）',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, color: { type: 'string' } },
      required: ['name'],
    },
  },
  {
    name: 'kb.create_framework_candidate',
    description: '创建框架候选，需用户在统一审核箱确认后才进入个人工具箱',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        problem: { type: 'string' },
        steps: { type: 'array', items: { type: 'string' } },
        useCases: { type: 'array', items: { type: 'string' } },
        sourceArticleIds: { type: 'array', items: { type: 'string' } },
        knowledgePointIds: { type: 'array', items: { type: 'string' } },
        reason: { type: 'string' },
        evidence: { type: 'string' },
      },
      required: ['title', 'problem', 'steps'],
    },
  },
  {
    name: 'kb.create_relation_candidate',
    description: '创建带理由和证据的正式关系候选，需用户在统一审核箱确认',
    inputSchema: {
      type: 'object',
      properties: {
        fromType: { type: 'string', enum: ['knowledge_point', 'framework'] },
        fromId: { type: 'string' },
        toType: { type: 'string', enum: ['knowledge_point', 'framework'] },
        toId: { type: 'string' },
        relationType: {
          type: 'string',
          enum: ['explains', 'applies', 'prerequisite', 'contrast', 'causal', 'derived_from', 'part_of', 'related_to'],
        },
        reason: { type: 'string' },
        evidence: { type: 'string' },
        sourceArticleIds: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
      },
      required: ['fromType', 'fromId', 'toType', 'toId', 'relationType', 'reason'],
    },
  },
  {
    name: 'kb.organize_concepts',
    description: '整理/合并概念（需审批）。传入合并意图，由用户确认',
    inputSchema: {
      type: 'object',
      properties: {
        sourceIds: { type: 'array', items: { type: 'string' } },
        targetTitle: { type: 'string' },
        note: { type: 'string' },
      },
      required: ['sourceIds'],
    },
  },
  {
    name: 'kb.sync_push',
    description: '触发把本地知识库同步到云端（需审批；agent 不会自动上传）',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'kb.sync_pull',
    description: '从云端拉取知识库覆盖本地（需审批）',
    inputSchema: { type: 'object', properties: {} },
  },
];

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}
function toolText(obj: unknown) {
  return { content: [{ type: 'text', text: typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2) }] };
}

function setCors(res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

async function handleWorkspace(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  const widRaw = req.headers['x-workspace-id'];
  const wid = Array.isArray(widRaw) ? widRaw[0] : widRaw;
  const { secretHash } = req.body || {};
  if (!wid || !secretHash) {
    return res.status(400).json({ success: false, error: 'workspace id and secretHash required' });
  }
  const rows = await sbSelect<{ workspace_id: string; secret_hash: string }>(
    'agent_workspaces',
    `workspace_id=eq.${wid}&select=workspace_id,secret_hash`,
  );
  if (rows && rows.length > 0) {
    if (rows[0].secret_hash !== secretHash) {
      return res.status(409).json({ success: false, error: 'workspace already claimed' });
    }
    return res.json({ success: true, existed: true });
  }
  await sbInsert('agent_workspaces', {
    workspace_id: wid,
    secret_hash: secretHash,
    created_at: new Date().toISOString(),
  });
  return res.json({ success: true, existed: false });
}

async function handleTokens(req: VercelRequest, res: VercelResponse) {
  const wid = await verifyWorkspace(req);
  if (!wid) return res.status(401).json({ success: false, error: 'Unauthorized workspace' });
  if (req.method === 'POST') {
    const { label, scopes } = req.body || {};
    const cleanScopes: AgentScope[] = Array.isArray(scopes)
      ? scopes.filter((s: string): s is AgentScope => ALL_SCOPES.includes(s as AgentScope))
      : [];
    if (cleanScopes.length === 0) {
      return res.status(400).json({ success: false, error: 'at least one scope required' });
    }
    const token = generateToken();
    const hash = sha256(token);
    const id = hash.slice(0, 8);
    await sbInsert('agent_tokens', {
      token_hash: hash,
      id,
      workspace_id: wid,
      label: (label || 'Agent 令牌').toString().slice(0, 60),
      scopes: cleanScopes,
      created_at: new Date().toISOString(),
    });
    return res.json({ success: true, token, id, scopes: cleanScopes });
  }
  if (req.method === 'GET') {
    const rows = await sbSelect(
      'agent_tokens',
      `workspace_id=eq.${wid}&select=id,label,scopes,created_at,last_used_at&order=created_at.desc`,
    );
    return res.json({ success: true, tokens: rows });
  }
  if (req.method === 'DELETE') {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: 'id required' });
    await sbDelete('agent_tokens', `workspace_id=eq.${wid}&id=eq.${id}`);
    return res.json({ success: true });
  }
  return res.status(405).json({ success: false, error: 'Method not allowed' });
}

async function handlePoll(req: VercelRequest, res: VercelResponse) {
  const wid = await verifyWorkspace(req);
  if (!wid) return res.status(401).json({ success: false, error: 'Unauthorized workspace' });
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const query = `workspace_id=eq.${wid}&response=is.null&claimed_at=is.null&created_at=gt.${cutoff}&select=id,tool,scope,params,created_at&order=created_at.asc&limit=10`;
  const deadline = Date.now() + POLL_WAIT_MS;
  while (Date.now() < deadline) {
    const rows = await sbSelect<QueueRow>('agent_queue', query);
    if (rows && rows.length > 0) {
      const ids = rows.map((r) => r.id);
      const inList = `(${ids.map((i) => `"${i}"`).join(',')})`;
      await sbUpdate('agent_queue', `workspace_id=eq.${wid}&id=in.${inList}`, {
        claimed_at: new Date().toISOString(),
      });
      return res.json({ success: true, requests: rows });
    }
    await sleep(POLL_STEP_MS);
  }
  return res.json({ success: true, requests: [] });
}

async function handleRespond(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
  const wid = await verifyWorkspace(req);
  if (!wid) return res.status(401).json({ success: false, error: 'Unauthorized workspace' });
  const { id, result } = req.body || {};
  if (!id) return res.status(400).json({ success: false, error: 'id required' });
  await sbUpdate('agent_queue', `workspace_id=eq.${wid}&id=eq.${id}`, {
    response: result ?? { ok: false, error: 'empty result' },
    responded_at: new Date().toISOString(),
  });
  return res.json({ success: true });
}

async function handleMcp(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const body = req.body || {};
  const { id: rpcId, method, params } = body;
  const token = await verifyBearer(req);
  if (!token) {
    return res.status(401).json(rpcError(rpcId, -32001, 'Unauthorized: invalid or revoked token'));
  }
  const grantedScopes = (token.scopes || []) as AgentScope[];
  void sbUpdate('agent_tokens', `token_hash=eq.${token.token_hash}`, {
    last_used_at: new Date().toISOString(),
  }).catch(() => {});
  if (method === 'initialize') {
    return res.json(
      rpcResult(rpcId, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'verdent-study-kb', version: '1.0.0' },
      }),
    );
  }
  if (method === 'notifications/initialized' || method === 'ping') {
    return res.json(rpcResult(rpcId, {}));
  }
  if (method === 'tools/list') {
    const visible = TOOLS.filter((t) => {
      const s = TOOL_SCOPES[t.name];
      return s && grantedScopes.includes(s);
    });
    return res.json(rpcResult(rpcId, { tools: visible }));
  }
  if (method === 'tools/call') {
    const toolName: string = params?.name;
    const args = (params?.arguments || {}) as Record<string, unknown>;
    const scope = TOOL_SCOPES[toolName];
    if (!scope) {
      return res.json(rpcResult(rpcId, { ...toolText({ ok: false, error: `unknown tool ${toolName}` }), isError: true }));
    }
    if (!grantedScopes.includes(scope)) {
      return res.json(
        rpcResult(rpcId, { ...toolText({ ok: false, error: `令牌缺少所需权限: ${scope}` }), isError: true }),
      );
    }
    const reqId = generateId('req');
    await sbInsert('agent_queue', {
      id: reqId,
      workspace_id: token.workspace_id,
      tool: toolName,
      scope,
      params: args,
      created_at: new Date().toISOString(),
      response: null,
      claimed_at: null,
    });
    const deadline = Date.now() + MCP_WAIT_MS;
    while (Date.now() < deadline) {
      const rows = await sbSelect<{ response: unknown }>(
        'agent_queue',
        `id=eq.${reqId}&select=response`,
      );
      const resp = rows?.[0]?.response as { ok?: boolean; data?: unknown; error?: string; rejected?: boolean } | null;
      if (resp) {
        void sbDelete('agent_queue', `id=eq.${reqId}`).catch(() => {});
        if (resp.ok) return res.json(rpcResult(rpcId, toolText(resp.data ?? { ok: true })));
        return res.json(
          rpcResult(rpcId, {
            ...toolText({ ok: false, error: resp.error || (resp.rejected ? '用户拒绝了该操作' : '执行失败') }),
            isError: true,
          }),
        );
      }
      await sleep(MCP_STEP_MS);
    }
    const hint = isWriteScope(scope)
      ? '请求已提交，等待用户在网页中审批。请稍后重试。'
      : '应用离线：请确认知识库网页已打开后重试。';
    return res.json(rpcResult(rpcId, { ...toolText({ ok: false, pending: true, error: hint }), isError: true }));
  }
  return res.json(rpcError(rpcId, -32601, `Method not found: ${method}`));
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Supabase not configured' });
  }
  const routeRaw = req.query.route;
  const route = Array.isArray(routeRaw) ? routeRaw[0] : routeRaw;
  try {
    if (route === 'workspace') return await handleWorkspace(req, res);
    if (route === 'tokens') return await handleTokens(req, res);
    if (route === 'poll') return await handlePoll(req, res);
    if (route === 'respond') return await handleRespond(req, res);
    if (route === 'mcp') return await handleMcp(req, res);
    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'agent api error';
    return res.status(500).json({ success: false, error: message });
  }
}
