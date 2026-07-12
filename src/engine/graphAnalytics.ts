import type { Article, KnowledgePoint, Tag } from '../types'
import {
  listArticles,
  listKnowledgePoints,
  listTags,
} from '../db/database'

/**
 * 图谱分析引擎 — 纯计算，不调 AI
 *
 * 提供：孤岛检测、度数统计、长期未更新检测、主题簇发现
 */

export interface NodeStats {
  id: string
  title: string
  degree: number            // linkedPoints.length + articles 引用数
  tagCount: number
  daysSinceUpdate: number
  isIsland: boolean
}

export interface GraphReport {
  totalKPs: number
  totalArticles: number
  islands: NodeStats[]           // 没有任何关联的节点
  staleNodes: NodeStats[]        // 超过 staleDays 未更新的节点
  topConnected: NodeStats[]      // 连接最多的节点
  tagDistribution: { tag: string; count: number }[]
  orphanTags: string[]           // 有 Tag 但没有任何 KP/Article 使用
}

export async function analyzeGraph(staleDays = 14): Promise<GraphReport> {
  const [allKPs, allArticles, allTags]: [KnowledgePoint[], Article[], Tag[]] = await Promise.all([
    listKnowledgePoints(),
    listArticles(),
    listTags(),
  ])

  const now = Date.now()
  const msPerDay = 86_400_000

  // KP 被 Article 引用的次数
  const articleRefCount = new Map<string, number>()
  for (const art of allArticles) {
    for (const kpId of art.knowledgePoints) {
      articleRefCount.set(kpId, (articleRefCount.get(kpId) ?? 0) + 1)
    }
  }

  // 计算每个 KP 的统计
  const stats: NodeStats[] = allKPs.map((kp) => {
    const artRefs = articleRefCount.get(kp.id) ?? 0
    const degree = kp.linkedPoints.length + artRefs
    return {
      id: kp.id,
      title: kp.title,
      degree,
      tagCount: kp.tags.length,
      daysSinceUpdate: Math.floor((now - kp.updatedAt) / msPerDay),
      isIsland: degree === 0 && !kp.parentId,
    }
  })

  const islands = stats.filter((s) => s.isIsland)
  const staleNodes = stats.filter((s) => s.daysSinceUpdate >= staleDays)
  const topConnected = [...stats]
    .sort((a, b) => b.degree - a.degree)
    .slice(0, 10)

  // 标签分布
  const tagUsage = new Map<string, number>()
  for (const kp of allKPs) {
    for (const t of kp.tags) {
      tagUsage.set(t, (tagUsage.get(t) ?? 0) + 1)
    }
  }
  for (const art of allArticles) {
    for (const t of art.tags) {
      tagUsage.set(t, (tagUsage.get(t) ?? 0) + 1)
    }
  }

  const tagDistribution = [...tagUsage.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count)

  const orphanTags = allTags
    .filter((t) => !tagUsage.has(t.id))
    .map((t) => t.name)

  return {
    totalKPs: allKPs.length,
    totalArticles: allArticles.length,
    islands,
    staleNodes,
    topConnected,
    tagDistribution,
    orphanTags,
  }
}

/**
 * 找两个 KP 之间是否有路径（BFS）
 */
export async function findPath(
  fromId: string,
  toId: string,
): Promise<string[] | null> {
  const allKPs: KnowledgePoint[] = await listKnowledgePoints()
  const adj = new Map<string, string[]>()
  for (const kp of allKPs) {
    adj.set(kp.id, kp.linkedPoints)
  }

  const visited = new Set<string>()
  const queue: string[][] = [[fromId]]

  while (queue.length > 0) {
    const path = queue.shift()!
    const current = path[path.length - 1]

    if (current === toId) return path
    if (visited.has(current)) continue
    visited.add(current)

    const neighbors = adj.get(current) ?? []
    for (const next of neighbors) {
      if (!visited.has(next)) {
        queue.push([...path, next])
      }
    }
  }

  return null
}

/**
 * 候选关联生成 — 基于标签/关键词重叠（脚本第一轮召回）
 */
export async function findLinkCandidates(
  kpId: string,
  limit = 10,
): Promise<{ id: string; title: string; score: number; reason: string }[]> {
  const allKPs: KnowledgePoint[] = await listKnowledgePoints()
  const source = allKPs.find((kp) => kp.id === kpId)
  if (!source) return []

  const sourceTagSet = new Set(source.tags)
  const alreadyLinked = new Set(source.linkedPoints)

  const candidates: { id: string; title: string; score: number; reason: string }[] = []

  for (const kp of allKPs) {
    if (kp.id === kpId || alreadyLinked.has(kp.id)) continue

    // 标签重叠
    const tagOverlap = kp.tags.filter((t) => sourceTagSet.has(t)).length
    if (tagOverlap === 0) continue

    const score = tagOverlap / Math.max(sourceTagSet.size, kp.tags.length, 1)
    candidates.push({
      id: kp.id,
      title: kp.title,
      score,
      reason: `共享 ${tagOverlap} 个标签`,
    })
  }

  return candidates.sort((a, b) => b.score - a.score).slice(0, limit)
}
