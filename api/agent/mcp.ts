import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseConfigured, sbSelect, sbInsert, sbUpdate, sbDelete } from '../_lib/supabase.js';
import {
  verifyBearer,
  TOOL_SCOPES,
  isWriteScope,
  generateId,
  type AgentScope,
} from '../_lib/agentAuth.js';

const WAIT_MS = 24000; // agent 侧长轮询上限（Vercel Hobby ~25s）
const STEP_MS = 1200;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── MCP 工具目录（JSON Schema）─────────────────────
const TOOLS = [
  {
    name: 'kb.search',
    description: '搜索知识库中的知识点与文章（返回当前浏览器本地数据的匹配结果）',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string', description: '搜索关键词' } },
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
    description: '获取知识图谱（节点与共现关系边）',
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

/**
 * MCP 端点（JSON-RPC over HTTP）。
 * 用 Bearer Token 鉴权 → 校验 scope → 写入 workspace 队列 → 长轮询等浏览器回传 → 返回给 agent。
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!supabaseConfigured()) return res.status(500).json({ error: 'Supabase not configured' });

  const body = req.body || {};
  const { id: rpcId, method, params } = body;

  // 鉴权（initialize/tools/list 允许无 token 探测？为安全起见全部要求 token）
  let token;
  try {
    token = await verifyBearer(req);
  } catch {
    return res.json(rpcError(rpcId, -32001, 'auth backend error'));
  }
  if (!token) {
    return res.status(401).json(rpcError(rpcId, -32001, 'Unauthorized: invalid or revoked token'));
  }
  const grantedScopes = (token.scopes || []) as AgentScope[];

  // 更新 last_used_at（不阻塞主流程）
  void sbUpdate('agent_tokens', `token_hash=eq.${token.token_hash}`, {
    last_used_at: new Date().toISOString(),
  }).catch(() => {});

  try {
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
      // 只暴露 token 拥有 scope 的工具
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
      if (!scope) return res.json(rpcResult(rpcId, { ...toolText({ ok: false, error: `unknown tool ${toolName}` }), isError: true }));
      if (!grantedScopes.includes(scope)) {
        return res.json(
          rpcResult(rpcId, { ...toolText({ ok: false, error: `令牌缺少所需权限: ${scope}` }), isError: true }),
        );
      }

      // 入队
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

      // 长轮询等浏览器回传结果
      const deadline = Date.now() + WAIT_MS;
      while (Date.now() < deadline) {
        const rows = await sbSelect<{ response: unknown }>(
          'agent_queue',
          `id=eq.${reqId}&select=response`,
        );
        const resp = rows?.[0]?.response as { ok?: boolean; data?: unknown; error?: string; rejected?: boolean } | null;
        if (resp) {
          // 清理该在途消息（不在后端长留知识内容）
          void sbDelete('agent_queue', `id=eq.${reqId}`).catch(() => {});
          if (resp.ok) return res.json(rpcResult(rpcId, toolText(resp.data ?? { ok: true })));
          return res.json(
            rpcResult(rpcId, {
              ...toolText({ ok: false, error: resp.error || (resp.rejected ? '用户拒绝了该操作' : '执行失败') }),
              isError: true,
            }),
          );
        }
        await sleep(STEP_MS);
      }
      // 超时：写操作可能仍在等待审批；读操作则多半是网页没开
      const hint = isWriteScope(scope)
        ? '请求已提交，等待用户在网页中审批。请稍后用 kb.get_result 或重试。'
        : '应用离线：请确认知识库网页已打开后重试。';
      return res.json(rpcResult(rpcId, { ...toolText({ ok: false, pending: true, error: hint }), isError: true }));
    }

    return res.json(rpcError(rpcId, -32601, `Method not found: ${method}`));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'mcp error';
    return res.json(rpcError(rpcId, -32603, message));
  }
}
