import { ArrowRight, Bookmark, BookmarkCheck, EyeOff, RefreshCw } from 'lucide-react'
import type { Article, FrameworkCard as Framework } from '../types'
import { recommendationReason } from '../engine/recommendation'

export default function FrameworkCard({
  framework,
  articles,
  onNext,
  onTogglePin,
  onSuppress,
  onOpenGraph,
  onOpenSource,
}: {
  framework: Framework
  articles: Article[]
  onNext: () => void
  onTogglePin: () => void
  onSuppress: () => void
  onOpenGraph: () => void
  onOpenSource: (id: string) => void
}) {
  const sources = framework.sourceArticleIds
    .map((id) => articles.find((article) => article.id === id))
    .filter(Boolean) as Article[]

  return (
    <article className="framework-paper">
      <header className="flex items-start justify-between gap-8">
        <div>
          <p className="eyebrow">今天重看</p>
          <h1>{framework.title}</h1>
          <p className="recommendation-reason">{recommendationReason(framework)}</p>
        </div>
        <div className="framework-actions">
          <button onClick={onTogglePin} title={framework.pinned ? '取消置顶' : '置顶常看'}>
            {framework.pinned ? <BookmarkCheck size={17} /> : <Bookmark size={17} />}
          </button>
          <button onClick={onSuppress} title="不再推荐"><EyeOff size={17} /></button>
        </div>
      </header>

      <section className="framework-problem">
        <span>解决什么问题</span>
        <p>{framework.problem}</p>
      </section>

      <section>
        <h2>怎么使用</h2>
        <ol className="framework-steps">
          {framework.steps.map((step, index) => (
            <li key={`${step}-${index}`}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <p>{step}</p>
            </li>
          ))}
        </ol>
      </section>

      {framework.useCases.length > 0 && (
        <section className="framework-use-cases">
          <h2>适用场景</h2>
          <div>{framework.useCases.map((item) => <span key={item}>{item}</span>)}</div>
        </section>
      )}

      <footer>
        <div className="framework-sources">
          <span>来源</span>
          {sources.length === 0 && <em>尚未关联资料</em>}
          {sources.slice(0, 3).map((article) => (
            <button key={article.id} onClick={() => onOpenSource(article.id)}>
              {article.title}
            </button>
          ))}
        </div>
        <div className="framework-footer-actions">
          <button className="quiet-action" onClick={onNext}>
            <RefreshCw size={14} /> 再来一张
          </button>
          <button className="primary-action" onClick={onOpenGraph}>
            查看知识连接 <ArrowRight size={14} />
          </button>
        </div>
      </footer>
    </article>
  )
}