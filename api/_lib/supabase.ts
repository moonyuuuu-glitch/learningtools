/**
 * Supabase REST 轻封装（复用现有 sync 用的环境变量，无第三方依赖）
 * 只在后端 Vercel Functions 中调用，前端永不接触 service key。
 */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY);
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SUPABASE_SERVICE_ROLE_KEY as string,
    Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/** GET /rest/v1/{table}?{query} */
export async function sbSelect<T = unknown>(table: string, query = ''): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query ? `?${query}` : ''}`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`supabase select ${table} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

/** POST /rest/v1/{table}，Prefer=merge-duplicates 时为 upsert */
export async function sbInsert(table: string, row: unknown, upsert = false): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: headers(upsert ? { Prefer: 'resolution=merge-duplicates,return=minimal' } : { Prefer: 'return=minimal' }),
    body: JSON.stringify(row),
  });
  if (!res.ok) throw new Error(`supabase insert ${table} failed (${res.status}): ${await res.text()}`);
}

/** PATCH /rest/v1/{table}?{query} */
export async function sbUpdate(table: string, query: string, patch: unknown): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'PATCH',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`supabase update ${table} failed (${res.status}): ${await res.text()}`);
}

/** DELETE /rest/v1/{table}?{query} */
export async function sbDelete(table: string, query: string): Promise<void> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, {
    method: 'DELETE',
    headers: headers({ Prefer: 'return=minimal' }),
  });
  if (!res.ok) throw new Error(`supabase delete ${table} failed (${res.status}): ${await res.text()}`);
}
