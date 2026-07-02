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

/**
 * 飞书多行文本字段读回来可能是三种形态：
 * 1. 纯字符串 "..."
 * 2. 分段数组 [{ type:"text", text:"..." }, ...]
 * 3. undefined/null
 * 统一拼成一个完整字符串。
 */
function extractText(field: unknown): string {
  if (typeof field === 'string') return field;
  if (Array.isArray(field)) {
    return field
      .map((seg) => (typeof seg === 'string' ? seg : (seg?.text ?? '')))
      .join('');
  }
  return '';
}

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

  try {
    const token = await getToken();
    const listRes = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${APP_TOKEN}/tables/${TABLE_ID}/records?page_size=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const listData = await listRes.json();
    if (!listRes.ok || listData.code !== 0) {
      throw new Error(listData.msg || 'Failed to list records');
    }

    const record = listData.data?.items?.[0];
    if (!record) {
      return res.json({ success: false, error: 'No snapshot found' });
    }

    const raw = extractText(record.fields?.payload);
    if (!raw) {
      return res.json({ success: false, error: 'Empty snapshot payload' });
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      return res.status(500).json({ success: false, error: 'Snapshot payload is not valid JSON' });
    }

    return res.json({
      success: true,
      version: record.fields?.version,
      payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Sync pull failed';
    return res.status(500).json({ success: false, error: message });
  }
}
