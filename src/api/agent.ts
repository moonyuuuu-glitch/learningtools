import type { AgentScope, AgentTokenMeta, AgentRequest } from '../types';
import { workspaceHeaders, workspaceSecretHash } from '../lib/workspace';

const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

function jsonHeaders(): Record<string, string> {
  return { 'Content-Type': 'application/json', ...workspaceHeaders() };
}

/** 首次向后端注册本浏览器 workspace（幂等） */
export async function registerWorkspace(): Promise<{ success: boolean; error?: string }> {
  const secretHash = await workspaceSecretHash();
  const res = await fetch(`${API_BASE}/api/agent/workspace`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ secretHash }),
  });
  return res.json();
}

/** 生成令牌（明文仅此一次返回） */
export async function createToken(
  label: string,
  scopes: AgentScope[],
): Promise<{ success: boolean; token?: string; id?: string; error?: string }> {
  const res = await fetch(`${API_BASE}/api/agent/tokens`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ label, scopes }),
  });
  return res.json();
}

interface RawTokenRow {
  id: string;
  label: string;
  scopes: AgentScope[];
  created_at: string;
  last_used_at?: string | null;
}

export async function listTokens(): Promise<AgentTokenMeta[]> {
  const res = await fetch(`${API_BASE}/api/agent/tokens`, { headers: jsonHeaders() });
  const data = await res.json();
  if (!data?.success) return [];
  return (data.tokens as RawTokenRow[]).map((t) => ({
    id: t.id,
    label: t.label,
    scopes: t.scopes || [],
    createdAt: new Date(t.created_at).getTime(),
    lastUsedAt: t.last_used_at ? new Date(t.last_used_at).getTime() : undefined,
  }));
}

export async function revokeToken(id: string): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(`${API_BASE}/api/agent/tokens`, {
    method: 'DELETE',
    headers: jsonHeaders(),
    body: JSON.stringify({ id }),
  });
  return res.json();
}

/** 浏览器长轮询待处理请求 */
export async function pollRequests(signal?: AbortSignal): Promise<AgentRequest[]> {
  const res = await fetch(`${API_BASE}/api/agent/poll`, { headers: jsonHeaders(), signal });
  const data = await res.json();
  if (!data?.success || !Array.isArray(data.requests)) return [];
  return (data.requests as Array<{ id: string; tool: string; scope: AgentScope; params: Record<string, unknown>; created_at: string }>).map((r) => ({
    id: r.id,
    tool: r.tool,
    scope: r.scope,
    params: r.params || {},
    createdAt: new Date(r.created_at).getTime(),
  }));
}

/** 回传执行结果 / 审批结论 */
export async function respondRequest(
  id: string,
  result: { ok: boolean; data?: unknown; error?: string; rejected?: boolean },
): Promise<void> {
  await fetch(`${API_BASE}/api/agent/respond`, {
    method: 'POST',
    headers: jsonHeaders(),
    body: JSON.stringify({ id, result }),
  });
}
