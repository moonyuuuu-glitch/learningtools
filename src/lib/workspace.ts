/**
 * 本地 workspace 身份：标识「这台浏览器是该知识库的主人」。
 * 首次运行自动生成 workspaceId + workspaceSecret，存 localStorage，随导出备份。
 * secret 仅浏览器持有；后端只存其 SHA-256 哈希，用于 poll/respond/tokens 鉴权。
 */
const WS_ID_KEY = 'kb_workspace_id';
const WS_SECRET_KEY = 'kb_workspace_secret';

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
}

export interface WorkspaceIdentity {
  workspaceId: string;
  workspaceSecret: string;
}

let cached: WorkspaceIdentity | null = null;

export function getWorkspace(): WorkspaceIdentity {
  if (cached) return cached;
  let workspaceId = localStorage.getItem(WS_ID_KEY);
  let workspaceSecret = localStorage.getItem(WS_SECRET_KEY);
  if (!workspaceId || !workspaceSecret) {
    workspaceId = `ws_${randomHex(8)}`;
    workspaceSecret = randomHex(32);
    localStorage.setItem(WS_ID_KEY, workspaceId);
    localStorage.setItem(WS_SECRET_KEY, workspaceSecret);
  }
  cached = { workspaceId, workspaceSecret };
  return cached;
}

/** 计算 secret 的 SHA-256 哈希（十六进制），供首次向后端注册 workspace 用 */
export async function workspaceSecretHash(): Promise<string> {
  const { workspaceSecret } = getWorkspace();
  const data = new TextEncoder().encode(workspaceSecret);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** 鉴权头，用于 poll / respond / tokens 主人端点 */
export function workspaceHeaders(): Record<string, string> {
  const { workspaceId, workspaceSecret } = getWorkspace();
  return { 'x-workspace-id': workspaceId, 'x-workspace-secret': workspaceSecret };
}

/** 导出备份时携带（便于换设备恢复主人身份） */
export function exportWorkspace(): WorkspaceIdentity {
  return getWorkspace();
}

/** 从备份恢复 workspace 身份 */
export function importWorkspace(ws?: Partial<WorkspaceIdentity>): void {
  if (ws?.workspaceId && ws?.workspaceSecret) {
    localStorage.setItem(WS_ID_KEY, ws.workspaceId);
    localStorage.setItem(WS_SECRET_KEY, ws.workspaceSecret);
    cached = { workspaceId: ws.workspaceId, workspaceSecret: ws.workspaceSecret };
  }
}
