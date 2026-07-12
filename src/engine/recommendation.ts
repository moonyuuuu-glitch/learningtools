import type { FrameworkCard, InteractionEvent } from '../types'

const EVENT_WEIGHTS: Record<InteractionEvent['type'], number> = {
  framework_view: 1,
  source_open: 2,
  search_open: 2,
  graph_focus: 2,
  relation_create: 4,
  framework_pin: 20,
  framework_suppress: -1000,
}

export function scoreFramework(
  framework: FrameworkCard,
  events: InteractionEvent[],
) {
  const behaviorScore = events
    .filter((event) =>
      (event.entityType === 'framework' && event.entityId === framework.id)
      || (event.entityType === 'article' && framework.sourceArticleIds.includes(event.entityId)))
    .reduce((sum, event) => sum + EVENT_WEIGHTS[event.type], 0)

  const sourceBreadth = framework.sourceArticleIds.length * 2
  const connectionBreadth = framework.knowledgePointIds.length
  const pinnedBoost = framework.pinned ? 100 : 0
  return framework.score + behaviorScore + sourceBreadth + connectionBreadth + pinnedBoost
}

function hashDate(date: string) {
  let hash = 0
  for (const character of date) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  }
  return hash
}

export function rankFrameworks(
  frameworks: FrameworkCard[],
  events: InteractionEvent[],
  date = new Date().toISOString().slice(0, 10),
) {
  const ranked = frameworks
    .filter((framework) =>
      framework.reviewStatus === 'reviewed' && !framework.suppressed)
    .map((framework) => ({
      framework,
      score: scoreFramework(framework, events),
    }))
    .sort((left, right) =>
      right.score - left.score || left.framework.title.localeCompare(right.framework.title))

  if (ranked.length < 2) return ranked
  const offset = hashDate(date) % ranked.length
  return [...ranked.slice(offset), ...ranked.slice(0, offset)]
}

export function recommendationReason(framework: FrameworkCard) {
  const reasons = []
  if (framework.pinned) reasons.push('你已置顶常看')
  if (framework.sourceArticleIds.length > 1) {
    reasons.push(`来自 ${framework.sourceArticleIds.length} 篇资料`)
  }
  if (framework.knowledgePointIds.length > 0) {
    reasons.push(`连接 ${framework.knowledgePointIds.length} 个知识点`)
  }
  return reasons.join(' · ') || '值得反复使用的框架'
}