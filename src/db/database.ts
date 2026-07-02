import Dexie, { type EntityTable } from 'dexie'
import type {
  Article,
  Category,
  Conversation,
  Fragment,
  Insight,
  KnowledgePoint,
  LinkSuggestion,
  Message,
  Tag,
} from '../types'

// ─── Dexie Database ────────────────────────────────

class LearningToolsDB extends Dexie {
  knowledgePoints!: EntityTable<KnowledgePoint, 'id'>
  articles!: EntityTable<Article, 'id'>
  tags!: EntityTable<Tag, 'id'>
  categories!: EntityTable<Category, 'id'>
  fragments!: EntityTable<Fragment, 'id'>
  conversations!: EntityTable<Conversation, 'id'>
  messages!: EntityTable<Message, 'id'>
  linkSuggestions!: EntityTable<LinkSuggestion, 'id'>
  insights!: EntityTable<Insight, 'id'>

  constructor() {
    super('learningtools')

    this.version(1).stores({
      knowledgePoints: 'id, parentId, *tags, updatedAt',
      articles: 'id, categoryId, readDate, *tags, *knowledgePoints',
      tags: 'id, name',
      categories: 'id, name',
      fragments: 'id, sourceId, sourceType, *keywords, createdAt',
      conversations: 'id, contextType, contextId, createdAt',
      messages: 'id, conversationId, role, createdAt',
      linkSuggestions: 'id, fromId, toId, status, createdAt',
      insights: 'id, type, status, createdAt',
    })
  }
}

export const db = new LearningToolsDB()

// ─── localStorage → Dexie 迁移 ────────────────────

const LS_KEY = 'learningtools.storage.v1'
const MIGRATED_KEY = 'learningtools.migrated'

export async function migrateFromLocalStorage() {
  if (typeof window === 'undefined') return
  if (window.localStorage.getItem(MIGRATED_KEY) === 'true') return

  const raw = window.localStorage.getItem(LS_KEY)
  if (!raw) {
    window.localStorage.setItem(MIGRATED_KEY, 'true')
    return
  }

  try {
    const data = JSON.parse(raw) as {
      knowledgePoints?: KnowledgePoint[]
      articles?: Article[]
      tags?: Tag[]
      categories?: Category[]
    }

    await db.transaction(
      'rw',
      [db.knowledgePoints, db.articles, db.tags, db.categories],
      async () => {
        if (data.knowledgePoints?.length) {
          await db.knowledgePoints.bulkPut(data.knowledgePoints)
        }
        if (data.articles?.length) {
          await db.articles.bulkPut(data.articles)
        }
        if (data.tags?.length) {
          await db.tags.bulkPut(data.tags)
        }
        if (data.categories?.length) {
          await db.categories.bulkPut(data.categories)
        }
      },
    )

    window.localStorage.setItem(MIGRATED_KEY, 'true')
  } catch (err) {
    console.error('[migration] Failed to migrate from localStorage:', err)
  }
}

// ─── 排序工具 ──────────────────────────────────────

function sortKPByCreated(items: KnowledgePoint[]) {
  return [...items].sort((a, b) => a.createdAt - b.createdAt)
}

function sortArticlesByDate(items: Article[]) {
  return [...items].sort((a, b) => b.readDate.localeCompare(a.readDate))
}

function sortCategoriesByOrder(items: Category[]) {
  return [...items].sort((a, b) => a.order - b.order)
}

// ─── 双向链接同步 ──────────────────────────────────

async function syncBidirectionalLinks(
  sourceId: string,
  desiredLinkedIds: string[],
) {
  const desiredSet = new Set(desiredLinkedIds)
  const allKPs = await db.knowledgePoints.toArray()

  const updates: KnowledgePoint[] = []
  for (const point of allKPs) {
    if (point.id === sourceId) continue

    const alreadyLinked = point.linkedPoints.includes(sourceId)
    const shouldBeLinked = desiredSet.has(point.id)

    if (shouldBeLinked && !alreadyLinked) {
      updates.push({
        ...point,
        linkedPoints: [...point.linkedPoints, sourceId],
        updatedAt: Date.now(),
      })
    } else if (!shouldBeLinked && alreadyLinked) {
      updates.push({
        ...point,
        linkedPoints: point.linkedPoints.filter((id) => id !== sourceId),
        updatedAt: Date.now(),
      })
    }
  }

  if (updates.length) {
    await db.knowledgePoints.bulkPut(updates)
  }
}

// ─── KnowledgePoint CRUD ──────────────────────────

export async function listKnowledgePoints() {
  const items = await db.knowledgePoints.toArray()
  return sortKPByCreated(items)
}

export async function saveKnowledgePoint(point: KnowledgePoint) {
  const updated = { ...point, updatedAt: Date.now() }
  await db.knowledgePoints.put(updated)
  await syncBidirectionalLinks(point.id, point.linkedPoints)
}

export async function deleteKnowledgePoint(id: string) {
  await db.transaction('rw', [db.knowledgePoints, db.articles], async () => {
    await db.knowledgePoints.delete(id)

    // 清理其他 KP 的反向链接
    const linked = await db.knowledgePoints
      .filter((kp) => kp.linkedPoints.includes(id))
      .toArray()
    for (const kp of linked) {
      await db.knowledgePoints.update(kp.id, {
        linkedPoints: kp.linkedPoints.filter((lid) => lid !== id),
        updatedAt: Date.now(),
      })
    }

    // 清理 Article 关联
    const arts = await db.articles
      .filter((a) => a.knowledgePoints.includes(id))
      .toArray()
    for (const a of arts) {
      await db.articles.update(a.id, {
        knowledgePoints: a.knowledgePoints.filter((kid) => kid !== id),
      })
    }
  })
}

// ─── Article CRUD ─────────────────────────────────

export async function listArticles() {
  const items = await db.articles.toArray()
  return sortArticlesByDate(items)
}

export async function saveArticle(article: Article) {
  await db.articles.put(article)
}

export async function deleteArticle(id: string) {
  await db.articles.delete(id)
}

// ─── Tag CRUD ─────────────────────────────────────

export async function listTags() {
  return db.tags.toArray()
}

export async function getTagMap(): Promise<Map<string, Tag>> {
  const tags = await listTags()
  return new Map(tags.map((t) => [t.id, t]))
}

export async function saveTag(tag: Tag) {
  await db.tags.put(tag)
}

export async function deleteTag(id: string) {
  await db.transaction(
    'rw',
    [db.tags, db.knowledgePoints, db.articles],
    async () => {
      await db.tags.delete(id)

      const kps = await db.knowledgePoints
        .filter((kp) => kp.tags.includes(id))
        .toArray()
      for (const kp of kps) {
        await db.knowledgePoints.update(kp.id, {
          tags: kp.tags.filter((t) => t !== id),
        })
      }

      const arts = await db.articles
        .filter((a) => a.tags.includes(id))
        .toArray()
      for (const a of arts) {
        await db.articles.update(a.id, {
          tags: a.tags.filter((t) => t !== id),
        })
      }
    },
  )
}

// ─── Category CRUD ────────────────────────────────

export async function listCategories() {
  const items = await db.categories.toArray()
  return sortCategoriesByOrder(items)
}

export async function getCategoryMap(): Promise<Map<string, Category>> {
  const cats = await listCategories()
  return new Map(cats.map((c) => [c.id, c]))
}

export async function saveCategory(category: Category) {
  await db.categories.put(category)
}

export async function deleteCategory(id: string) {
  await db.transaction('rw', [db.categories, db.articles], async () => {
    await db.categories.delete(id)
    const arts = await db.articles
      .filter((a) => a.categoryId === id)
      .toArray()
    for (const a of arts) {
      await db.articles.update(a.id, { categoryId: '' })
    }
  })
}

// ─── V2: Fragment CRUD ────────────────────────────

export async function listFragments() {
  return db.fragments.toArray()
}

export async function saveFragment(fragment: Fragment) {
  await db.fragments.put(fragment)
}

export async function bulkSaveFragments(fragments: Fragment[]) {
  await db.fragments.bulkPut(fragments)
}

export async function deleteFragmentsBySource(sourceId: string) {
  await db.fragments.where('sourceId').equals(sourceId).delete()
}

// ─── V2: Conversation & Message CRUD ──────────────

export async function listConversations() {
  return db.conversations.orderBy('createdAt').reverse().toArray()
}

export async function saveConversation(conv: Conversation) {
  await db.conversations.put(conv)
}

export async function listMessagesByConversation(conversationId: string) {
  return db.messages
    .where('conversationId')
    .equals(conversationId)
    .sortBy('createdAt')
}

export async function saveMessage(msg: Message) {
  await db.messages.put(msg)
}

// ─── V2: LinkSuggestion CRUD ──────────────────────

export async function listLinkSuggestions(status?: string) {
  if (status) {
    return db.linkSuggestions.where('status').equals(status).toArray()
  }
  return db.linkSuggestions.toArray()
}

export async function saveLinkSuggestion(suggestion: LinkSuggestion) {
  await db.linkSuggestions.put(suggestion)
}

export async function bulkSaveLinkSuggestions(suggestions: LinkSuggestion[]) {
  await db.linkSuggestions.bulkPut(suggestions)
}

// ─── V2: Insight CRUD ─────────────────────────────

export async function listInsights(status?: string) {
  if (status) {
    return db.insights.where('status').equals(status).toArray()
  }
  return db.insights.toArray()
}

export async function saveInsight(insight: Insight) {
  await db.insights.put(insight)
}

export async function bulkSaveInsights(insights: Insight[]) {
  await db.insights.bulkPut(insights)
}

export async function markInsightRead(id: string) {
  await db.insights.update(id, { status: 'read' })
}

// ─── 导入导出 ──────────────────────────────────────

export async function exportAll() {
  const [knowledgePoints, articles, tags, categories] = await Promise.all([
    listKnowledgePoints(),
    listArticles(),
    listTags(),
    listCategories(),
  ])
  return { knowledgePoints, articles, tags, categories, exportedAt: new Date().toISOString() }
}

export async function importAll(data: {
  knowledgePoints?: KnowledgePoint[]
  articles?: Article[]
  tags?: Tag[]
  categories?: Category[]
}) {
  await db.transaction(
    'rw',
    [db.knowledgePoints, db.articles, db.tags, db.categories],
    async () => {
      await db.knowledgePoints.clear()
      await db.articles.clear()
      await db.tags.clear()
      await db.categories.clear()
      if (data.knowledgePoints) await db.knowledgePoints.bulkPut(data.knowledgePoints)
      if (data.articles) await db.articles.bulkPut(data.articles)
      if (data.tags) await db.tags.bulkPut(data.tags)
      if (data.categories) await db.categories.bulkPut(data.categories)
    },
  )
}

// ─── Demo seed ────────────────────────────────────

export async function seedDemo() {
  const count = await db.knowledgePoints.count()
  if (count > 0) return

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
    { id: 'kp1', title: '事件循环', content: '<p>JavaScript 是单线程语言，通过事件循环机制处理异步操作。</p>', tags: ['t1'], linkedPoints: ['kp2'], createdAt: now, updatedAt: now },
    { id: 'kp2', title: 'Promise & async/await', content: '<p>Promise 是异步操作的包装对象，async/await 是其语法糖。</p>', tags: ['t1', 't2'], linkedPoints: ['kp1', 'kp3'], createdAt: now, updatedAt: now },
    { id: 'kp3', title: 'React 渲染机制', content: '<p>React 使用虚拟 DOM + Diff 算法优化渲染性能。</p>', tags: ['t2'], linkedPoints: ['kp2', 'kp4'], createdAt: now, updatedAt: now },
    { id: 'kp4', title: 'CSS Flexbox', content: '<p>Flexbox 是一维布局模型，用于行或列的排版。</p>', tags: ['t3'], linkedPoints: ['kp5'], createdAt: now, updatedAt: now },
    { id: 'kp5', title: '时间复杂度', content: '<p>时间复杂度描述算法执行时间随输入规模增长的趋势，常用 Big-O 表示。</p>', tags: ['t4'], linkedPoints: ['kp4'], createdAt: now, updatedAt: now },
    { id: 'kp6', title: '负载均衡', content: '<p>负载均衡将流量分发到多台服务器，提高系统可用性和吞吐量。</p>', tags: ['t5'], linkedPoints: [], createdAt: now, updatedAt: now },
  ]
  const today = new Date()
  const daysAgo = (d: number) => { const v = new Date(today); v.setDate(v.getDate() - d); return v.toISOString().slice(0, 10) }
  const articles: Article[] = [
    { id: 'a1', title: '深入理解 Event Loop', url: 'https://example.com/event-loop', summary: '详细讲解浏览器和 Node.js 的事件循环差异', notes: '', categoryId: 'c1', tags: ['t1'], knowledgePoints: ['kp1'], readDate: daysAgo(0), createdAt: now },
    { id: 'a2', title: 'React 18 新特性解析', url: 'https://example.com/react18', summary: '并发模式、自动批处理等新特性', notes: '', categoryId: 'c1', tags: ['t2'], knowledgePoints: ['kp3'], readDate: daysAgo(1), createdAt: now },
    { id: 'a3', title: 'CSS Grid vs Flexbox', url: 'https://example.com/css-layout', summary: '两种布局方案的适用场景对比', notes: '', categoryId: 'c1', tags: ['t3'], knowledgePoints: ['kp4'], readDate: daysAgo(2), createdAt: now },
    { id: 'a4', title: '排序算法大全', url: 'https://example.com/sorting', summary: '快排、归并排序等经典算法', notes: '', categoryId: 'c2', tags: ['t4'], knowledgePoints: ['kp5'], readDate: daysAgo(1), createdAt: now },
    { id: 'a5', title: '系统设计入门指南', url: 'https://example.com/system-design', summary: 'CAP 定理、分布式系统基础', notes: '', categoryId: 'c3', tags: ['t5'], knowledgePoints: ['kp6'], readDate: daysAgo(3), createdAt: now },
    { id: 'a6', title: 'async/await 最佳实践', url: 'https://example.com/async', summary: '错误处理、并行执行技巧', notes: '', categoryId: 'c1', tags: ['t1', 't2'], knowledgePoints: ['kp2'], readDate: daysAgo(4), createdAt: now },
  ]

  await db.transaction('rw', [db.knowledgePoints, db.articles, db.tags, db.categories], async () => {
    await db.tags.bulkPut(tags)
    await db.categories.bulkPut(categories)
    await db.knowledgePoints.bulkPut(knowledgePoints)
    await db.articles.bulkPut(articles)
  })
}
