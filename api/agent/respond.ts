import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseConfigured, sbUpdate } from '../_lib/supabase.js';
import { verifyWorkspace } from '../_lib/agentAuth.js';

/**
 * 浏览器桥接：回传某 requestId 的执行结果 / 审批结论。
 * body: { id, result }  result 形如 { ok: true, data } 或 { ok: false, error, rejected? }
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }
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
    const { id, result } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: 'id required' });
    await sbUpdate('agent_queue', `workspace_id=eq.${wid}&id=eq.${id}`, {
      response: result ?? { ok: false, error: 'empty result' },
      responded_at: new Date().toISOString(),
    });
    return res.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'respond failed';
    return res.status(500).json({ success: false, error: message });
  }
}
