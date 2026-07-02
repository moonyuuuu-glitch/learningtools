import type { VercelRequest, VercelResponse } from '@vercel/node';

const { APP_TOKEN, TABLE_ID, FEISHU_APP_ID, FEISHU_APP_SECRET, SYNC_SECRET } = process.env;

async function getToken(): Promise<string> {
  const response = await fetch(
    'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: FEISHU_APP_ID, app_secret: FEISHU_APP_SECRET }),
    },
  );
  const data = await response.json();
  if (!response.ok || !data.tenant_access_token) {
    throw new Error(data.msg || 'Failed to get tenant_access_token');
  }
  return data.tenant_access_token;
}

async function listLatestRecord(token: string) {
  const response = await fetch(
    `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records?page_size=1`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const data = await response.json();
  if (!response.ok || data.code !== 0) {
    throw new Error(data.msg || 'Failed to list records');
  }
  return data.data?.items?.[0];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 简单鉴权：设了 SYNC_SECRET 就必须匹配
  if (SYNC_SECRET) {
    const provided = req.headers['x-sync-secret'];
    if (provided !== SYNC_SECRET) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  }

  try {
    const { payload } = req.body || {};
    if (payload === undefined || payload === null) {
      return res.status(400).json({ success: false, error: 'payload is required' });
    }

    const token = await getToken();
    const existing = await listLatestRecord(token);
    const newVersion = existing ? Number(existing.fields?.version || 0) + 1 : 1;
    const fields = {
      snapshot_id: `snap_${Date.now()}`,
      user_id: 'default',
      payload: typeof payload === 'string' ? payload : JSON.stringify(payload),
      version: newVersion,
      updated_at: Date.now(),
    };

    if (existing?.record_id) {
      const updateResponse = await fetch(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records/${existing.record_id}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields }),
        },
      );
      const updateData = await updateResponse.json();
      if (!updateResponse.ok || updateData.code !== 0) {
        throw new Error(updateData.msg || 'Failed to update record');
      }
    } else {
      const createResponse = await fetch(
        `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields }),
        },
      );
      const createData = await createResponse.json();
      if (!createResponse.ok || createData.code !== 0) {
        throw new Error(createData.msg || 'Failed to create record');
      }
    }

    return res.json({ success: true, version: newVersion });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync push failed';
    return res.status(500).json({ success: false, error: message });
  }
}
