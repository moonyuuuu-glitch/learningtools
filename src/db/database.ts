import type { Article, Category, Insight, KnowledgePoint, LinkSuggestion, Scene, Tag } from '../types'

const STORAGE_KEY = 'learningtools.storage.v2'

type PersistedState = {
  knowledgePoints: KnowledgePoint[]
  articles: Article[]
  tags: Tag[]
  categories: Category[]
  scenes: Scene[]
}

const DEFAULT_STATE: PersistedState = {
  knowledgePoints: [],
  articles: [],
  tags: [],
  categories: [],
  scenes: [],
}

function readState(): PersistedState {
  if (typeof window === 'undefined') {
    return DEFAULT_STATE
  }

  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    return DEFAULT_STATE
  }

  try {
    const parsed = JSON.parse(raw) as Partial<PersistedState>
    return {
      knowledgePoints: parsed.knowledgePoints ?? [],
      articles: parsed.articles ?? [],
      tags: parsed.tags ?? [],
      categories: parsed.categories ?? [],
      scenes: parsed.scenes ?? [],
    }
  } catch {
    return DEFAULT_STATE
  }
}

function writeState(state: PersistedState) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
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
  updateState((state) => ({
    ...state,
    articles: sortArticles([
      ...state.articles.filter((item) => item.id !== article.id),
      article,
    ]),
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
  writeState({
    knowledgePoints: data.knowledgePoints ?? [],
    articles: data.articles ?? [],
    tags: data.tags ?? [],
    categories: data.categories ?? [],
    scenes: (data as Record<string, unknown>).scenes as PersistedState['scenes'] ?? [],
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
    knowledgePoints,
    articles,
    tags,
    categories,
    scenes: [],
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

// ─── V2 stubs (localStorage 版暂不支持，保持编译通过) ───

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = null

export async function bulkSaveFragments(_fragments: unknown[]) { /* noop */ }
export async function listInsights(): Promise<Insight[]> { return [] }
export async function markInsightRead(_id: string) { /* noop */ }
export async function listLinkSuggestions(_status?: string): Promise<LinkSuggestion[]> { return [] }
export async function saveLinkSuggestion(_suggestion: LinkSuggestion) { /* noop */ }
