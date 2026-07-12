import { ArrowRight, Bot, Inbox, Library, Network, Sparkles } from 'lucide-react'
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
  const hasAnyContent =
    store.articles.length > 0
    || store.knowledgePoints.length > 0
    || store.frameworks.length > 0
    || store.relations.length > 0
    || store.candidates.length > 0

  const aiLabel =
    store.apiStatus === 'ready'
      ? 'AI 实时可用'
      : store.apiStatus === 'configured'
        ? 'AI 已配置'
        : store.apiStatus === 'checking'
          ? 'AI 检测中'
          : 'AI 未就绪'

  const syncLabel = store.syncStatus === 'ready' ? '云同步可用' : '云同步未配置'

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
          <h1>{hasAnyContent ? '你的知识已经在库里，但首页还没有浮出的框架卡片。' : '第一次打开时，这里本来就应该是空的。'}</h1>
          <p>
            {hasAnyContent
              ? '这通常意味着你还没有形成已审核的框架卡片，或资料还在等待整理。可以先去资料库补内容、去审核箱处理候选，或在图谱里继续浏览。'
              : '你的资料默认只保存在当前浏览器。先导入资料，或从你自己的云端快照恢复。下面的状态只反映当前环境真正可用的能力，不再假装“已接上”。'}
          </p>
          <div className="empty-home-status-grid">
            <section className="empty-home-status-card">
              <span className="empty-home-status-label">当前工作区</span>
              <strong>{hasAnyContent ? `本地已有 ${store.articles.length} 篇资料 / ${store.knowledgePoints.length} 个知识点` : '当前浏览器还没有本地数据'}</strong>
              <p>这里展示的是这台浏览器里的内容，不会替你预置任何示例知识。</p>
            </section>
            <section className="empty-home-status-card">
              <span className="empty-home-status-label">AI 状态</span>
              <strong>{aiLabel}</strong>
              <p>{store.apiMessage || '尚未检测 AI 能力'}</p>
              <button className="empty-home-inline-action" onClick={() => void store.verifyApi()}>
                <Bot size={14} /> 重新检测 AI
              </button>
            </section>
            <section className="empty-home-status-card">
              <span className="empty-home-status-label">云同步</span>
              <strong>{syncLabel}</strong>
              <p>{store.syncMessage || '尚未检测云同步能力'}</p>
            </section>
          </div>
          <div className="empty-home-path">
            <div>
              <span>1</span>
              <p>先去资料库导入文章、笔记或对话。</p>
            </div>
            <div>
              <span>2</span>
              <p>AI 与审核箱会逐步帮你提炼框架和关系。</p>
            </div>
            <div>
              <span>3</span>
              <p>再回到图谱里回忆、串联和复用这些知识。</p>
            </div>
          </div>
          <div className="empty-home-actions">
            <button className="primary-action" onClick={() => store.setViewMode('articles')}>
              <Library size={15} /> 去资料库
            </button>
            <button className="quiet-action" onClick={() => store.setViewMode('graph')}>
              <Network size={15} /> 打开图谱
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