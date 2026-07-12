/**
 * Agent 令牌 / workspace 鉴权与 scope 映射（后端专用）
 */
import { createHash, randomBytes } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { sbSelect } from './supabase.js';

export type AgentScope = 'read' | 'create' | 'edit' | 'delete' | 'organize' | 'sync';

/** MCP 工具 → 所需 scope。写类工具全部需要人在环中审批。 */
export const TOOL_SCOPES: Record<string, AgentScope> = {
  'kb.search': 'read',
  'kb.list_knowledge_points': 'read',
  'kb.get_knowledge_point': 'read',
  'kb.list_articles': 'read',
  'kb.list_tags': 'read',
  'kb.get_graph': 'read',
  'kb.list_frameworks': 'read',
  'kb.create_knowledge_point': 'create',
  'kb.update_knowledge_point': 'edit',
  'kb.delete_knowledge_point': 'delete',
  'kb.create_article': 'create',
  'kb.update_article': 'edit',
  'kb.delete_article': 'delete',
  'kb.create_tag': 'create',
  'kb.create_framework_candidate': 'create',
  'kb.create_relation_candidate': 'create',
  'kb.organize_concepts': 'organize',
  'kb.sync_push': 'sync',
  'kb.sync_pull': 'sync',
  'kb.get_result': 'read',
};

/** 需人在环中审批的 scope（写类） */
export const WRITE_SCOPES: AgentScope[] = ['create', 'edit', 'delete', 'organize', 'sync'];

export function isWriteScope(scope: AgentScope): boolean {
  return WRITE_SCOPES.includes(scope);
}

export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function generateToken(): string {
  // vsk = verdent study key
  return `vsk_${randomBytes(24).toString('base64url')}`;
}

export function generateId(prefix = 'req'): string {
  return `${prefix}_${randomBytes(12).toString('base64url')}`;
}

interface TokenRow {
  token_hash: string;
  workspace_id: string;
  scopes: AgentScope[];
  label: string;
}

/** 校验 Authorization: Bearer <token>，返回令牌信息或 null */
export async function verifyBearer(req: VercelRequest): Promise<TokenRow | null> {
  const auth = req.headers['authorization'] || req.headers['Authorization' as never];
  const raw = Array.isArray(auth) ? auth[0] : auth;
  if (!raw || !raw.startsWith('Bearer ')) return null;
  const token = raw.slice(7).trim();
  if (!token) return null;
  const hash = sha256(token);
  const rows = await sbSelect<TokenRow>('agent_tokens', `token_hash=eq.${hash}&select=token_hash,workspace_id,scopes,label`);
  if (!rows || rows.length === 0) return null;
  // 更新 last_used_at（不阻塞）
  return rows[0];
}

/** 校验浏览器主人身份：x-workspace-id + x-workspace-secret */
export async function verifyWorkspace(req: VercelRequest): Promise<string | null> {
  const id = req.headers['x-workspace-id'];
  const secret = req.headers['x-workspace-secret'];
  const wid = Array.isArray(id) ? id[0] : id;
  const wsecret = Array.isArray(secret) ? secret[0] : secret;
  if (!wid || !wsecret) return null;
  const rows = await sbSelect<{ workspace_id: string; secret_hash: string }>(
    'agent_workspaces',
    `workspace_id=eq.${wid}&select=workspace_id,secret_hash`,
  );
  if (!rows || rows.length === 0) return null;
  if (rows[0].secret_hash !== sha256(wsecret)) return null;
  return wid;
}
