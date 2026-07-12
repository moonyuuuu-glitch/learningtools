import {
  listArticles,
  listFrameworks,
  listKnowledgePoints,
  listRelationFeedbackPatterns,
  listRelationAnalysisJobs,
  listRelations,
  saveRelationAnalysisJob,
  saveRelations,
} from '../db/database'
import { suggestLinks } from '../api/ai'
import type {
  Article,
  FrameworkCard,
  KnowledgeEntityType,
  KnowledgePoint,
  KnowledgeRelation,
  KnowledgeRelationType,
  RelationAnalysisJob,
} from '../types'
import { nanoid } from '../utils'

type RelationNode = {
  id: string
  type: KnowledgeEntityType
  title: string
  summary: string
  tags: string[]
}

const MAX_ARTICLE_CONTEXT_CHARS = 6_000
const MAX_HISTORICAL_CANDIDATES = 16

function normalizeTerms(value: string) {
  return value
    .toLowerCase()
    .split(/[\s,，。；;：:、/|()[\]（）【】_-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2)
    .slice(0, 20)
}

function nodeFromPoint(point: KnowledgePoint): RelationNode {
  return {
    id: point.id,
    type: 'knowledge_point',
    title: point.title,
    summary: point.summary ?? point.content.slice(0, 260),
    tags: point.tags,
  }
}

function nodeFromFramework(framework: FrameworkCard): RelationNode {
  return {
    id: framework.id,
    type: 'framework',
    title: framework.title,
    summary: framework.problem,
    tags: [],
  }
}

function nodeScore(current: RelationNode[], candidate: RelationNode) {
  let score = 0
  const candidateTerms = new Set(normalizeTerms(`${candidate.title} ${candidate.summary}`))
  for (const source of current) {
    const sourceTerms = normalizeTerms(`${source.title} ${source.summary}`)
    score += sourceTerms.filter((term) => candidateTerms.has(term)).length * 2
    score += source.tags.filter((tag) => candidate.tags.includes(tag)).length * 3
  }
  return score
}

function relationKey(
  fromType: KnowledgeEntityType,
  fromId: string,
  toType: KnowledgeEntityType,
  toId: string,
  type: KnowledgeRelationType,
  articleId: string,
) {
  return [fromType, fromId, toType, toId, type, articleId].join('|')
}

function hashArticleForAnalysis(article: Article) {
  const value = [
    article.sourceHash,
    article.title,
    article.summary,
    article.notes,
    [...article.knowledgePoints].sort().join(','),
  ].join('\u0000')
  let hash = 2166136261
  for (const character of value) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function relationAnalysisHash(article: Article) {
  return hashArticleForAnalysis(article)
}

export function feedbackPatternForRelation(
  relation: KnowledgeRelation,
  points: KnowledgePoint[],
  frameworks: FrameworkCard[],
) {
  const pointMap = new Map(points.map((point) => [point.id, point]))
  const frameworkMap = new Map(frameworks.map((framework) => [framework.id, framework]))
  const fromPoint = relation.fromType === 'knowledge_point' ? pointMap.get(relation.fromId) : undefined
  const toPoint = relation.toType === 'knowledge_point' ? pointMap.get(relation.toId) : undefined
  const fromTitle = fromPoint?.title ?? frameworkMap.get(relation.fromId)?.title ?? ''
  const toTitle = toPoint?.title ?? frameworkMap.get(relation.toId)?.title ?? ''
  return {
    id: nanoid(),
    relationType: relation.type,
    fromTerms: normalizeTerms(fromTitle),
    toTerms: normalizeTerms(toTitle),
    sharedTagIds: fromPoint && toPoint
      ? fromPoint.tags.filter((tag) => toPoint.tags.includes(tag))
      : [],
    weight: 1,
    createdAt: Date.now(),
  }
}

export async function analyzeArticleRelations(job: RelationAnalysisJob) {
  const [articles, points, frameworks, existingRelations, feedbackPatterns] = await Promise.all([
    listArticles(),
    listKnowledgePoints(),
    listFrameworks(),
    listRelations(),
    listRelationFeedbackPatterns(),
  ])
  const article = articles.find((item) => item.id === job.articleId)
  if (!article) throw new Error('资料已不存在')

  const pointMap = new Map(points.map((point) => [point.id, point]))
  const current: RelationNode[] = article.knowledgePoints
    .map((id) => pointMap.get(id))
    .filter((point): point is KnowledgePoint => Boolean(point))
    .map(nodeFromPoint)
  for (const framework of frameworks) {
    if (framework.sourceArticleIds.includes(article.id)) current.push(nodeFromFramework(framework))
  }

  if (current.length === 0 || !(article.notes || article.summary)) {
    const skipped = {
      ...job,
      status: 'skipped' as const,
      error: '资料缺少可分析正文或关联知识',
      updatedAt: Date.now(),
    }
    await saveRelationAnalysisJob(skipped)
    return skipped
  }

  const currentIds = new Set(current.map((node) => `${node.type}:${node.id}`))
  const historical = [
    ...points.map(nodeFromPoint),
    ...frameworks
      .filter((framework) => framework.reviewStatus === 'reviewed')
      .map(nodeFromFramework),
  ]
    .filter((node) => !currentIds.has(`${node.type}:${node.id}`))
    .map((node) => ({ node, score: nodeScore(current, node) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, MAX_HISTORICAL_CANDIDATES)
    .map(({ node }) => node)

  if (historical.length === 0) {
    const skipped = {
      ...job,
      status: 'skipped' as const,
      error: '没有可连接的历史知识',
      updatedAt: Date.now(),
    }
    await saveRelationAnalysisJob(skipped)
    return skipped
  }

  await saveRelationAnalysisJob({
    ...job,
    status: 'running',
    error: undefined,
    updatedAt: Date.now(),
  })

  const response = await suggestLinks({
    article: {
      id: article.id,
      title: article.title,
      content: [article.summary, article.notes]
        .filter(Boolean)
        .join('\n')
        .slice(0, MAX_ARTICLE_CONTEXT_CHARS),
    },
    currentNodes: current.map(({ id, type, title, summary }) => ({
      id,
      type,
      title,
      summary,
    })),
    candidates: historical.map(({ id, type, title, summary }) => ({
      id,
      type,
      title,
      summary,
    })),
    feedbackPatterns: feedbackPatterns.map((pattern) => ({
      relationType: pattern.relationType,
      fromTerms: pattern.fromTerms,
      toTerms: pattern.toTerms,
      sharedTagIds: pattern.sharedTagIds,
      weight: pattern.weight,
    })),
  })

  const nodeTypes = new Map(
    [...current, ...historical].map((node) => [node.id, node.type]),
  )
  const existingKeys = new Set(existingRelations.map((relation) =>
    relationKey(
      relation.fromType,
      relation.fromId,
      relation.toType,
      relation.toId,
      relation.type,
      article.id,
    )))
  const now = Date.now()
  const relations: KnowledgeRelation[] = []
  for (const suggested of response.relations.slice(0, 8)) {
    const fromType = nodeTypes.get(suggested.fromId)
    const toType = nodeTypes.get(suggested.toId)
    if (!fromType || !toType) continue
    const type = suggested.relationType as KnowledgeRelationType
    const key = relationKey(
      fromType,
      suggested.fromId,
      toType,
      suggested.toId,
      type,
      article.id,
    )
    if (existingKeys.has(key)) continue
    existingKeys.add(key)
    relations.push({
      id: nanoid(),
      fromType,
      fromId: suggested.fromId,
      toType,
      toId: suggested.toId,
      type,
      reason: suggested.reason,
      evidence: suggested.evidence,
      sourceArticleIds: [article.id],
      sourceHashes: article.sourceHash ? { [article.id]: article.sourceHash } : {},
      confidence: suggested.confidence,
      reviewStatus: type === 'derived_from' && suggested.confidence === 'high'
        ? 'reviewed'
        : 'inferred',
      createdBy: 'ai',
      analysisBatchId: job.id,
      modelVersion: 'deepseek-chat',
      promptVersion: 'relation-v1',
      createdAt: now,
      updatedAt: now,
    })
  }
  if (relations.length > 0) await saveRelations(relations)

  const completed = {
    ...job,
    status: 'completed' as const,
    relationCount: relations.length,
    autoFormalizedCount: relations.filter((item) => item.reviewStatus === 'reviewed').length,
    error: undefined,
    updatedAt: Date.now(),
  }
  await saveRelationAnalysisJob(completed)
  return completed
}

export async function createRelationAnalysisJob(article: Article, force = false) {
  const jobs = await listRelationAnalysisJobs()
  const analysisHash = relationAnalysisHash(article)
  const existing = jobs.find((job) =>
    job.articleId === article.id
    && job.analysisHash === analysisHash
    && job.status !== 'failed')
  if (existing && !force) return existing
  const now = Date.now()
  const job: RelationAnalysisJob = {
    id: nanoid(),
    articleId: article.id,
    analysisHash,
    status: 'queued',
    relationCount: 0,
    autoFormalizedCount: 0,
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  }
  await saveRelationAnalysisJob(job)
  return job
}