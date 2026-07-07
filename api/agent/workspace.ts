import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseConfigured, sbSelect, sbInsert } from '../_lib/supabase.js';

/**
 * 注册/校验 workspace 主人身份。
 * POST body: { secretHash }  header: x-workspace-id
 *  - 不存在则创建（记录 secret 哈希）
 *  - 已存在且哈希一致 → ok
 *  - 已存在但哈希不同 → 拒绝（防止他人冒占同一 workspaceId）
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method not allowed' });
  if (!supabaseConfigured()) return res.status(500).json({ success: false, error: 'Supabase not configured' });

  const widRaw = req.headers['x-workspace-id'];
  const wid = Array.isArray(widRaw) ? widRaw[0] : widRaw;
  const { secretHash } = req.body || {};
  if (!wid || !secretHash) return res.status(400).json({ success: false, error: 'workspace id and secretHash required' });

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : 'workspace register failed';
    return res.status(500).json({ success: false, error: message });
  }
}
