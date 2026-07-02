import { useState, useEffect, useCallback } from 'react'
import {
  Lightbulb,
  Link2,
  X,
  Check,
  AlertTriangle,
  Clock,
  GitBranch,
  TrendingUp,
} from 'lucide-react'
import {
  listInsights,
  markInsightRead,
  listLinkSuggestions,
  saveLinkSuggestion,
  saveKnowledgePoint,
  db,
} from '../db/database'
import type { Insight, LinkSuggestion, InsightType } from '../types'

interface InsightsPanelProps {
  onNavigateToKP: (id: string) => void
}

const TYPE_CONFIG: Record<InsightType, { icon: typeof Lightbulb; label: string; color: string }> = {
  island: { icon: AlertTriangle, label: '孤岛', color: 'text-amber-500' },
  stale: { icon: Clock, label: '过时', color: 'text-orange-500' },
  duplicate: { icon: GitBranch, label: '重复', color: 'text-blue-500' },
  gap: { icon: Lightbulb, label: '复习', color: 'text-purple-500' },
  growth: { icon: TrendingUp, label: '增长', color: 'text-green-500' },
}

export default function InsightsPanel({ onNavigateToKP }: InsightsPanelProps) {
  const [insights, setInsights] = useState<Insight[]>([])
  const [suggestions, setSuggestions] = useState<LinkSuggestion[]>([])
  const [activeTab, setActiveTab] = useState<'insights' | 'links'>('insights')

  const refresh = useCallback(async () => {
    const [ins, sug] = await Promise.all([
      listInsights(),
      listLinkSuggestions('pending'),
    ])
    setInsights(ins.sort((a, b) => b.createdAt - a.createdAt))
    setSuggestions(sug)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleDismissInsight = async (id: string) => {
    await markInsightRead(id)
    refresh()
  }

  const handleAcceptLink = async (suggestion: LinkSuggestion) => {
    // 更新建议状态
    await saveLinkSuggestion({ ...suggestion, status: 'accepted' })

    // 实际建立双向链接
    const fromKP = await db.knowledgePoints.get(suggestion.fromId)
    const toKP = await db.knowledgePoints.get(suggestion.toId)
    if (fromKP && toKP) {
      if (!fromKP.linkedPoints.includes(suggestion.toId)) {
        await saveKnowledgePoint({
          ...fromKP,
          linkedPoints: [...fromKP.linkedPoints, suggestion.toId],
        })
      }
      if (!toKP.linkedPoints.includes(suggestion.fromId)) {
        await saveKnowledgePoint({
          ...toKP,
          linkedPoints: [...toKP.linkedPoints, suggestion.fromId],
        })
      }
    }

    refresh()
  }

  const handleRejectLink = async (suggestion: LinkSuggestion) => {
    await saveLinkSuggestion({ ...suggestion, status: 'rejected' })
    refresh()
  }

  const unreadCount = insights.filter((i) => i.status === 'unread').length
  const pendingLinks = suggestions.length

  return (
    <div className="flex h-full flex-col">
      {/* Tabs */}
      <div className="flex border-b border-[#e5ddd0]">
        <button
          onClick={() => setActiveTab('insights')}
          className={`flex items-center gap-1 px-4 py-2 text-sm transition-colors ${
            activeTab === 'insights'
              ? 'border-b-2 border-[#6b7c5e] text-[#4a4a3a] font-medium'
              : 'text-[#8a8a7a]'
          }`}
        >
          <Lightbulb size={14} />
          洞察
          {unreadCount > 0 && (
            <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#6b7c5e] px-1 text-xs text-white">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('links')}
          className={`flex items-center gap-1 px-4 py-2 text-sm transition-colors ${
            activeTab === 'links'
              ? 'border-b-2 border-[#6b7c5e] text-[#4a4a3a] font-medium'
              : 'text-[#8a8a7a]'
          }`}
        >
          <Link2 size={14} />
          关联建议
          {pendingLinks > 0 && (
            <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-xs text-white">
              {pendingLinks}
            </span>
          )}
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {activeTab === 'insights' && (
          <>
            {insights.length === 0 && (
              <p className="py-8 text-center text-sm text-[#b5b0a0]">
                暂无洞察，系统会自动分析你的知识图谱
              </p>
            )}
            {insights.map((insight) => {
              const cfg = TYPE_CONFIG[insight.type]
              const Icon = cfg.icon
              return (
                <div
                  key={insight.id}
                  className={`rounded-lg border p-3 ${
                    insight.status === 'unread'
                      ? 'border-[#6b7c5e]/30 bg-[#6b7c5e]/5'
                      : 'border-[#e5ddd0] bg-white'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <Icon size={14} className={`mt-0.5 flex-shrink-0 ${cfg.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`text-xs ${cfg.color}`}>{cfg.label}</span>
                        <span className="text-sm font-medium text-[#4a4a3a]">
                          {insight.title}
                        </span>
                      </div>
                      <p className="mt-1 whitespace-pre-line text-xs text-[#8a8a7a]">
                        {insight.description}
                      </p>
                      {Array.isArray(insight.payload?.nodeIds) && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {(insight.payload.nodeIds as string[])
                            .slice(0, 3)
                            .map((id: string) => (
                              <button
                                key={id}
                                onClick={() => onNavigateToKP(id)}
                                className="rounded bg-[#e8e2d6] px-1.5 py-0.5 text-xs text-[#6b7c5e] hover:bg-[#d5cdbc]"
                              >
                                查看
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                    {insight.status === 'unread' && (
                      <button
                        onClick={() => handleDismissInsight(insight.id)}
                        className="text-[#b5b0a0] hover:text-[#8a8a7a]"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </>
        )}

        {activeTab === 'links' && (
          <>
            {suggestions.length === 0 && (
              <p className="py-8 text-center text-sm text-[#b5b0a0]">
                暂无关联建议，系统会自动分析候选
              </p>
            )}
            {suggestions.map((sug) => (
              <LinkSuggestionCard
                key={sug.id}
                suggestion={sug}
                onAccept={() => handleAcceptLink(sug)}
                onReject={() => handleRejectLink(sug)}
                onNavigate={onNavigateToKP}
              />
            ))}
          </>
        )}
      </div>
    </div>
  )
}

function LinkSuggestionCard({
  suggestion,
  onAccept,
  onReject,
  onNavigate,
}: {
  suggestion: LinkSuggestion
  onAccept: () => void
  onReject: () => void
  onNavigate: (id: string) => void
}) {
  const [fromTitle, setFromTitle] = useState('')
  const [toTitle, setToTitle] = useState('')

  useEffect(() => {
    ;(async () => {
      const from = await db.knowledgePoints.get(suggestion.fromId)
      const to = await db.knowledgePoints.get(suggestion.toId)
      setFromTitle(from?.title ?? '未知')
      setToTitle(to?.title ?? '未知')
    })()
  }, [suggestion])

  const relLabels: Record<string, string> = {
    similar: '相似',
    prerequisite: '前置',
    application: '应用',
    contrast: '对比',
    causal: '因果',
  }

  return (
    <div className="rounded-lg border border-[#e5ddd0] bg-white p-3">
      <div className="flex items-center gap-1 text-xs text-[#8a8a7a]">
        <button
          onClick={() => onNavigate(suggestion.fromId)}
          className="text-[#6b7c5e] hover:underline"
        >
          {fromTitle}
        </button>
        <span>→</span>
        <span className="rounded bg-[#e8e2d6] px-1.5 py-0.5 text-xs">
          {relLabels[suggestion.relationType] || suggestion.relationType}
        </span>
        <span>→</span>
        <button
          onClick={() => onNavigate(suggestion.toId)}
          className="text-[#6b7c5e] hover:underline"
        >
          {toTitle}
        </button>
      </div>
      <p className="mt-1 text-xs text-[#8a8a7a]">{suggestion.reason}</p>
      <div className="mt-2 flex gap-2">
        <button
          onClick={onAccept}
          className="flex items-center gap-1 rounded bg-[#6b7c5e] px-2 py-1 text-xs text-white hover:bg-[#5a6a4e]"
        >
          <Check size={10} /> 接受
        </button>
        <button
          onClick={onReject}
          className="flex items-center gap-1 rounded border border-[#d5cdbc] px-2 py-1 text-xs text-[#8a8a7a] hover:bg-[#f0ece4]"
        >
          <X size={10} /> 忽略
        </button>
      </div>
    </div>
  )
}
