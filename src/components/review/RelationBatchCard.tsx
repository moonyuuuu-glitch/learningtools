import { Check, ChevronDown, ChevronRight, ThumbsDown } from 'lucide-react'
import { useState } from 'react'
import type { Store } from '../../hooks/useStore'
import type { KnowledgeRelation, RelationAnalysisJob } from '../../types'
import { feedbackPatternForRelation } from '../../engine/relationInference'

const RELATION_LABELS: Record<string, string> = {
  explains: '解释',
  prerequisite: '前置',
  derived_from: '来源于',
  part_of: '组成',
  related_to: '相关',
}

export default function RelationBatchCard({
  job,
  relations,
  store,
}: {
  job: RelationAnalysisJob
  relations: KnowledgeRelation[]
  store: Store
}) {
  const [expanded, setExpanded] = useState(false)
  const article = store.articles.find((item) => item.id === job.articleId)
  const confidenceCounts = relations.reduce(
    (counts, relation) => ({
      ...counts,
      [relation.confidence]: counts[relation.confidence] + 1,
    }),
    { high: 0, medium: 0, low: 0 },
  )

  const titleFor = (relation: KnowledgeRelation, side: 'from' | 'to') => {
    const type = side === 'from' ? relation.fromType : relation.toType
    const id = side === 'from' ? relation.fromId : relation.toId
    return type === 'framework'
      ? store.frameworks.find((item) => item.id === id)?.title
      : store.knowledgePoints.find((item) => item.id === id)?.title
  }

  const promote = (relation: KnowledgeRelation) =>
    store.upsertRelation({
      ...relation,
      reviewStatus: 'reviewed',
      updatedAt: Date.now(),
    })

  const reject = async (relation: KnowledgeRelation) => {
    await store.upsertRelationFeedbackPattern(
      feedbackPatternForRelation(
        relation,
        store.knowledgePoints,
        store.frameworks,
      ),
    )
    await store.upsertRelation({
      ...relation,
      reviewStatus: 'rejected',
      updatedAt: Date.now(),
    })
  }

  return (
    <article className="relation-batch-card">
      <button className="relation-batch-heading" onClick={() => setExpanded((value) => !value)}>
        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        <div>
          <span>来源资料</span>
          <h2>{article?.title ?? '已删除的资料'}</h2>
        </div>
        <div className="relation-batch-summary">
          <strong>{relations.length}</strong>
          <span>条 AI 推断</span>
        </div>
      </button>
      <div className="relation-confidence-summary">
        <span>高 {confidenceCounts.high}</span>
        <span>中 {confidenceCounts.medium}</span>
        <span>低 {confidenceCounts.low}</span>
        {job.autoFormalizedCount > 0 && <span>自动正式化 {job.autoFormalizedCount}</span>}
      </div>

      {expanded && (
        <div className="relation-batch-list">
          {relations.map((relation) => (
            <div className="relation-batch-row" key={relation.id}>
              <div>
                <p>
                  <strong>{titleFor(relation, 'from') ?? '未知节点'}</strong>
                  <span>{RELATION_LABELS[relation.type] ?? relation.type}</span>
                  <strong>{titleFor(relation, 'to') ?? '未知节点'}</strong>
                </p>
                <small>{relation.reason}</small>
                <blockquote>{relation.evidence}</blockquote>
              </div>
              <div className="relation-row-actions">
                <button className="primary-action" onClick={() => void promote(relation)}>
                  <Check size={12} /> 升正式
                </button>
                <button className="quiet-action" onClick={() => void reject(relation)}>
                  <ThumbsDown size={12} /> 不对
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  )
}