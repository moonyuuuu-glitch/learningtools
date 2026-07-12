import { ArrowRight, Inbox, Library, Sparkles } from 'lucide-react'
import type { Store } from '../hooks/useStore'
import FrameworkCard from './FrameworkCard'
import { rankFrameworks } from '../engine/recommendation'
import { nanoid } from '../utils'
import { useMemo, useState } from 'react'

export default function HomeWorkspace({ store }: { store: Store }) {
  const ranked = useMemo(
    () => rankFrameworks(store.frameworks, store.interactionEvents),
    [store.frameworks, store.interactionEvents],
  )
  const [offset, setOffset] = useState(0)
  const current = ranked.length > 0 ? ranked[offset % ranked.length].framework : null
  const pending = store.candidates.filter((candidate) => candidate.status === 'pending').length

  const record = (type: Parameters<typeof store.addInteraction>[0]['type'], id: string) =>
    store.addInteraction({
      id: nanoid(),
      type,
      entityType: type === 'source_open' ? 'article' : 'framework',
      entityId: id,
      createdAt: Date.now(),
    })

  if (!current) {
    return (
      <main className="home-workspace empty-home">
        <div className="empty-home-copy">
          <p className="eyebrow">个人研究工作台</p>
          <h1>让真正有用的知识，再次浮现。</h1>
          <p>
            导入资料后，AI 会识别值得反复使用的框架。你确认过的内容，
            会在这里以一张安静的卡片重新出现。
          </p>
          <div className="empty-home-actions">
            <button className="primary-action" onClick={() => store.setViewMode('articles')}>
              <Library size={15} /> 去资料库
            </button>
            <button className="quiet-action" onClick={() => store.setViewMode('review')}>
              <Inbox size={15} /> 查看审核箱 {pending > 0 && `(${pending})`}
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="home-workspace">
      <div className="home-heading">
        <div>
          <p className="eyebrow">个人研究工作台</p>
          <h2>从你学过的内容里，捞回一件值得使用的东西。</h2>
        </div>
        {pending > 0 && (
          <button className="review-nudge" onClick={() => store.setViewMode('review')}>
            <Sparkles size={14} />
            {pending} 条候选等待确认
            <ArrowRight size={13} />
          </button>
        )}
      </div>

      <FrameworkCard
        framework={current}
        articles={store.articles}
        onNext={() => {
          void record('framework_view', current.id)
          setOffset((value) => value + 1)
        }}
        onTogglePin={() => {
          void store.upsertFramework({ ...current, pinned: !current.pinned })
          void record('framework_pin', current.id)
        }}
        onSuppress={() => {
          void store.upsertFramework({ ...current, suppressed: true })
          void record('framework_suppress', current.id)
        }}
        onOpenGraph={() => {
          store.setSelectedFrameworkId(current.id)
          store.setViewMode('graph')
          void record('graph_focus', current.id)
        }}
        onOpenSource={(articleId) => {
          store.setSelectedArticleId(articleId)
          store.setViewMode('articles')
          void record('source_open', articleId)
        }}
      />
    </main>
  )
}