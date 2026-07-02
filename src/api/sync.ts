const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const SYNC_SECRET = import.meta.env.VITE_SYNC_SECRET || "";

function authHeaders(): Record<string, string> {
  return SYNC_SECRET ? { "x-sync-secret": SYNC_SECRET } : {};
}

export async function pushSnapshot(data: unknown): Promise<{ success: boolean; version?: number; error?: string }> {
  const res = await fetch(`${API_BASE}/api/sync/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ payload: data }),
  });
  return res.json();
}

export async function pullSnapshot(): Promise<{ success: boolean; version?: number; payload?: unknown; error?: string }> {
  const res = await fetch(`${API_BASE}/api/sync/pull`, {
    headers: { ...authHeaders() },
  });
  return res.json();
}
