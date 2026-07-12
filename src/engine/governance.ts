import type {
  Article,
  FrameworkCard,
  KnowledgePoint,
  KnowledgeRelation,
} from '../types'

export interface GovernanceIssue {
  id: string
  type:
    | 'missing_evidence'
    | 'broken_target'
    | 'missing_source'
    | 'source_changed'
    | 'duplicate_alias'
    | 'orphan_framework'
  title: string
  description: string
  entityId: string
}

export function auditKnowledgeBase(input: {
  articles: Article[]
  knowledgePoints: KnowledgePoint[]
  frameworks: FrameworkCard[]
  relations: KnowledgeRelation[]
}) {
  const issues: GovernanceIssue[] = []
  const articleIds = new Set(input.articles.map((item) => item.id))
  const pointIds = new Set(input.knowledgePoints.map((item) => item.id))
  const frameworkIds = new Set(input.frameworks.map((item) => item.id))
  const articleMap = new Map(input.articles.map((item) => [item.id, item]))

  for (const relation of input.relations) {
    const fromExists = relation.fromType === 'framework'
      ? frameworkIds.has(relation.fromId)
      : pointIds.has(relation.fromId)
    const toExists = relation.toType === 'framework'
      ? frameworkIds.has(relation.toId)
      : pointIds.has(relation.toId)
    if (!fromExists || !toExists) {
      issues.push({
        id: `broken:${relation.id}`,
        type: 'broken_target',
        title: '关系指向已不存在的知识',
        description: relation.reason || relation.id,
        entityId: relation.id,
      })
    }
    if (!relation.evidence || relation.sourceArticleIds.length === 0) {
      issues.push({
        id: `evidence:${relation.id}`,
        type: 'missing_evidence',
        title: '正式关系缺少来源证据',
        description: relation.reason || '需要补充为什么存在这条关系',
        entityId: relation.id,
      })
    }
    for (const sourceId of relation.sourceArticleIds) {
      if (!articleIds.has(sourceId)) {
        issues.push({
          id: `source:${relation.id}:${sourceId}`,
          type: 'missing_source',
          title: '关系引用的资料已不存在',
          description: relation.reason || relation.id,
          entityId: relation.id,
        })
      }
      const currentHash = articleMap.get(sourceId)?.sourceHash
      const recordedHash = relation.sourceHashes[sourceId]
      if (currentHash && recordedHash && currentHash !== recordedHash) {
        issues.push({
          id: `hash:${relation.id}:${sourceId}`,
          type: 'source_changed',
          title: '来源内容变化，需要复核关系',
          description: relation.reason || relation.id,
          entityId: relation.id,
        })
      }
    }
  }

  for (const framework of input.frameworks) {
    if (framework.sourceArticleIds.length === 0) {
      issues.push({
        id: `framework:${framework.id}`,
        type: 'orphan_framework',
        title: `框架「${framework.title}」没有来源`,
        description: '框架卡片必须能回到原始资料',
        entityId: framework.id,
      })
    }
  }

  const aliasOwners = new Map<string, string[]>()
  for (const point of input.knowledgePoints) {
    for (const alias of [point.title, ...(point.aliases ?? [])]) {
      const key = alias.trim().toLowerCase()
      if (!key) continue
      aliasOwners.set(key, [...(aliasOwners.get(key) ?? []), point.id])
    }
  }
  for (const [alias, owners] of aliasOwners) {
    if (new Set(owners).size < 2) continue
    issues.push({
      id: `alias:${alias}`,
      type: 'duplicate_alias',
      title: `别名「${alias}」指向多个知识点`,
      description: '请合并概念或调整别名，避免检索歧义',
      entityId: owners[0],
    })
  }

  return issues
}