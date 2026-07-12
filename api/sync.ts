import type { VercelRequest, VercelResponse } from '@vercel/node'

const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SYNC_SECRET } = process.env

function unauthorized(res: VercelResponse) {
  return res.status(401).json({ success: false, error: 'Unauthorized' })
}

function missingConfig(res: VercelResponse) {
  return res.status(500).json({ success: false, error: 'Supabase not configured' })
}

function authFailed(req: VercelRequest) {
  if (!SYNC_SECRET) return false
  return req.headers['x-sync-secret'] !== SYNC_SECRET
}

async function fetchSnapshotVersion() {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/snapshots?id=eq.default&select=version`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  )
  const rows = await response.json()
  return Array.isArray(rows) && rows.length > 0 ? Number(rows[0].version) : 0
}

async function handlePush(req: VercelRequest, res: VercelResponse) {
  const { payload } = req.body || {}
  if (payload === undefined || payload === null) {
    return res.status(400).json({ success: false, error: 'payload is required' })
  }

  const currentVersion = await fetchSnapshotVersion()
  const newVersion = currentVersion + 1

  const response = await fetch(`${SUPABASE_URL}/rest/v1/snapshots`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY!,
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
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Supabase upsert failed (${response.status}): ${errorBody}`)
  }

  return res.json({ success: true, version: newVersion })
}

async function handlePull(res: VercelResponse) {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/snapshots?id=eq.default&select=payload,version,updated_at`,
    {
      headers: {
        apikey: SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
    },
  )

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(`Supabase select failed (${response.status}): ${errorBody}`)
  }

  const rows = await response.json()
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.json({ success: false, error: 'No snapshot found' })
  }

  const row = rows[0]
  return res.json({
    success: true,
    version: row.version,
    payload: row.payload,
  })
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (authFailed(req)) return unauthorized(res)
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) return missingConfig(res)

  try {
    if (req.method === 'POST') return await handlePush(req, res)
    if (req.method === 'GET') return await handlePull(res)
    return res.status(405).json({ error: 'Method not allowed' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync failed'
    return res.status(500).json({ success: false, error: message })
  }
}