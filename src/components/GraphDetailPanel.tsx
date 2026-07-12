import { ArrowUpRight, BookOpen, Check, Link2, Network, ThumbsDown, X } from 'lucide-react'
import type { Store } from '../hooks/useStore'
import { feedbackPatternForRelation } from '../engine/relationInference'

const RELATION_LABELS: Record<string, string> = {
  explains: '解释',
  applies: '应用',
  prerequisite: '前置',
  contrast: '对比',
  causal: '因果',
  derived_from: '来源于',
  part_of: '组成',
  related_to: '相关',
}

export default function GraphDetailPanel({ store }: { store: Store }) {
  const point = store.knowledgePoints.find((item) => item.id === store.selectedKPId)
  const framework = store.frameworks.find((item) => item.id === store.selectedFrameworkId)
  const relation = store.relations.find((item) => item.id === store.selectedRelationId)

  const clearSelection = () => {
    store.setSelectedKPId(null)
    store.setSelectedFrameworkId(null)
    store.setSelectedRelationId(null)
  }

  if (relation) {
    const from = relation.fromType === 'framework'
      ? store.frameworks.find((item) => item.id === relation.fromId)
      : store.knowledgePoints.find((item) => item.id === relation.fromId)
    const to = relation.toType === 'framework'
      ? store.frameworks.find((item) => item.id === relation.toId)
      : store.knowledgePoints.find((item) => item.id === relation.toId)
    const sources = relation.sourceArticleIds
      .map((id) => store.articles.find((article) => article.id === id))
      .filter(Boolean)

    return (
      <aside className="graph-detail-panel">
        <header>
          <span>关系证据</span>
          <button onClick={clearSelection}><X size={15} /></button>
        </header>
        <div className="graph-detail-body">
          <p className="eyebrow">{RELATION_LABELS[relation.type] ?? relation.type}</p>
          <h2>{from?.title ?? '未知节点'} → {to?.title ?? '未知节点'}</h2>
          {relation.reviewStatus === 'inferred' && (
            <div className="inferred-relation-badge">
              AI 推断 · {relation.confidence === 'high' ? '高' : relation.confidence === 'medium' ? '中' : '低'}置信度
            </div>
          )}
          <section>
            <h3>为什么有关联</h3>
            <p>{relation.reason || '尚未补充关系说明。'}</p>
          </section>
          <section>
            <h3>证据</h3>
            <p>{relation.evidence || '这条旧关系缺少证据，需要重新审核。'}</p>
          </section>
          <section>
            <h3>来源资料</h3>
            {sources.length === 0 && <p className="muted-copy">尚未关联来源</p>}
            {sources.map((source) => source && (
              <button
                className="source-row"
                key={source.id}
                onClick={() => {
                  store.setSelectedArticleId(source.id)
                  store.setViewMode('articles')
                }}
              >
                <BookOpen size={13} />
                <span>{source.title}</span>
                <ArrowUpRight size={12} />
              </button>
            ))}
          </section>
          {relation.reviewStatus === 'needs_review' && (
            <button className="primary-action" onClick={() => store.setViewMode('review')}>
              去审核这条关系
            </button>
          )}
          {relation.reviewStatus === 'inferred' && (
            <div className="relation-decision-actions">
              <button
                className="primary-action"
                onClick={() => void store.upsertRelation({
                  ...relation,
                  reviewStatus: 'reviewed',
                  updatedAt: Date.now(),
                })}
              >
                <Check size={13} /> 升为正式
              </button>
              <button
                className="quiet-action"
                onClick={() => {
                  const pattern = feedbackPatternForRelation(
                    relation,
                    store.knowledgePoints,
                    store.frameworks,
                  )
                  void store.upsertRelationFeedbackPattern(pattern)
                  void store.upsertRelation({
                    ...relation,
                    reviewStatus: 'rejected',
                    updatedAt: Date.now(),
                  }).then(() => store.setSelectedRelationId(null))
                }}
              >
                <ThumbsDown size={13} /> 不对
              </button>
            </div>
          )}
        </div>
      </aside>
    )
  }

  if (framework) {
    const sources = framework.sourceArticleIds
      .map((id) => store.articles.find((article) => article.id === id))
      .filter(Boolean)
    return (
      <aside className="graph-detail-panel">
        <header>
          <span>框架详情</span>
          <button onClick={clearSelection}><X size={15} /></button>
        </header>
        <div className="graph-detail-body">
          <p className="eyebrow">个人工具箱</p>
          <h2>{framework.title}</h2>
          <p className="graph-detail-lead">{framework.problem}</p>
          <section>
            <h3>核心步骤</h3>
            <ol className="detail-steps">
              {framework.steps.map((step) => <li key={step}>{step}</li>)}
            </ol>
          </section>
          <section>
            <h3>来源资料</h3>
            {sources.map((source) => source && (
              <button
                className="source-row"
                key={source.id}
                onClick={() => {
                  store.setSelectedArticleId(source.id)
                  store.setViewMode('articles')
                }}
              >
                <BookOpen size={13} />
                <span>{source.title}</span>
                <ArrowUpRight size={12} />
              </button>
            ))}
          </section>
        </div>
      </aside>
    )
  }

  if (point) {
    const sources = store.articles.filter((article) =>
      article.knowledgePoints.includes(point.id))
    const visibleRelations = store.relations.filter((item) =>
      item.reviewStatus !== 'rejected'
      && (
        (item.fromType === 'knowledge_point' && item.fromId === point.id)
        || (item.toType === 'knowledge_point' && item.toId === point.id)
      ))
    return (
      <aside className="graph-detail-panel">
        <header>
          <span>知识点详情</span>
          <button onClick={clearSelection}><X size={15} /></button>
        </header>
        <div className="graph-detail-body">
          <p className="eyebrow">已审核知识</p>
          <h2>{point.title}</h2>
          <p className="graph-detail-lead">{point.summary || '尚未添加一句话定义。'}</p>
          <section>
            <h3><Link2 size={12} /> 知识关系</h3>
            {visibleRelations.length === 0 && <p className="muted-copy">还没有已发现的语义关系</p>}
            {visibleRelations.map((item) => (
              <button
                className="relation-row"
                key={item.id}
                onClick={() => store.setSelectedRelationId(item.id)}
              >
                <span>
                  {item.reviewStatus === 'inferred' && 'AI · '}
                  {RELATION_LABELS[item.type] ?? item.type}
                </span>
                <small>{item.reason || '查看证据'}</small>
              </button>
            ))}
          </section>
          <section>
            <h3><BookOpen size={12} /> 来源资料</h3>
            {sources.length === 0 && <p className="muted-copy">还没有资料引用这个知识点</p>}
            {sources.map((source) => (
              <button
                className="source-row"
                key={source.id}
                onClick={() => {
                  store.setSelectedArticleId(source.id)
                  store.setViewMode('articles')
                }}
              >
                <BookOpen size={13} />
                <span>{source.title}</span>
                <ArrowUpRight size={12} />
              </button>
            ))}
          </section>
        </div>
      </aside>
    )
  }

  return (
    <aside className="graph-detail-panel graph-detail-empty">
      <Network size={22} />
      <h2>选择一个知识点或框架</h2>
      <p>这里会显示定义、正式关系，以及支撑它的来源资料。</p>
    </aside>
  )
}