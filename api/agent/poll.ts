import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseConfigured, sbSelect, sbUpdate } from '../_lib/supabase.js';
import { verifyWorkspace } from '../_lib/agentAuth.js';

interface QueueRow {
  id: string;
  tool: string;
  scope: string;
  params: Record<string, unknown>;
  created_at: string;
}

const WAIT_MS = 18000; // 浏览器长轮询上限（Vercel 内）
const STEP_MS = 1500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 浏览器桥接：长轮询本 workspace 待处理的 agent 请求。
 * 用 x-workspace-id + x-workspace-secret 鉴权。
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

  // 只取 5 分钟内、未认领、未回应的请求
  const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const query = `workspace_id=eq.${wid}&response=is.null&claimed_at=is.null&created_at=gt.${cutoff}&select=id,tool,scope,params,created_at&order=created_at.asc&limit=10`;

  const deadline = Date.now() + WAIT_MS;
  try {
    while (Date.now() < deadline) {
      const rows = await sbSelect<QueueRow>('agent_queue', query);
      if (rows && rows.length > 0) {
        const ids = rows.map((r) => r.id);
        // 认领这些请求，避免重复下发
        const inList = `(${ids.map((i) => `"${i}"`).join(',')})`;
        await sbUpdate('agent_queue', `workspace_id=eq.${wid}&id=in.${inList}`, {
          claimed_at: new Date().toISOString(),
        });
        return res.json({ success: true, requests: rows });
      }
      await sleep(STEP_MS);
    }
    return res.json({ success: true, requests: [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'poll failed';
    return res.status(500).json({ success: false, error: message });
  }
}
