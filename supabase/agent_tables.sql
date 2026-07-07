-- Agent 接入（MCP）所需的三张表
-- 在 Supabase SQL Editor 中执行。使用 service_role 访问，默认关闭匿名访问即可（无需额外 RLS 策略）。

-- 1) workspace 主人身份：只存 secret 的 SHA-256 哈希
create table if not exists agent_workspaces (
  workspace_id text primary key,
  secret_hash  text not null,
  created_at   timestamptz not null default now()
);

-- 2) agent 访问令牌：只存 token 的 SHA-256 哈希 + 授予的 scope
create table if not exists agent_tokens (
  token_hash   text primary key,          -- sha256(明文令牌)
  id           text not null,             -- token_hash 前 8 位，用于展示/吊销
  workspace_id text not null references agent_workspaces(workspace_id) on delete cascade,
  label        text not null default 'Agent 令牌',
  scopes       jsonb not null default '[]'::jsonb,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists agent_tokens_ws_idx on agent_tokens(workspace_id);

-- 3) 在途请求队列：仅短时中转，不长期存放知识内容
create table if not exists agent_queue (
  id           text primary key,
  workspace_id text not null,
  tool         text not null,
  scope        text not null,
  params       jsonb,
  response     jsonb,                      -- 浏览器回传结果；为 null 表示待处理/待审批
  claimed_at   timestamptz,                -- 浏览器已认领，避免重复下发
  responded_at timestamptz,
  created_at   timestamptz not null default now()
);
create index if not exists agent_queue_poll_idx on agent_queue(workspace_id, created_at);

-- 关闭 RLS（仅后端 service_role 访问；前端永不直连这些表）
alter table agent_workspaces disable row level security;
alter table agent_tokens    disable row level security;
alter table agent_queue     disable row level security;

-- 可选：定期清理超过 10 分钟未回收的在途消息（避免堆积）
-- delete from agent_queue where created_at < now() - interval '10 minutes';
