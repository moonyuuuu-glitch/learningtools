import type { VercelRequest, VercelResponse } from '@vercel/node';

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET } = process.env;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
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
    const selectRes = await fetch(
      `${SUPABASE_URL}/rest/v1/snapshots?id=eq.default&select=payload,version,updated_at`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );

    if (!selectRes.ok) {
      const errBody = await selectRes.text();
      throw new Error(`Supabase select failed (${selectRes.status}): ${errBody}`);
    }

    const rows = await selectRes.json();
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.json({ success: false, error: 'No snapshot found' });
    }

    const row = rows[0];
    return res.json({
      success: true,
      version: row.version,
      payload: row.payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync pull failed';
    return res.status(500).json({ success: false, error: message });
  }
}
