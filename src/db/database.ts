import type {
  Article,
  Category,
  Conversation,
  Fragment,
  FrameworkCard,
  GraphViewState,
  Insight,
  InteractionEvent,
  KnowledgePoint,
  KnowledgeRelation,
  RelationAnalysisJob,
  RelationFeedbackPattern,
  LinkSuggestion,
  Message,
  ReviewCandidate,
  Scene,
  Tag,
} from '../types'

const STORAGE_KEY = 'learningtools.storage.v2'
const STORAGE_KEY_V3 = 'learningtools.storage.v3'

export type PersistedState = {
  schemaVersion: 4
  knowledgePoints: KnowledgePoint[]
  articles: Article[]
  tags: Tag[]
  categories: Category[]
  scenes: Scene[]
  frameworks: FrameworkCard[]
  relations: KnowledgeRelation[]
  relationAnalysisJobs: RelationAnalysisJob[]
  relationFeedbackPatterns: RelationFeedbackPattern[]
  candidates: ReviewCandidate[]
  interactionEvents: InteractionEvent[]
  fragments: Fragment[]
  conversations: Conversation[]
  messages: Message[]
  insights: Insight[]
  linkSuggestions: LinkSuggestion[]
  graphViewState?: GraphViewState
}

const DEFAULT_STATE: PersistedState = {
  schemaVersion: 4,
  knowledgePoints: [],
  articles: [],
  tags: [],
  categories: [],
  scenes: [],
  frameworks: [],
  relations: [],
  relationAnalysisJobs: [],
  relationFeedbackPatterns: [],
  candidates: [],
  interactionEvents: [],
  fragments: [],
  conversations: [],
  messages: [],
  insights: [],
  linkSuggestions: [],
}

function readState(): PersistedState {
  if (typeof window === 'undefined') {
    return DEFAULT_STATE
  }

  const raw = window.localStorage.getItem(STORAGE_KEY_V3)
    ?? window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return DEFAULT_STATE
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    const migrated: PersistedState = {
      schemaVersion: 4,
      knowledgePoints: parsed.knowledgePoints ?? [],
      articles: (parsed.articles ?? []).map((article) => ({
        ...article,
        provenanceRole: article.provenanceRole ?? 'unknown',
        reviewStatus: article.reviewStatus ?? 'reviewed',
        updatedAt: article.updatedAt ?? article.createdAt,
      })),
      tags: parsed.tags ?? [],
      categories: parsed.categories ?? [],
      scenes: parsed.scenes ?? [],
      frameworks: parsed.frameworks ?? [],
      relations: parsed.relations ?? migrateLinkedRelations(parsed.knowledgePoints ?? []),
      relationAnalysisJobs: parsed.relationAnalysisJobs ?? [],
      relationFeedbackPatterns: parsed.relationFeedbackPatterns ?? [],
      candidates: parsed.candidates ?? [],
      interactionEvents: parsed.interactionEvents ?? [],
      fragments: parsed.fragments ?? [],
      conversations: parsed.conversations ?? [],
      messages: parsed.messages ?? [],
      insights: parsed.insights ?? [],
      linkSuggestions: parsed.linkSuggestions ?? [],
      graphViewState: parsed.graphViewState,
    }
    if (!window.localStorage.getItem(STORAGE_KEY_V3)) writeState(migrated)
    return migrated
  } catch {
    return DEFAULT_STATE
  }
}

function writeState(state: PersistedState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY_V3, JSON.stringify(state))
}

function migrateLinkedRelations(points: KnowledgePoint[]): KnowledgeRelation[] {
  const now = Date.now()
  const seen = new Set<string>()
  const relations: KnowledgeRelation[] = []
  for (const point of points) {
    for (const targetId of point.linkedPoints ?? []) {
      const key = [point.id, targetId].sort().join('|')
      if (seen.has(key) || !points.some((item) => item.id === targetId)) continue
      seen.add(key)
      relations.push({
        id: `migrated-${key}`,
        fromType: 'knowledge_point',
        fromId: point.id,
        toType: 'knowledge_point',
        toId: targetId,
        type: 'related_to',
        reason: '由旧版无类型关联迁移，等待补充语义',
        evidence: '',
        sourceArticleIds: [],
        sourceHashes: {},
        confidence: 'low',
        reviewStatus: 'needs_review',
        createdBy: 'migration',
        createdAt: now,
        updatedAt: now,
      })
    }
  }
  return relations
}

function updateState(
  updater: (state: PersistedState) => PersistedState,
): PersistedState {
  const next = updater(readState())
  writeState(next)
  return next
}

function sortKnowledgePoints(items: KnowledgePoint[]) {
  return [...items].sort((left, right) => left.createdAt - right.createdAt)
}

function sortArticles(items: Article[]) {
  return [...items].sort((left, right) =>
    right.readDate.localeCompare(left.readDate),
  )
}

function sortCategories(items: Category[]) {
  return [...items].sort((left, right) => left.order - right.order)
}

function syncBidirectionalLinks(
  knowledgePoints: KnowledgePoint[],
  sourceId: string,
  desiredLinkedIds: string[],
) {
  const desiredSet = new Set(desiredLinkedIds)

  return knowledgePoints.map((point) => {
    if (point.id === sourceId) {
      return point
    }

    const alreadyLinked = point.linkedPoints.includes(sourceId)
    const shouldBeLinked = desiredSet.has(point.id)

    if (shouldBeLinked && !alreadyLinked) {
      return {
        ...point,
        linkedPoints: [...point.linkedPoints, sourceId],
        updatedAt: Date.now(),
      }
    }

    if (!shouldBeLinked && alreadyLinked) {
      return {
        ...point,
        linkedPoints: point.linkedPoints.filter((id) => id !== sourceId),
        updatedAt: Date.now(),
      }
    }

    return point
  })
}

export async function listKnowledgePoints() {
  return sortKnowledgePoints(readState().knowledgePoints)
}

export async function listArticles() {
  return sortArticles(readState().articles)
}

export async function listTags() {
  return [...readState().tags]
}

export async function listCategories() {
  return sortCategories(readState().categories)
}

export async function listFrameworks() {
  return [...readState().frameworks]
    .filter((item) => item.reviewStatus !== 'archived')
    .sort((left, right) => right.score - left.score)
}

export async function listRelations() {
  return [...readState().relations]
}

export async function listRelationAnalysisJobs() {
  return [...readState().relationAnalysisJobs]
}

export async function listRelationFeedbackPatterns() {
  return [...readState().relationFeedbackPatterns]
}

export async function listCandidates(status?: ReviewCandidate['status']) {
  const items = readState().candidates
  return status ? items.filter((item) => item.status === status) : [...items]
}

export async function listInteractionEvents() {
  return [...readState().interactionEvents]
}

export async function listFragments() {
  return [...readState().fragments]
}

export async function listConversations() {
  return [...readState().conversations]
}

export async function listMessages(conversationId?: string) {
  const items = readState().messages
  return items
    .filter((item) => !conversationId || item.conversationId === conversationId)
    .sort((left, right) => left.createdAt - right.createdAt)
}

export async function getGraphViewState() {
  return readState().graphViewState
}

export async function getTagMap(): Promise<Map<string, Tag>> {
  const tags = await listTags()
  return new Map(tags.map((tag) => [tag.id, tag]))
}

export async function getCategoryMap(): Promise<Map<string, Category>> {
  const categories = await listCategories()
  return new Map(categories.map((category) => [category.id, category]))
}

export async function saveKnowledgePoint(point: KnowledgePoint) {
  updateState((state) => {
    const withoutCurrent = state.knowledgePoints.filter(
      (item) => item.id !== point.id,
    )
    const syncedOthers = syncBidirectionalLinks(
      withoutCurrent,
      point.id,
      point.linkedPoints,
    )

    return {
      ...state,
      knowledgePoints: sortKnowledgePoints([
        ...syncedOthers,
        {
          ...point,
          updatedAt: Date.now(),
        },
      ]),
    }
  })
}

export async function deleteKnowledgePoint(id: string) {
  updateState((state) => ({
    ...state,
    knowledgePoints: state.knowledgePoints
      .filter((point) => point.id !== id)
      .map((point) => ({
        ...point,
        linkedPoints: point.linkedPoints.filter((linkedId) => linkedId !== id),
        updatedAt: point.linkedPoints.includes(id)
          ? Date.now()
          : point.updatedAt,
      })),
    articles: state.articles.map((article) => ({
      ...article,
      knowledgePoints: article.knowledgePoints.filter((pointId) => pointId !== id),
    })),
  }))
}

export async function saveArticle(article: Article) {
  const nextArticle = {
    ...article,
    provenanceRole: article.provenanceRole ?? 'unknown',
    reviewStatus: article.reviewStatus ?? 'reviewed',
    sourceHash: hashSource(article),
    updatedAt: Date.now(),
  }
  updateState((state) => ({
    ...state,
    articles: sortArticles([
      ...state.articles.filter((item) => item.id !== article.id),
      nextArticle,
    ]),
    relations: state.relations.map((relation) => {
      if (!relation.sourceArticleIds.includes(article.id)) return relation
      const recordedHash = relation.sourceHashes[article.id]
      if (!recordedHash || recordedHash === nextArticle.sourceHash) return relation
      return {
        ...relation,
        reviewStatus: 'needs_review' as const,
        updatedAt: Date.now(),
      }
    }),
  }))
}

function hashSource(article: Pick<Article, 'title' | 'summary' | 'notes' | 'url'>) {
  const value = [article.title, article.summary, article.notes, article.url].join('\u0000')
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export async function saveFramework(framework: FrameworkCard) {
  updateState((state) => ({
    ...state,
    frameworks: [
      ...state.frameworks.filter((item) => item.id !== framework.id),
      { ...framework, updatedAt: Date.now() },
    ],
  }))
}

export async function deleteFramework(id: string) {
  updateState((state) => ({
    ...state,
    frameworks: state.frameworks.filter((item) => item.id !== id),
    relations: state.relations.filter((relation) =>
      !((relation.fromType === 'framework' && relation.fromId === id)
        || (relation.toType === 'framework' && relation.toId === id))),
  }))
}

export async function saveRelation(relation: KnowledgeRelation) {
  updateState((state) => ({
    ...state,
    relations: [
      ...state.relations.filter((item) => item.id !== relation.id),
      { ...relation, updatedAt: Date.now() },
    ],
  }))
}

export async function saveRelations(relations: KnowledgeRelation[]) {
  updateState((state) => {
    const ids = new Set(relations.map((item) => item.id))
    return {
      ...state,
      relations: [
        ...state.relations.filter((item) => !ids.has(item.id)),
        ...relations.map((item) => ({ ...item, updatedAt: Date.now() })),
      ],
    }
  })
}

export async function saveRelationAnalysisJob(job: RelationAnalysisJob) {
  updateState((state) => ({
    ...state,
    relationAnalysisJobs: [
      ...state.relationAnalysisJobs.filter((item) => item.id !== job.id),
      job,
    ],
  }))
}

export async function saveRelationFeedbackPattern(pattern: RelationFeedbackPattern) {
  updateState((state) => ({
    ...state,
    relationFeedbackPatterns: [
      ...state.relationFeedbackPatterns.filter((item) => item.id !== pattern.id),
      pattern,
    ],
  }))
}

export async function deleteRelation(id: string) {
  updateState((state) => ({
    ...state,
    relations: state.relations.filter((item) => item.id !== id),
  }))
}

export async function saveCandidate(candidate: ReviewCandidate) {
  updateState((state) => ({
    ...state,
    candidates: [
      ...state.candidates.filter((item) => item.id !== candidate.id),
      candidate,
    ],
  }))
}

export async function saveCandidates(candidates: ReviewCandidate[]) {
  updateState((state) => {
    const ids = new Set(candidates.map((item) => item.id))
    return {
      ...state,
      candidates: [
        ...state.candidates.filter((item) => !ids.has(item.id)),
        ...candidates,
      ],
    }
  })
}

export async function recordInteraction(event: InteractionEvent) {
  updateState((state) => ({
    ...state,
    interactionEvents: [...state.interactionEvents, event].slice(-2000),
  }))
}

export async function saveGraphViewState(graphViewState: GraphViewState) {
  updateState((state) => ({ ...state, graphViewState }))
}

export async function saveConversation(conversation: Conversation) {
  updateState((state) => ({
    ...state,
    conversations: [
      ...state.conversations.filter((item) => item.id !== conversation.id),
      conversation,
    ],
  }))
}

export async function saveMessage(message: Message) {
  updateState((state) => ({
    ...state,
    messages: [
      ...state.messages.filter((item) => item.id !== message.id),
      message,
    ],
  }))
}

export async function deleteArticle(id: string) {
  updateState((state) => ({
    ...state,
    articles: state.articles.filter((article) => article.id !== id),
  }))
}

export async function saveTag(tag: Tag) {
  updateState((state) => ({
    ...state,
    tags: [...state.tags.filter((item) => item.id !== tag.id), tag],
  }))
}

export async function deleteTag(id: string) {
  updateState((state) => ({
    ...state,
    tags: state.tags.filter((tag) => tag.id !== id),
    knowledgePoints: state.knowledgePoints.map((point) => ({
      ...point,
      tags: point.tags.filter((tagId) => tagId !== id),
    })),
    articles: state.articles.map((article) => ({
      ...article,
      tags: article.tags.filter((tagId) => tagId !== id),
    })),
  }))
}

export async function saveCategory(category: Category) {
  updateState((state) => ({
    ...state,
    categories: sortCategories([
      ...state.categories.filter((item) => item.id !== category.id),
      category,
    ]),
  }))
}

export async function deleteCategory(id: string) {
  updateState((state) => ({
    ...state,
    categories: state.categories.filter((category) => category.id !== id),
    articles: state.articles.map((article) =>
      article.categoryId === id ? { ...article, categoryId: '' } : article,
    ),
  }))
}

export async function exportAll() {
  return {
    ...readState(),
    exportedAt: new Date().toISOString(),
  }
}

export async function importAll(
  data: ReturnType<typeof exportAll> extends Promise<infer T> ? T : never,
) {
  const incoming = data as Partial<PersistedState>
  writeState({
    schemaVersion: 4,
    knowledgePoints: data.knowledgePoints ?? [],
    articles: (data.articles ?? []).map((article) => ({
      ...article,
      provenanceRole: article.provenanceRole ?? 'unknown',
      reviewStatus: article.reviewStatus ?? 'reviewed',
      updatedAt: article.updatedAt ?? article.createdAt,
    })),
    tags: data.tags ?? [],
    categories: data.categories ?? [],
    scenes: (data as Record<string, unknown>).scenes as PersistedState['scenes'] ?? [],
    frameworks: incoming.frameworks ?? [],
    relations: incoming.relations ?? migrateLinkedRelations(data.knowledgePoints ?? []),
    relationAnalysisJobs: incoming.relationAnalysisJobs ?? [],
    relationFeedbackPatterns: incoming.relationFeedbackPatterns ?? [],
    candidates: incoming.candidates ?? [],
    interactionEvents: incoming.interactionEvents ?? [],
    fragments: incoming.fragments ?? [],
    conversations: incoming.conversations ?? [],
    messages: incoming.messages ?? [],
    insights: incoming.insights ?? [],
    linkSuggestions: incoming.linkSuggestions ?? [],
    graphViewState: incoming.graphViewState,
  })
}

export async function seedDemo() {
  const state = readState()
  if (state.knowledgePoints.length > 0) {
    return
  }

  const now = Date.now()
  const tags: Tag[] = [
    { id: 't1', name: 'JavaScript', color: '#E8A87C' },
    { id: 't2', name: 'React', color: '#85B7A7' },
    { id: 't3', name: 'CSS', color: '#8AACB8' },
    { id: 't4', name: '算法', color: '#D9534F' },
    { id: 't5', name: '系统设计', color: '#C7A4C0' },
  ]
  const categories: Category[] = [
    { id: 'c1', name: '前端技术', order: 0 },
    { id: 'c2', name: '算法与数据结构', order: 1 },
    { id: 'c3', name: '系统设计', order: 2 },
  ]
  const knowledgePoints: KnowledgePoint[] = [
    {
      id: 'kp1',
      title: '事件循环',
      content:
        '<p>JavaScript 是单线程语言，通过事件循环机制处理异步操作。</p>',
      tags: ['t1'],
      linkedPoints: ['kp2'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kp2',
      title: 'Promise & async/await',
      content:
        '<p>Promise 是异步操作的包装对象，async/await 是其语法糖。</p>',
      tags: ['t1', 't2'],
      linkedPoints: ['kp1', 'kp3'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kp3',
      title: 'React 渲染机制',
      content: '<p>React 使用虚拟 DOM + Diff 算法优化渲染性能。</p>',
      tags: ['t2'],
      linkedPoints: ['kp2', 'kp4'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kp4',
      title: 'CSS Flexbox',
      content: '<p>Flexbox 是一维布局模型，用于行或列的排版。</p>',
      tags: ['t3'],
      linkedPoints: ['kp5'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kp5',
      title: '时间复杂度',
      content:
        '<p>时间复杂度描述算法执行时间随输入规模增长的趋势，常用 Big-O 表示。</p>',
      tags: ['t4'],
      linkedPoints: ['kp4'],
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'kp6',
      title: '负载均衡',
      content:
        '<p>负载均衡将流量分发到多台服务器，提高系统可用性和吞吐量。</p>',
      tags: ['t5'],
      linkedPoints: [],
      createdAt: now,
      updatedAt: now,
    },
  ]
  const today = new Date()
  const formatDate = (value: Date) => value.toISOString().slice(0, 10)
  const daysAgo = (distance: number) => {
    const value = new Date(today)
    value.setDate(value.getDate() - distance)
    return formatDate(value)
  }
  const articles: Article[] = [
    {
      id: 'a1',
      title: '深入理解 Event Loop',
      url: 'https://example.com/event-loop',
      summary: '详细讲解浏览器和 Node.js 的事件循环差异',
      notes: '',
      categoryId: 'c1',
      tags: ['t1'],
      knowledgePoints: ['kp1'],
      readDate: daysAgo(0),
      createdAt: now,
    },
    {
      id: 'a2',
      title: 'React 18 新特性解析',
      url: 'https://example.com/react18',
      summary: '并发模式、自动批处理等新特性',
      notes: '',
      categoryId: 'c1',
      tags: ['t2'],
      knowledgePoints: ['kp3'],
      readDate: daysAgo(1),
      createdAt: now,
    },
    {
      id: 'a3',
      title: 'CSS Grid vs Flexbox',
      url: 'https://example.com/css-layout',
      summary: '两种布局方案的适用场景对比',
      notes: '',
      categoryId: 'c1',
      tags: ['t3'],
      knowledgePoints: ['kp4'],
      readDate: daysAgo(2),
      createdAt: now,
    },
    {
      id: 'a4',
      title: '排序算法大全',
      url: 'https://example.com/sorting',
      summary: '快排、归并排序等经典算法',
      notes: '',
      categoryId: 'c2',
      tags: ['t4'],
      knowledgePoints: ['kp5'],
      readDate: daysAgo(1),
      createdAt: now,
    },
    {
      id: 'a5',
      title: '系统设计入门指南',
      url: 'https://example.com/system-design',
      summary: 'CAP 定理、分布式系统基础',
      notes: '',
      categoryId: 'c3',
      tags: ['t5'],
      knowledgePoints: ['kp6'],
      readDate: daysAgo(3),
      createdAt: now,
    },
    {
      id: 'a6',
      title: 'async/await 最佳实践',
      url: 'https://example.com/async',
      summary: '错误处理、并行执行技巧',
      notes: '',
      categoryId: 'c1',
      tags: ['t1', 't2'],
      knowledgePoints: ['kp2'],
      readDate: daysAgo(4),
      createdAt: now,
    },
  ]

  writeState({
    schemaVersion: 4,
    knowledgePoints,
    articles,
    tags,
    categories,
    scenes: [],
    frameworks: [],
    relations: migrateLinkedRelations(knowledgePoints),
    relationAnalysisJobs: [],
    relationFeedbackPatterns: [],
    candidates: [],
    interactionEvents: [],
    fragments: [],
    conversations: [],
    messages: [],
    insights: [],
    linkSuggestions: [],
  })
}

// ─── Scene CRUD ───

export async function listScenes() {
  return [...readState().scenes]
}

export async function saveScene(scene: Scene) {
  updateState((state) => ({
    ...state,
    scenes: [...state.scenes.filter((s) => s.id !== scene.id), scene],
  }))
}

export async function deleteScene(id: string) {
  updateState((state) => ({
    ...state,
    scenes: state.scenes.filter((s) => s.id !== id),
  }))
}

export async function bulkSaveFragments(fragments: Fragment[]) {
  updateState((state) => {
    const ids = new Set(fragments.map((item) => item.id))
    return {
      ...state,
      fragments: [
        ...state.fragments.filter((item) => !ids.has(item.id)),
        ...fragments,
      ],
    }
  })
}

export async function listInsights(): Promise<Insight[]> {
  return [...readState().insights]
}

export async function saveInsight(insight: Insight) {
  updateState((state) => ({
    ...state,
    insights: [
      ...state.insights.filter((item) => item.id !== insight.id),
      insight,
    ],
  }))
}

export async function markInsightRead(id: string) {
  updateState((state) => ({
    ...state,
    insights: state.insights.map((item) =>
      item.id === id ? { ...item, status: 'read' } : item),
  }))
}

export async function listLinkSuggestions(status?: string): Promise<LinkSuggestion[]> {
  const items = readState().linkSuggestions
  return status ? items.filter((item) => item.status === status) : [...items]
}

export async function saveLinkSuggestion(suggestion: LinkSuggestion) {
  updateState((state) => ({
    ...state,
    linkSuggestions: [
      ...state.linkSuggestions.filter((item) => item.id !== suggestion.id),
      suggestion,
    ],
  }))
}
