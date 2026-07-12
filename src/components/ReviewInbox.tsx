import { useState } from 'react'
import { Check, FileCheck2, GitPullRequest, Inbox, Layers3, ShieldCheck, X } from 'lucide-react'
import type { AgentProposal, FrameworkCard, KnowledgePoint, KnowledgeRelation, ReviewCandidate } from '../types'
import type { Store } from '../hooks/useStore'
import { nanoid } from '../utils'
import AgentApprovalPanel from './AgentApprovalPanel'
import { auditKnowledgeBase } from '../engine/governance'

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
  const governanceIssues = auditKnowledgeBase({
    articles: store.articles,
    knowledgePoints: store.knowledgePoints,
    frameworks: store.frameworks,
    relations: store.relations,
  })

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

  return (
    <main className="review-inbox">
      <header className="review-header">
        <div>
          <p className="eyebrow">Review first</p>
          <h1>审核箱</h1>
          <p>AI 只提出候选。你确认后，它们才进入正式知识库。</p>
        </div>
        <div className="review-count">
          <strong>{pending.length + governanceIssues.length + agentProposals.length}</strong>
          <span>项需要判断</span>
        </div>
      </header>

      <nav className="review-tabs">
        <button data-active={tab === 'pending'} onClick={() => setTab('pending')}>
          <Inbox size={14} /> 知识候选 <span>{pending.length}</span>
        </button>
        <button data-active={tab === 'governance'} onClick={() => setTab('governance')}>
          <ShieldCheck size={14} /> 需复核 <span>{governanceIssues.length}</span>
        </button>
        <button data-active={tab === 'agent'} onClick={() => setTab('agent')}>
          <GitPullRequest size={14} /> Agent 写入 <span>{agentProposals.length}</span>
        </button>
      </nav>

      <section className="review-list">
        {tab === 'pending' && pending.length === 0 && (
          <div className="review-empty">
            <FileCheck2 size={22} />
            <h2>没有等待确认的知识候选</h2>
            <p>从资料中识别出的知识点、框架和正式关系会在这里出现。</p>
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
            <h2>知识关系状态良好</h2>
            <p>来源变化、旧版无类型连线和证据缺失会进入这个分区。</p>
          </div>
        )}
        {tab === 'governance' && governanceIssues.map((issue) => {
          const relation = store.relations.find((item) => item.id === issue.entityId)
          return (
          <article className="candidate-card governance-card" key={issue.id}>
            <div className="candidate-type"><ShieldCheck size={14} /> 知识治理</div>
            <h2>{issue.title}</h2>
            <p>{issue.description}</p>
            <div className="candidate-actions">
              {relation && <button
                className="primary-action"
                onClick={() => void store.upsertRelation({
                  ...relation,
                  reviewStatus: 'reviewed',
                  updatedAt: Date.now(),
                })}
              >
                <Check size={13} /> 确认为正式关系
              </button>}
              {relation && <button className="quiet-action" onClick={() => void store.removeRelation(relation.id)}>
                <X size={13} /> 删除
              </button>}
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