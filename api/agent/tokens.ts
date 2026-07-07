import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseConfigured, sbSelect, sbInsert, sbDelete } from '../_lib/supabase.js';
import {
  verifyWorkspace,
  generateToken,
  sha256,
  type AgentScope,
} from '../_lib/agentAuth.js';

const ALL_SCOPES: AgentScope[] = ['read', 'create', 'edit', 'delete', 'organize', 'sync'];

/**
 * Agent 令牌管理（主人操作，用 workspaceSecret 鉴权）
 *  POST   生成令牌（返回明文一次）
 *  GET    列出令牌元数据（不含明文）
 *  DELETE 吊销令牌（body: { id }）
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!supabaseConfigured()) {
    return res.status(500).json({ success: false, error: 'Supabase not configured' });
  }

  let wid: string | null;
  try {
    wid = await verifyWorkspace(req);
  } catch (e) {
    return res.status(500).json({ success: false, error: e instanceof Error ? e.message : 'auth error' });
  }
  if (!wid) return res.status(401).json({ success: false, error: 'Unauthorized workspace' });

  try {
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
      // token 明文仅此一次返回
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'token op failed';
    return res.status(500).json({ success: false, error: message });
  }
}
