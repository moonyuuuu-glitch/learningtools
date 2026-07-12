import Fuse from 'fuse.js'
import type { Article, Fragment, FrameworkCard, KnowledgePoint } from '../types'
import {
  listArticles,
  listFragments,
  listFrameworks,
  listKnowledgePoints,
} from '../db/database'

/**
 * 搜索引擎 — 纯脚本，不调 AI
 *
 * 基于 fuse.js 模糊搜索 + 关键词/标签重叠打分
 * 用于 RAG 召回：给定 query，返回 top-k 最相关的 Fragment
 */

export interface SearchResult {
  fragment: Fragment
  score: number
}

let _fuse: Fuse<Fragment> | null = null
let _fragmentCache: Fragment[] = []
let _cacheTime = 0
const CACHE_TTL = 30_000

async function getFuse(): Promise<{ fuse: Fuse<Fragment>; fragments: Fragment[] }> {
  const now = Date.now()
  if (_fuse && now - _cacheTime < CACHE_TTL) {
    return { fuse: _fuse, fragments: _fragmentCache }
  }

  _fragmentCache = await listFragments()
  _fuse = new Fuse(_fragmentCache, {
    keys: [
      { name: 'title', weight: 0.4 },
      { name: 'content', weight: 0.35 },
      { name: 'keywords', weight: 0.25 },
    ],
    threshold: 0.4,
    includeScore: true,
  })
  _cacheTime = now
  return { fuse: _fuse, fragments: _fragmentCache }
}

export function invalidateSearchCache() {
  _fuse = null
  _cacheTime = 0
}

/**
 * 模糊搜索 fragments
 */
export async function searchFragments(
  query: string,
  limit = 15,
): Promise<SearchResult[]> {
  const { fuse } = await getFuse()
  const results = fuse.search(query, { limit })
  return results.map((r) => ({
    fragment: r.item,
    score: 1 - (r.score ?? 1),
  }))
}

/**
 * 基于关键词重叠找候选关联 Fragment
 * 不用模糊搜索，纯精确匹配
 */
export async function findRelatedByKeywords(
  keywords: string[],
  excludeSourceId?: string,
  limit = 10,
): Promise<SearchResult[]> {
  const { fragments } = await getFuse()
  const targetSet = new Set(keywords.map((k) => k.toLowerCase()))

  const scored: SearchResult[] = []
  for (const f of fragments) {
    if (excludeSourceId && f.sourceId === excludeSourceId) continue

    let overlap = 0
    for (const kw of f.keywords) {
      if (targetSet.has(kw.toLowerCase())) overlap++
    }
    if (overlap === 0) continue

    scored.push({
      fragment: f,
      score: overlap / Math.max(targetSet.size, f.keywords.length, 1),
    })
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit)
}

/**
 * 基于标签重叠找相关 KnowledgePoint（直接从 KP 表查）
 */
export async function findRelatedKPsByTags(
  tags: string[],
  excludeId?: string,
  limit = 10,
): Promise<{ id: string; title: string; overlapCount: number }[]> {
  const tagSet = new Set(tags)
  const allKPs: KnowledgePoint[] = await listKnowledgePoints()

  return allKPs
    .filter((kp) => kp.id !== excludeId)
    .map((kp) => {
      const overlap = kp.tags.filter((t) => tagSet.has(t)).length
      return { id: kp.id, title: kp.title, overlapCount: overlap }
    })
    .filter((r) => r.overlapCount > 0)
    .sort((a, b) => b.overlapCount - a.overlapCount)
    .slice(0, limit)
}

export interface KnowledgeSearchResult {
  id: string
  type: 'article' | 'knowledge_point' | 'framework'
  title: string
  excerpt: string
  tags: string[]
  provenanceRole?: Article['provenanceRole']
  score: number
}

type SearchableKnowledge = {
  id: string
  type: KnowledgeSearchResult['type']
  title: string
  text: string
  tags: string[]
  provenanceRole?: Article['provenanceRole']
}

export async function searchKnowledge(
  query: string,
  options: {
    types?: KnowledgeSearchResult['type'][]
    tagIds?: string[]
    provenanceRole?: Article['provenanceRole']
    limit?: number
  } = {},
) {
  const [articles, points, frameworks]: [
    Article[],
    KnowledgePoint[],
    FrameworkCard[],
  ] = await Promise.all([
    listArticles(),
    listKnowledgePoints(),
    listFrameworks(),
  ])

  const corpus: SearchableKnowledge[] = [
    ...articles.map((article) => ({
      id: article.id,
      type: 'article' as const,
      title: article.title,
      text: [article.summary, article.notes].filter(Boolean).join('\n'),
      tags: article.tags,
      provenanceRole: article.provenanceRole,
    })),
    ...points.map((point): SearchableKnowledge => ({
      id: point.id,
      type: 'knowledge_point' as const,
      title: point.title,
      text: [point.summary, point.content, ...(point.aliases ?? [])]
        .filter(Boolean)
        .join('\n'),
      tags: point.tags,
    })),
    ...frameworks
      .filter((framework) => framework.reviewStatus === 'reviewed')
      .map((framework): SearchableKnowledge => ({
        id: framework.id,
        type: 'framework' as const,
        title: framework.title,
        text: [
          framework.problem,
          ...framework.steps,
          ...framework.useCases,
        ].join('\n'),
        tags: [],
      })),
  ].filter((item) => {
    if (options.types?.length && !options.types.includes(item.type)) return false
    if (
      options.provenanceRole
      && item.provenanceRole !== options.provenanceRole
    ) return false
    if (
      options.tagIds?.length
      && !options.tagIds.some((tagId) => item.tags.includes(tagId))
    ) return false
    return true
  })

  if (!query.trim()) {
    return corpus.slice(0, options.limit ?? 30).map((item) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      excerpt: item.text.slice(0, 140),
      tags: item.tags,
      provenanceRole: item.provenanceRole,
      score: 1,
    }))
  }

  const fuse = new Fuse(corpus, {
    keys: [
      { name: 'title', weight: 0.55 },
      { name: 'text', weight: 0.35 },
      { name: 'tags', weight: 0.1 },
    ],
    threshold: 0.4,
    includeScore: true,
  })
  return fuse.search(query, { limit: options.limit ?? 30 }).map((result) => ({
    id: result.item.id,
    type: result.item.type,
    title: result.item.title,
    excerpt: result.item.text.slice(0, 140),
    tags: result.item.tags,
    provenanceRole: result.item.provenanceRole,
    score: 1 - (result.score ?? 1),
  }))
}
