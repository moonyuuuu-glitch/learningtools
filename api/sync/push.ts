import type { VercelRequest, VercelResponse } from '@vercel/node';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET } = process.env;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (SYNC_SECRET) {
    const provided = req.headers['x-sync-secret'];
    if (provided !== SYNC_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ success: false, error: 'Supabase not configured' });
  }

  try {
    const { payload } = req.body || {};
    if (payload === undefined || payload === null) {
      return res.status(400).json({ success: false, error: 'payload is required' });
    }

    // 先读当前版本号
    const selectRes = await fetch(
      `${SUPABASE_URL}/rest/v1/snapshots?id=eq.default&select=version`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    const rows = await selectRes.json();
    const currentVersion = Array.isArray(rows) && rows.length > 0 ? Number(rows[0].version) : 0;
    const newVersion = currentVersion + 1;

    // upsert（有就更新，没有就插入）
    const upsertRes = await fetch(
      `${SUPABASE_URL}/rest/v1/snapshots`,
      {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          id: 'default',
          payload,
          version: newVersion,
          updated_at: new Date().toISOString(),
        }),
      },
    );

    if (!upsertRes.ok) {
      const errBody = await upsertRes.text();
      throw new Error(`Supabase upsert failed (${upsertRes.status}): ${errBody}`);
    }

    return res.json({ success: true, version: newVersion });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync push failed';
    return res.status(500).json({ success: false, error: message });
  }
}
