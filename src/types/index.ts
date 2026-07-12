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
  title: string;            // 概念短名（2~6 字）
  summary?: string;         // 一句话定义
  content: string;          // Tiptap JSON string（长笔记）
  aliases?: string[];
  parentId?: string;        // optional manual hierarchy
  tags: string[];           // Tag.id[]
  linkedPoints: string[];   // explicit bidirectional links (KnowledgePoint.id[])
  reviewStatus?: ReviewStatus;
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
  provenanceRole?: ProvenanceRole;
  reviewStatus?: ReviewStatus;
  sourceHash?: string;
  readDate: string;         // "YYYY-MM-DD"
  createdAt: number;
  updatedAt?: number;
}

export type ProvenanceRole =
  | 'owner_input'
  | 'external_source'
  | 'published_product'
  | 'unknown';

export type ReviewStatus =
  | 'candidate'
  | 'reviewed'
  | 'needs_review'
  | 'archived';

export type KnowledgeEntityType = 'knowledge_point' | 'framework';

export type KnowledgeRelationType =
  | 'explains'
  | 'applies'
  | 'prerequisite'
  | 'contrast'
  | 'causal'
  | 'derived_from'
  | 'part_of'
  | 'related_to';

export interface FrameworkCard {
  id: string;
  title: string;
  problem: string;
  steps: string[];
  useCases: string[];
  sourceArticleIds: string[];
  knowledgePointIds: string[];
  reviewStatus: ReviewStatus;
  pinned: boolean;
  suppressed: boolean;
  score: number;
  createdAt: number;
  updatedAt: number;
}

export interface KnowledgeRelation {
  id: string;
  fromType: KnowledgeEntityType;
  fromId: string;
  toType: KnowledgeEntityType;
  toId: string;
  type: KnowledgeRelationType;
  reason: string;
  evidence: string;
  sourceArticleIds: string[];
  sourceHashes: Record<string, string>;
  confidence: 'low' | 'medium' | 'high';
  reviewStatus: ReviewStatus;
  createdAt: number;
  updatedAt: number;
}

export type CandidateType = 'knowledge_point' | 'framework' | 'relation';

export interface ReviewCandidate {
  id: string;
  type: CandidateType;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  sourceArticleIds: string[];
  evidence: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: number;
  resolvedAt?: number;
}

export type InteractionEventType =
  | 'framework_view'
  | 'source_open'
  | 'search_open'
  | 'graph_focus'
  | 'relation_create'
  | 'framework_pin'
  | 'framework_suppress';

export interface InteractionEvent {
  id: string;
  type: InteractionEventType;
  entityType: KnowledgeEntityType | 'article';
  entityId: string;
  createdAt: number;
}

export interface GraphViewState {
  x: number;
  y: number;
  zoom: number;
  mode: 'global' | 'focus';
  focusId?: string;
  focusType?: KnowledgeEntityType;
  selectedId?: string;
  selectedType?: KnowledgeEntityType;
  filterTags: string[];
  showSignals: boolean;
  positions: Record<string, { x: number; y: number }>;
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

export type ViewMode = 'home' | 'graph' | 'articles' | 'review';

// ─── Agent 接入（MCP）───────────────────────────────

/** agent 可被授予的权限范围 */
export type AgentScope = 'read' | 'create' | 'edit' | 'delete' | 'organize' | 'sync';

/** 本地保存的令牌元数据（不含明文，明文仅生成时显示一次） */
export interface AgentTokenMeta {
  id: string;               // token_hash 前 8 位，用于展示/吊销
  label: string;
  scopes: AgentScope[];
  createdAt: number;
  lastUsedAt?: number;
}

/** 从后端队列取到的一条 agent 请求 */
export interface AgentRequest {
  id: string;               // requestId
  tool: string;             // e.g. kb.create_knowledge_point
  scope: AgentScope;
  params: Record<string, unknown>;
  createdAt: number;
}

/** 写操作 → 待你审批的提案 */
export interface AgentProposal extends AgentRequest {
  summary: string;          // 人话描述，如「新建知识点『上下文工程』」
}
