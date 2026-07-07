import type { AgentScope } from '../types';

export interface ScopeInfo {
  scope: AgentScope;
  label: string;       // 中文标签
  desc: string;        // 说明
  needsApproval: boolean; // 是否需人在环中逐条审批
}

/** 6 类权限的中文标签与是否需审批 */
export const SCOPE_LIST: ScopeInfo[] = [
  { scope: 'read', label: '读取', desc: '搜索、查看知识点/文章/标签/图谱', needsApproval: false },
  { scope: 'create', label: '新建', desc: '新增知识点、文章、标签', needsApproval: true },
  { scope: 'edit', label: '编辑', desc: '修改已有知识点、文章', needsApproval: true },
  { scope: 'delete', label: '删除', desc: '删除知识点、文章', needsApproval: true },
  { scope: 'organize', label: '整理', desc: '合并、重组概念', needsApproval: true },
  { scope: 'sync', label: '云同步', desc: '触发云端上传/恢复（仍需你确认）', needsApproval: true },
];

export const SCOPE_LABELS: Record<AgentScope, string> = SCOPE_LIST.reduce(
  (acc, s) => { acc[s.scope] = s.label; return acc; },
  {} as Record<AgentScope, string>,
);

/** 工具名 → scope（与后端 TOOL_SCOPES 保持一致） */
export const TOOL_SCOPE: Record<string, AgentScope> = {
  'kb.search': 'read',
  'kb.list_knowledge_points': 'read',
  'kb.get_knowledge_point': 'read',
  'kb.list_articles': 'read',
  'kb.list_tags': 'read',
  'kb.get_graph': 'read',
  'kb.create_knowledge_point': 'create',
  'kb.update_knowledge_point': 'edit',
  'kb.delete_knowledge_point': 'delete',
  'kb.create_article': 'create',
  'kb.update_article': 'edit',
  'kb.delete_article': 'delete',
  'kb.create_tag': 'create',
  'kb.organize_concepts': 'organize',
  'kb.sync_push': 'sync',
  'kb.sync_pull': 'sync',
};

const WRITE: AgentScope[] = ['create', 'edit', 'delete', 'organize', 'sync'];
export function scopeNeedsApproval(scope: AgentScope): boolean {
  return WRITE.includes(scope);
}
