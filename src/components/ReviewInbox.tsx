import { useMemo, useState } from 'react'
import { Check, FileCheck2, GitPullRequest, Inbox, Layers3, ShieldCheck, X } from 'lucide-react'
import type { AgentProposal, FrameworkCard, KnowledgePoint, KnowledgeRelation, ReviewCandidate } from '../types'
import type { Store } from '../hooks/useStore'
import { nanoid } from '../utils'
import AgentApprovalPanel from './AgentApprovalPanel'
import { auditKnowledgeBase } from '../engine/governance'
import RelationBatchCard from './review/RelationBatchCard'

function candidateIcon(type: ReviewCandidate['type']) {
  if (type === 'framework') return Layers3
  if (type === 'relation') return GitPullRequest
  return FileCheck2
}

export default function ReviewInbox({
  store,
  agentProposals,
  onApproveAgent,
  onRejectAgent,
}: {
  store: Store
  agentProposals: AgentProposal[]
  onApproveAgent: (id: string) => void
  onRejectAgent: (id: string) => void
}) {
  const [tab, setTab] = useState<'pending' | 'governance' | 'agent'>('pending')
  const pending = store.candidates.filter((candidate) => candidate.status === 'pending')
  const inferredRelations = store.relations.filter((relation) => relation.reviewStatus === 'inferred')
  const relationBatches = store.relationAnalysisJobs
    .filter((job) => inferredRelations.some((relation) => relation.analysisBatchId === job.id))
    .sort((left, right) => right.updatedAt - left.updatedAt)
  const governanceIssues = useMemo(() => auditKnowledgeBase({
    articles: store.articles,
    knowledgePoints: store.knowledgePoints,
    frameworks: store.frameworks,
    relations: store.relations,
  }), [store.articles, store.knowledgePoints, store.frameworks, store.relations])
  const pendingCount = pending.length + inferredRelations.length
  const totalCount = pendingCount + governanceIssues.length + agentProposals.length

  const resolve = async (candidate: ReviewCandidate, status: 'accepted' | 'rejected') => {
    if (status === 'accepted') {
      if (candidate.type === 'knowledge_point') {
        const payload = candidate.payload as Partial<KnowledgePoint>
        const now = Date.now()
        await store.upsertKP({
          id: payload.id ?? nanoid(),
          title: payload.title ?? candidate.title,
          summary: payload.summary ?? candidate.summary,
          content: payload.content ?? '',
          aliases: payload.aliases ?? [],
          parentId: payload.parentId,
          tags: payload.tags ?? [],
          linkedPoints: payload.linkedPoints ?? [],
          reviewStatus: 'reviewed',
          createdAt: payload.createdAt ?? now,
          updatedAt: now,
        })
      }
      if (candidate.type === 'framework') {
        const payload = candidate.payload as Partial<FrameworkCard>
        const now = Date.now()
        await store.upsertFramework({
          id: payload.id ?? nanoid(),
          title: payload.title ?? candidate.title,
          problem: payload.problem ?? candidate.summary,
          steps: payload.steps ?? [],
          useCases: payload.useCases ?? [],
          sourceArticleIds: payload.sourceArticleIds ?? candidate.sourceArticleIds,
          knowledgePointIds: payload.knowledgePointIds ?? [],
          reviewStatus: 'reviewed',
          pinned: payload.pinned ?? false,
          suppressed: false,
          score: payload.score ?? 0,
          createdAt: payload.createdAt ?? now,
          updatedAt: now,
        })
      }
      if (candidate.type === 'relation') {
        const payload = candidate.payload as Partial<KnowledgeRelation>
        if (payload.fromId && payload.toId && payload.fromType && payload.toType) {
          const now = Date.now()
          await store.upsertRelation({
            id: payload.id ?? nanoid(),
            fromType: payload.fromType,
            fromId: payload.fromId,
            toType: payload.toType,
            toId: payload.toId,
            type: payload.type ?? 'related_to',
            reason: payload.reason ?? candidate.summary,
            evidence: payload.evidence ?? candidate.evidence,
            sourceArticleIds: payload.sourceArticleIds ?? candidate.sourceArticleIds,
            sourceHashes: payload.sourceHashes ?? {},
            confidence: payload.confidence ?? 'medium',
            reviewStatus: 'reviewed',
            createdAt: payload.createdAt ?? now,
            updatedAt: now,
          })
        }
      }
    }
    await store.upsertCandidate({
      ...candidate,
      status,
      resolvedAt: Date.now(),
    })
  }

  const openRelation = (relationId: string) => {
    store.setSelectedRelationId(relationId)
    store.setSelectedFrameworkId(null)
    store.setSelectedKPId(null)
    store.setViewMode('graph')
  }

  const openFramework = (frameworkId: string) => {
    store.setSelectedFrameworkId(frameworkId)
    store.setSelectedRelationId(null)
    store.setSelectedKPId(null)
    store.setViewMode('graph')
  }

  const openKnowledgePoint = (knowledgePointId: string) => {
    store.setSelectedKPId(knowledgePointId)
    store.setSelectedFrameworkId(null)
    store.setSelectedRelationId(null)
    store.setViewMode('graph')
  }

  const resolveGovernance = async (issue: typeof governanceIssues[number], action: 'confirm' | 'delete' | 'inspect') => {
    const relation = store.relations.find((item) => item.id === issue.entityId)
    if (action === 'inspect') {
      if (issue.type === 'orphan_framework') openFramework(issue.entityId)
      if (issue.type === 'duplicate_alias') openKnowledgePoint(issue.entityId)
      if (relation) openRelation(relation.id)
      return
    }

    if (action === 'delete') {
      if (issue.type === 'orphan_framework') {
        await store.removeFramework(issue.entityId)
        return
      }
      if (relation) {
        await store.removeRelation(relation.id)
      }
      return
    }

    if (!relation) return

    if (issue.type === 'source_changed') {
      const nextSourceHashes = { ...relation.sourceHashes }
      relation.sourceArticleIds.forEach((sourceId) => {
        const sourceHash = store.articles.find((article) => article.id === sourceId)?.sourceHash
        if (sourceHash) nextSourceHashes[sourceId] = sourceHash
      })
      await store.upsertRelation({
        ...relation,
        sourceHashes: nextSourceHashes,
        reviewStatus: 'reviewed',
        updatedAt: Date.now(),
      })
      return
    }

    if (issue.type === 'missing_evidence' || issue.type === 'missing_source' || issue.type === 'broken_target') {
      openRelation(relation.id)
      return
    }

    await store.upsertRelation({
      ...relation,
      reviewStatus: 'reviewed',
      updatedAt: Date.now(),
    })
  }

  const renderGovernanceActions = (issue: typeof governanceIssues[number]) => {
    const relation = store.relations.find((item) => item.id === issue.entityId)

    if (issue.type === 'source_changed' && relation) {
      return (
        <>
          <button className="primary-action" onClick={() => void resolveGovernance(issue, 'confirm')}>
            <Check size={13} /> 已复核并更新依据
          </button>
          <button className="quiet-action" onClick={() => void resolveGovernance(issue, 'delete')}>
            <X size={13} /> 删除关系
          </button>
        </>
      )
    }

    if (issue.type === 'missing_evidence' && relation) {
      return (
        <>
          <button className="primary-action" onClick={() => void resolveGovernance(issue, 'inspect')}>
            <Check size={13} /> 去补证据
          </button>
          <button className="quiet-action" onClick={() => void resolveGovernance(issue, 'delete')}>
            <X size={13} /> 删除关系
          </button>
        </>
      )
    }

    if ((issue.type === 'missing_source' || issue.type === 'broken_target') && relation) {
      return (
        <>
          <button className="primary-action" onClick={() => void resolveGovernance(issue, 'inspect')}>
            <Check size={13} /> 查看关系
          </button>
          <button className="quiet-action" onClick={() => void resolveGovernance(issue, 'delete')}>
            <X size={13} /> 删除关系
          </button>
        </>
      )
    }

    if (issue.type === 'orphan_framework') {
      return (
        <>
          <button className="primary-action" onClick={() => void resolveGovernance(issue, 'inspect')}>
            <Check size={13} /> 查看框架
          </button>
          <button className="quiet-action" onClick={() => void resolveGovernance(issue, 'delete')}>
            <X size={13} /> 删除框架
          </button>
        </>
      )
    }

    if (issue.type === 'duplicate_alias') {
      return (
        <>
          <button className="primary-action" onClick={() => void resolveGovernance(issue, 'inspect')}>
            <Check size={13} /> 去知识点处理
          </button>
          <span className="review-inline-note">需要在知识点详情里修改标题或别名</span>
        </>
      )
    }

    return <span className="review-inline-note">这条问题需要到详情页继续处理</span>
  }

  return (
    <main className="review-inbox">
      <header className="review-header">
        <div>
          <p className="eyebrow">Review first</p>
          <h1>审核箱</h1>
          <p>这里分成 3 类：AI 建议、知识治理复核、Agent 写入审批。它们不是一回事，会分别处理。</p>
        </div>
        <div className="review-count">
          <strong>{totalCount}</strong>
          <span>项需要判断</span>
        </div>
      </header>

      <section className="review-overview">
        <article data-active={tab === 'pending'}>
          <div className="review-overview-title"><Inbox size={14} /> AI 建议</div>
          <p>AI 从资料里提取概念、框架和推断关系，等你决定要不要收下。</p>
          <strong>{pendingCount} 项</strong>
        </article>
        <article data-active={tab === 'governance'}>
          <div className="review-overview-title"><ShieldCheck size={14} /> 知识治理</div>
          <p>已有正式关系因为来源变化、证据缺失或结构异常，需要你重新处理。</p>
          <strong>{governanceIssues.length} 项</strong>
        </article>
        <article data-active={tab === 'agent'}>
          <div className="review-overview-title"><GitPullRequest size={14} /> Agent 写入审批</div>
          <p>外部 Agent 想改你的知识库时，会先停在这里，必须你亲自批准才会落库。</p>
          <strong>{agentProposals.length} 项</strong>
        </article>
      </section>

      <nav className="review-tabs">
        <button data-active={tab === 'pending'} onClick={() => setTab('pending')}>
          <Inbox size={14} /> AI 建议 <span>{pendingCount}</span>
        </button>
        <button data-active={tab === 'governance'} onClick={() => setTab('governance')}>
          <ShieldCheck size={14} /> 知识治理 <span>{governanceIssues.length}</span>
        </button>
        <button data-active={tab === 'agent'} onClick={() => setTab('agent')}>
          <GitPullRequest size={14} /> Agent 审批 <span>{agentProposals.length}</span>
        </button>
      </nav>

      <section className="review-list">
        {tab === 'pending' && relationBatches.length > 0 && (
          <div className="relation-batches">
            <div className="relation-batches-intro">
              <h2>按资料形成的 AI 关系</h2>
              <p>这些关系已显示在图谱中。你只需纠正错误，或把重要关系升为正式。</p>
            </div>
            {relationBatches.map((job) => (
              <RelationBatchCard
                key={job.id}
                job={job}
                relations={inferredRelations.filter((relation) => relation.analysisBatchId === job.id)}
                store={store}
              />
            ))}
          </div>
        )}
        {tab === 'pending' && pending.length === 0 && relationBatches.length === 0 && (
          <div className="review-empty">
            <FileCheck2 size={22} />
            <h2>没有等待确认的知识候选</h2>
            <p>从资料中识别出的知识点、框架和 AI 推断关系会在这里出现。</p>
          </div>
        )}
        {tab === 'pending' && pending.map((candidate) => {
          const Icon = candidateIcon(candidate.type)
          return (
            <article className="candidate-card" key={candidate.id}>
              <div className="candidate-type"><Icon size={14} /> {candidate.type}</div>
              <h2>{candidate.title}</h2>
              <p>{candidate.summary}</p>
              {candidate.evidence && (
                <blockquote>{candidate.evidence}</blockquote>
              )}
              <div className="candidate-meta">
                <span>{candidate.sourceArticleIds.length} 篇来源资料</span>
                <span>{new Date(candidate.createdAt).toLocaleDateString('zh-CN')}</span>
              </div>
              <div className="candidate-actions">
                <button className="primary-action" onClick={() => void resolve(candidate, 'accepted')}>
                  <Check size={13} /> 接受
                </button>
                <button className="quiet-action" onClick={() => void resolve(candidate, 'rejected')}>
                  <X size={13} /> 忽略
                </button>
              </div>
            </article>
          )
        })}

        {tab === 'governance' && governanceIssues.length === 0 && (
          <div className="review-empty">
            <ShieldCheck size={22} />
            <h2>知识治理状态良好</h2>
            <p>来源变化、缺证据、孤立框架或别名冲突都会进入这个分区。</p>
          </div>
        )}
        {tab === 'governance' && governanceIssues.map((issue) => {
          return (
          <article className="candidate-card governance-card" key={issue.id}>
            <div className="candidate-type"><ShieldCheck size={14} /> 知识治理</div>
            <h2>{issue.title}</h2>
            <p>{issue.description}</p>
            <div className="candidate-meta">
              <span>问题类型：{issue.type}</span>
              <span>
                {issue.type === 'source_changed' && '来源文章已变更，确认后会刷新依据哈希'}
                {issue.type === 'missing_evidence' && '这不是 Agent 审批，而是正式关系缺少证据'}
                {issue.type === 'missing_source' && '这条关系引用的资料已不存在'}
                {issue.type === 'broken_target' && '关系指向的知识点或框架已不存在'}
                {issue.type === 'orphan_framework' && '框架没有来源文章，无法追溯'}
                {issue.type === 'duplicate_alias' && '多个知识点共用同一别名，建议合并或改名'}
              </span>
            </div>
            <div className="candidate-actions">
              {renderGovernanceActions(issue)}
            </div>
          </article>
        )})}

        {tab === 'agent' && (
          <div className="agent-review-surface">
            {agentProposals.length === 0 ? (
              <div className="review-empty">
                <GitPullRequest size={22} />
                <h2>没有 Agent 写入等待批准</h2>
                <p>MCP 和外部 Agent 的写操作仍由你最终批准。</p>
              </div>
            ) : (
              <AgentApprovalPanel
                proposals={agentProposals}
                onApprove={onApproveAgent}
                onReject={onRejectAgent}
                embedded
              />
            )}
          </div>
        )}
      </section>
    </main>
  )
}