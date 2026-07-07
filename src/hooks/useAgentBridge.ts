import { useState, useEffect, useRef, useCallback } from 'react';
import type { Store } from './useStore';
import type { AgentProposal, AgentRequest, KnowledgePoint, Article, Tag } from '../types';
import { nanoid } from '../utils';
import { registerWorkspace, pollRequests, respondRequest, listTokens } from '../api/agent';
import { TOOL_SCOPE } from '../lib/agentScopes';
import { exportAll, importAll } from '../db/database';
import { pushSnapshot, pullSnapshot } from '../api/sync';

const ENABLED_KEY = 'kb_agent_enabled';
const TAG_COLORS = ['#E8A87C', '#D9534F', '#85B7A7', '#7DB8B0', '#C7A4C0', '#F0C987', '#8AACB8', '#C8B8DB', '#F4B9B2'];

// ─── 读操作：即时基于当前本地数据响应 ───────────────
function runRead(store: Store, req: AgentRequest): { ok: boolean; data?: unknown; error?: string } {
  const p = req.params || {};
  switch (req.tool) {
    case 'kb.search': {
      const q = String(p.query || '').toLowerCase().trim();
      if (!q) return { ok: true, data: { knowledgePoints: [], articles: [] } };
      const kps = store.knowledgePoints
        .filter((k) => k.title.toLowerCase().includes(q) || (k.summary || '').toLowerCase().includes(q) || k.content.toLowerCase().includes(q))
        .map((k) => ({ id: k.id, title: k.title, summary: k.summary }));
      const arts = store.articles
        .filter((a) => a.title.toLowerCase().includes(q) || (a.summary || '').toLowerCase().includes(q) || (a.notes || '').toLowerCase().includes(q))
        .map((a) => ({ id: a.id, title: a.title, summary: a.summary }));
      return { ok: true, data: { knowledgePoints: kps, articles: arts } };
    }
    case 'kb.list_knowledge_points':
      return {
        ok: true,
        data: store.knowledgePoints.map((k) => ({ id: k.id, title: k.title, summary: k.summary, tags: k.tags, linkedPoints: k.linkedPoints })),
      };
    case 'kb.get_knowledge_point': {
      const kp = store.knowledgePoints.find((k) => k.id === p.id);
      return kp ? { ok: true, data: kp } : { ok: false, error: 'knowledge point not found' };
    }
    case 'kb.list_articles':
      return {
        ok: true,
        data: store.articles.map((a) => ({ id: a.id, title: a.title, summary: a.summary, categoryId: a.categoryId, tags: a.tags, readDate: a.readDate })),
      };
    case 'kb.list_tags':
      return { ok: true, data: store.tags.map((t) => ({ id: t.id, name: t.name, color: t.color })) };
    case 'kb.get_graph': {
      const nodes = store.knowledgePoints.map((k) => ({ id: k.id, title: k.title }));
      const edges: Array<{ from: string; to: string }> = [];
      const seen = new Set<string>();
      for (const k of store.knowledgePoints) {
        for (const to of k.linkedPoints) {
          const key = [k.id, to].sort().join('|');
          if (!seen.has(key)) { seen.add(key); edges.push({ from: k.id, to }); }
        }
      }
      return { ok: true, data: { nodes, edges } };
    }
    default:
      return { ok: false, error: `unsupported read tool ${req.tool}` };
  }
}

// ─── 写操作：用户批准后执行 ─────────────────────────
async function runWrite(store: Store, req: AgentRequest): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  const p = req.params || {};
  const now = Date.now();
  try {
    switch (req.tool) {
      case 'kb.create_knowledge_point': {
        const kp: KnowledgePoint = {
          id: nanoid(),
          title: String(p.title || '未命名概念'),
          summary: p.description ? String(p.description) : undefined,
          content: '',
          parentId: undefined,
          tags: Array.isArray(p.tagIds) ? (p.tagIds as string[]) : [],
          linkedPoints: [],
          createdAt: now,
          updatedAt: now,
        };
        await store.upsertKP(kp);
        return { ok: true, data: { id: kp.id, title: kp.title } };
      }
      case 'kb.update_knowledge_point': {
        const existing = store.knowledgePoints.find((k) => k.id === p.id);
        if (!existing) return { ok: false, error: 'knowledge point not found' };
        const updated: KnowledgePoint = {
          ...existing,
          title: p.title !== undefined ? String(p.title) : existing.title,
          summary: p.description !== undefined ? String(p.description) : existing.summary,
          tags: Array.isArray(p.tagIds) ? (p.tagIds as string[]) : existing.tags,
          updatedAt: now,
        };
        await store.upsertKP(updated);
        return { ok: true, data: { id: updated.id } };
      }
      case 'kb.delete_knowledge_point': {
        if (!p.id) return { ok: false, error: 'id required' };
        await store.removeKP(String(p.id));
        return { ok: true, data: { id: p.id } };
      }
      case 'kb.create_article': {
        const catId = p.categoryId ? String(p.categoryId) : store.categories[0]?.id || '';
        const art: Article = {
          id: nanoid(),
          title: String(p.title || '未命名文章'),
          summary: p.summary ? String(p.summary) : undefined,
          notes: p.content ? String(p.content) : undefined,
          categoryId: catId,
          tags: Array.isArray(p.tagIds) ? (p.tagIds as string[]) : [],
          knowledgePoints: [],
          readDate: new Date().toISOString().slice(0, 10),
          createdAt: now,
        };
        await store.upsertArticle(art);
        return { ok: true, data: { id: art.id, title: art.title } };
      }
      case 'kb.update_article': {
        const existing = store.articles.find((a) => a.id === p.id);
        if (!existing) return { ok: false, error: 'article not found' };
        const updated: Article = {
          ...existing,
          title: p.title !== undefined ? String(p.title) : existing.title,
          summary: p.summary !== undefined ? String(p.summary) : existing.summary,
          notes: p.content !== undefined ? String(p.content) : existing.notes,
          categoryId: p.categoryId !== undefined ? String(p.categoryId) : existing.categoryId,
          tags: Array.isArray(p.tagIds) ? (p.tagIds as string[]) : existing.tags,
        };
        await store.upsertArticle(updated);
        return { ok: true, data: { id: updated.id } };
      }
      case 'kb.delete_article': {
        if (!p.id) return { ok: false, error: 'id required' };
        await store.removeArticle(String(p.id));
        return { ok: true, data: { id: p.id } };
      }
      case 'kb.create_tag': {
        const tag: Tag = {
          id: nanoid(),
          name: String(p.name || '新标签'),
          color: p.color ? String(p.color) : TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)],
        };
        await store.upsertTag(tag);
        return { ok: true, data: { id: tag.id, name: tag.name } };
      }
      case 'kb.organize_concepts': {
        const sourceIds = Array.isArray(p.sourceIds) ? (p.sourceIds as string[]) : [];
        if (sourceIds.length < 1) return { ok: false, error: 'sourceIds required' };
        // 以第一个为目标，其余与其互链；可选重命名目标
        const targetId = sourceIds[0];
        const target = store.knowledgePoints.find((k) => k.id === targetId);
        if (!target) return { ok: false, error: 'target concept not found' };
        const links = new Set(target.linkedPoints);
        sourceIds.slice(1).forEach((id) => links.add(id));
        const updatedTarget: KnowledgePoint = {
          ...target,
          title: p.targetTitle ? String(p.targetTitle) : target.title,
          linkedPoints: Array.from(links),
          updatedAt: now,
        };
        await store.upsertKP(updatedTarget);
        // 反向链接
        for (const id of sourceIds.slice(1)) {
          const src = store.knowledgePoints.find((k) => k.id === id);
          if (src && !src.linkedPoints.includes(targetId)) {
            await store.upsertKP({ ...src, linkedPoints: [...src.linkedPoints, targetId], updatedAt: now });
          }
        }
        return { ok: true, data: { targetId, linked: sourceIds.slice(1) } };
      }
      case 'kb.sync_push': {
        const data = await exportAll();
        const r = await pushSnapshot(data);
        return r.success ? { ok: true, data: { version: r.version } } : { ok: false, error: r.error || 'push failed' };
      }
      case 'kb.sync_pull': {
        const r = await pullSnapshot();
        if (!r.success || r.payload === undefined) return { ok: false, error: r.error || 'pull failed' };
        await importAll(r.payload as Parameters<typeof importAll>[0]);
        await store.refresh();
        return { ok: true, data: { version: r.version } };
      }
      default:
        return { ok: false, error: `unsupported write tool ${req.tool}` };
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'execution error' };
  }
}

// ─── 人话摘要 ───────────────────────────────────────
function summarize(store: Store, req: AgentRequest): string {
  const p = req.params || {};
  const kpTitle = (id: unknown) => store.knowledgePoints.find((k) => k.id === id)?.title || String(id);
  const artTitle = (id: unknown) => store.articles.find((a) => a.id === id)?.title || String(id);
  switch (req.tool) {
    case 'kb.create_knowledge_point': return `新建知识点「${p.title}」`;
    case 'kb.update_knowledge_point': return `编辑知识点「${kpTitle(p.id)}」`;
    case 'kb.delete_knowledge_point': return `删除知识点「${kpTitle(p.id)}」`;
    case 'kb.create_article': return `新建文章「${p.title}」`;
    case 'kb.update_article': return `编辑文章「${artTitle(p.id)}」`;
    case 'kb.delete_article': return `删除文章「${artTitle(p.id)}」`;
    case 'kb.create_tag': return `新建标签「${p.name}」`;
    case 'kb.organize_concepts': {
      const ids = Array.isArray(p.sourceIds) ? (p.sourceIds as string[]) : [];
      return `整理/合并 ${ids.length} 个概念${p.targetTitle ? ` → 「${p.targetTitle}」` : ''}`;
    }
    case 'kb.sync_push': return '把本地知识库同步到云端';
    case 'kb.sync_pull': return '从云端拉取并覆盖本地知识库';
    default: return req.tool;
  }
}

export function useAgentBridge(store: Store) {
  const [enabled, setEnabledState] = useState<boolean>(() => localStorage.getItem(ENABLED_KEY) === '1');
  const [proposals, setProposals] = useState<AgentProposal[]>([]);
  const storeRef = useRef(store);
  storeRef.current = store;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const loopRef = useRef(false);

  const setEnabled = useCallback((v: boolean) => {
    localStorage.setItem(ENABLED_KEY, v ? '1' : '0');
    setEnabledState(v);
  }, []);

  // 主轮询循环
  useEffect(() => {
    if (!enabled) return;
    if (loopRef.current) return;
    loopRef.current = true;
    let stopped = false;

    (async () => {
      try { await registerWorkspace(); } catch { /* ignore */ }
      const seen = new Set<string>();
      while (!stopped && enabledRef.current) {
        let requests: AgentRequest[] = [];
        try {
          requests = await pollRequests();
        } catch {
          await new Promise((r) => setTimeout(r, 3000));
          continue;
        }
        for (const req of requests) {
          if (seen.has(req.id)) continue;
          seen.add(req.id);
          const scope = TOOL_SCOPE[req.tool] || req.scope;
          if (scope === 'read') {
            const result = runRead(storeRef.current, req);
            void respondRequest(req.id, result);
          } else {
            setProposals((prev) =>
              prev.some((x) => x.id === req.id) ? prev : [...prev, { ...req, scope, summary: summarize(storeRef.current, req) }],
            );
          }
        }
      }
    })();

    return () => { stopped = true; loopRef.current = false; };
  }, [enabled]);

  const approve = useCallback(async (id: string) => {
    const proposal = proposals.find((p) => p.id === id);
    if (!proposal) return;
    const result = await runWrite(storeRef.current, proposal);
    await respondRequest(id, result);
    setProposals((prev) => prev.filter((p) => p.id !== id));
  }, [proposals]);

  const reject = useCallback(async (id: string) => {
    await respondRequest(id, { ok: false, rejected: true, error: '用户拒绝了该操作' });
    setProposals((prev) => prev.filter((p) => p.id !== id));
  }, []);

  return { enabled, setEnabled, proposals, approve, reject, pendingCount: proposals.length };
}

/** 供设置页判断是否已生成过令牌（决定是否提示开启桥接） */
export async function hasAnyToken(): Promise<boolean> {
  try {
    const tokens = await listTokens();
    return tokens.length > 0;
  } catch {
    return false;
  }
}

export type AgentBridge = ReturnType<typeof useAgentBridge>;
