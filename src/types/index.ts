export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface Category {
  id: string;
  name: string;
  order: number;
}

export interface KnowledgePoint {
  id: string;
  title: string;
  content: string;          // Tiptap JSON string
  parentId?: string;        // optional manual hierarchy
  tags: string[];           // Tag.id[]
  linkedPoints: string[];   // explicit bidirectional links (KnowledgePoint.id[])
  createdAt: number;
  updatedAt: number;
}

export interface Article {
  id: string;
  title: string;
  url?: string;
  summary?: string;
  notes?: string;
  calendarLabel?: string;   // 日历看板显示文字，为空时 fallback 到 title
  categoryId: string;       // Category.id
  tags: string[];           // Tag.id[]
  knowledgePoints: string[]; // KnowledgePoint.id[]
  readDate: string;         // "YYYY-MM-DD"
  createdAt: number;
}

// ─── V2 新增类型 ────────────────────────────────────

export type SourceType = 'kp' | 'article' | 'import';

/** 知识片段 — 用于检索和 RAG 上下文 */
export interface Fragment {
  id: string;
  sourceId: string;         // 来源实体 id (KP / Article / import batch)
  sourceType: SourceType;
  title: string;
  content: string;          // 纯文本
  keywords: string[];
  createdAt: number;
}

/** 对话会话 */
export interface Conversation {
  id: string;
  contextType: 'kp' | 'article' | 'global';
  contextId?: string;       // 绑定的 KP/Article id
  createdAt: number;
}

/** 单条消息 */
export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  citations: string[];      // Fragment.id[]
  createdAt: number;
}

export type RelationType =
  | 'similar'
  | 'prerequisite'
  | 'application'
  | 'contrast'
  | 'causal';

export type SuggestionStatus = 'pending' | 'accepted' | 'rejected';

/** AI 关联建议 */
export interface LinkSuggestion {
  id: string;
  fromId: string;           // KnowledgePoint.id
  toId: string;             // KnowledgePoint.id
  relationType: RelationType;
  reason: string;
  status: SuggestionStatus;
  createdAt: number;
}

export type InsightType = 'island' | 'stale' | 'duplicate' | 'gap' | 'growth';
export type InsightStatus = 'unread' | 'read' | 'acted';

/** 系统洞察/提醒 */
export interface Insight {
  id: string;
  type: InsightType;
  title: string;
  description: string;
  payload: Record<string, unknown>; // 附加数据（节点id列表等）
  status: InsightStatus;
  createdAt: number;
}

export interface Scene {
  id: string;
  name: string;
  tagIds: string[];
  color?: string;
}

export type ViewMode = 'graph' | 'articles' | 'calendar';
