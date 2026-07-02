import { useState, useMemo, useEffect, useCallback } from 'react';
import { Plus, ExternalLink, Trash2, X, Sparkles } from 'lucide-react';
import type { Store } from '../hooks/useStore';
import type { Article } from '../types';
import { nanoid } from '../utils';
import { summarizeContent, suggestTags } from '../api/ai';
import { useBeforeUnloadWarning } from '../hooks/useBeforeUnloadWarning';

interface Props { store: Store; }

function ArticleForm({ article, store, onClose }: { article: Partial<Article>; store: Store; onClose: () => void }) {
  const [articleId] = useState(article.id ?? nanoid());
  const [createdAt] = useState(article.createdAt ?? Date.now());
  const [title, setTitle] = useState(article.title ?? '');
  const [url, setUrl] = useState(article.url ?? '');
  const [summary, setSummary] = useState(article.summary ?? '');
  const [notes, setNotes] = useState(article.notes ?? '');
  const [categoryId, setCategoryId] = useState(article.categoryId ?? store.categories[0]?.id ?? '');
  const [selTags, setSelTags] = useState<string[]>(article.tags ?? []);
  const [selKPs, setSelKPs] = useState<string[]>(article.knowledgePoints ?? []);
  const [readDate, setReadDate] = useState(article.readDate ?? new Date().toISOString().slice(0, 10));
  const [aiBusy, setAiBusy] = useState<'summary' | 'tags' | null>(null);
  const [aiError, setAiError] = useState('');
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useBeforeUnloadWarning(dirty || isSaving, '文章有未保存更改，刷新或关闭会丢失。');

  const toggleTag = (id: string) => {
    setSelTags((p) => p.includes(id) ? p.filter((t) => t !== id) : [...p, id]);
    setDirty(true);
  };
  const toggleKP = (id: string) => {
    setSelKPs((p) => p.includes(id) ? p.filter((k) => k !== id) : [...p, id]);
    setDirty(true);
  };

  const persist = useCallback(async (closeAfterSave = false) => {
    const trimmedTitle = title.trim();
    const hasInput = Boolean(
      trimmedTitle ||
      url.trim() ||
      summary.trim() ||
      notes.trim() ||
      selTags.length > 0 ||
      selKPs.length > 0,
    );
    if (!hasInput || isSaving) return;
    setIsSaving(true);
    try {
      await store.upsertArticle({
        id: articleId,
        title: trimmedTitle || '未命名文章',
        url: url.trim() || undefined,
        summary: summary.trim() || undefined,
        notes: notes.trim() || undefined,
        categoryId,
        tags: selTags,
        knowledgePoints: selKPs,
        readDate,
        createdAt,
      });
      setDirty(false);
      if (closeAfterSave) onClose();
    } finally {
      setIsSaving(false);
    }
  }, [
    title,
    url,
    summary,
    notes,
    selTags,
    selKPs,
    isSaving,
    store,
    articleId,
    categoryId,
    readDate,
    createdAt,
    onClose,
  ]);

  useEffect(() => {
    if (!dirty) return;
    const timer = window.setTimeout(() => {
      void persist(false);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [dirty, persist]);

  const save = async () => {
    await persist(true);
  };

  const handleClose = () => {
    if (dirty && !isSaving && !window.confirm('当前文章有未保存更改，确定要关闭吗？')) return;
    onClose();
  };

  const handleAiSummary = async () => {
    if (!title.trim()) return;
    setAiBusy('summary');
    setAiError('');
    try {
      const result = await summarizeContent({
        title,
        content: notes.trim() || summary.trim() || title,
      });
      setSummary(result.summary);
      setNotes(result.bullets.map((item) => `- ${item}`).join('\n'));
      setDirty(true);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 摘要失败');
    } finally {
      setAiBusy(null);
    }
  };

  const handleAiTags = async () => {
    if (!title.trim()) return;
    setAiBusy('tags');
    setAiError('');
    try {
      const result = await suggestTags({
        title,
        content: notes.trim() || summary.trim() || title,
      });
      const tagNameToId = new Map(
        Array.from(store.tagMap.values()).map((tag) => [tag.name.toLowerCase(), tag.id]),
      );
      const nextTags = new Set(selTags);
      for (const suggestion of result.suggestions) {
        const matchedTagId = tagNameToId.get(suggestion.toLowerCase());
        if (matchedTagId) {
          nextTags.add(matchedTagId);
        }
      }
      setSelTags(Array.from(nextTags));
      setDirty(true);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 标签建议失败');
    } finally {
      setAiBusy(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(59,47,47,0.25)', backdropFilter: 'blur(4px)' }} onClick={handleClose}>
      <div className="w-full max-w-lg rounded-2xl p-6 max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{article.id ? '编辑文章' : '添加文章'}</h3>
          <button onClick={handleClose}><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
        </div>
        <div className="space-y-3.5">
          <Field label="标题 *"><input value={title} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} className="input-base" placeholder="文章标题" /></Field>
          <Field label="链接"><input value={url} onChange={(e) => { setUrl(e.target.value); setDirty(true); }} className="input-base" placeholder="https://..." /></Field>
          <Field label="摘要"><textarea value={summary} onChange={(e) => { setSummary(e.target.value); setDirty(true); }} className="input-base resize-none" rows={2} placeholder="一两句话总结…" /></Field>
          <Field label="笔记 / 原文摘录"><textarea value={notes} onChange={(e) => { setNotes(e.target.value); setDirty(true); }} className="input-base resize-none" rows={4} placeholder="可粘贴文章内容、阅读笔记，用于 AI 总结和标签建议" /></Field>
          <div className="flex items-center gap-2">
            <button
              onClick={handleAiSummary}
              disabled={aiBusy !== null}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-medium disabled:opacity-60"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              <Sparkles size={12} />
              {aiBusy === 'summary' ? 'AI 总结中…' : 'AI 生成摘要'}
            </button>
            <button
              onClick={handleAiTags}
              disabled={aiBusy !== null}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-medium disabled:opacity-60"
              style={{ background: 'var(--bg-surface)', color: 'var(--text-secondary)' }}
            >
              <Sparkles size={12} />
              {aiBusy === 'tags' ? '标签生成中…' : 'AI 标签建议'}
            </button>
          </div>
          {aiError && <p className="text-[11px]" style={{ color: 'var(--accent)' }}>{aiError}</p>}
          <Field label="分类">
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setDirty(true); }} className="input-base">
              {store.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="阅读日期"><input type="date" value={readDate} onChange={(e) => { setReadDate(e.target.value); setDirty(true); }} className="input-base" /></Field>
          <Field label="标签">
            <div className="flex flex-wrap gap-1">
              {Array.from(store.tagMap.values()).map((tag) => {
                const active = selTags.includes(tag.id);
                return <button key={tag.id} onClick={() => toggleTag(tag.id)}
                  className="text-[11px] px-2 py-0.5 rounded-full transition-all font-medium"
                  style={{ background: active ? tag.color : 'var(--bg-surface)', color: active ? '#fff' : 'var(--text-secondary)', border: active ? 'none' : '1px solid var(--border-light)' }}>
                  {tag.name}
                </button>;
              })}
            </div>
          </Field>
          <Field label="关联知识点">
            <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
              {store.knowledgePoints.map((kp) => {
                const active = selKPs.includes(kp.id);
                return <button key={kp.id} onClick={() => toggleKP(kp.id)}
                  className="text-[11px] px-2 py-0.5 rounded-lg transition-all font-medium"
                  style={{ background: active ? 'var(--accent)' : 'var(--bg-surface)', color: active ? '#fff' : 'var(--text-secondary)', border: active ? 'none' : '1px solid var(--border-light)' }}>
                  {kp.title}
                </button>;
              })}
            </div>
          </Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={handleClose} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>取消</button>
          <button onClick={() => { void save(); }} className="text-xs text-white px-4 py-1.5 rounded-lg font-medium disabled:opacity-60" style={{ background: 'var(--accent)' }} disabled={isSaving}>保存</button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-[11px] mb-1" style={{ color: 'var(--text-muted)' }}>{label}</label>{children}</div>;
}

export default function ArticleLibrary({ store }: Props) {
  const { articles, tagMap, categoryMap, filterTags, searchQuery, removeArticle } = store;
  const [filterCat, setFilterCat] = useState('');
  const [editing, setEditing] = useState<Partial<Article> | null>(null);

  const filtered = useMemo(() => {
    let list = articles;
    if (filterCat) list = list.filter((a) => a.categoryId === filterCat);
    if (filterTags.length > 0) list = list.filter((a) => a.tags.some((t) => filterTags.includes(t)));
    if (searchQuery) list = list.filter((a) => a.title.toLowerCase().includes(searchQuery.toLowerCase()) || a.summary?.toLowerCase().includes(searchQuery.toLowerCase()));
    return list;
  }, [articles, filterCat, filterTags, searchQuery]);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-main)' }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
        <select value={filterCat} onChange={(e) => setFilterCat(e.target.value)} className="input-base !w-auto">
          <option value="">全部分类</option>
          {store.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div className="flex flex-wrap gap-1">
          {Array.from(tagMap.values()).map((tag) => {
            const active = store.filterTags.includes(tag.id);
            return (
              <button key={tag.id} onClick={() => store.setFilterTags(active ? store.filterTags.filter((t) => t !== tag.id) : [...store.filterTags, tag.id])}
                className="text-[11px] px-2.5 py-1 rounded-full transition-all font-medium"
                style={{ background: active ? tag.color : 'var(--bg-card)', color: active ? '#fff' : 'var(--text-secondary)', border: active ? 'none' : '1px solid var(--border-light)', boxShadow: active ? 'none' : 'var(--shadow)' }}>
                {!active && <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ background: tag.color }} />}{tag.name}
              </button>
            );
          })}
        </div>
        <div className="flex-1" />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{filtered.length} 篇文章</span>
        <button onClick={() => setEditing({})} className="flex items-center gap-1 text-xs text-white px-3 py-2 rounded-lg font-medium transition-colors"
          style={{ background: 'var(--accent)' }}>
          <Plus size={13} /> 添加文章
        </button>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto px-5 py-3">
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow)' }}>
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-light)' }}>
                {['标题', '分类', '标签', '关联知识点', '阅读日期', ''].map((h) => (
                  <th key={h} className="text-left px-4 py-3 font-medium" style={{ color: 'var(--text-muted)', background: 'var(--bg-surface)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id} className="group" style={{ borderBottom: '1px solid var(--border-light)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-medium truncate" style={{ color: 'var(--text-primary)' }}>{a.title}</span>
                      {a.url && <a href={a.url} target="_blank" rel="noreferrer"><ExternalLink size={10} style={{ color: 'var(--text-muted)' }} /></a>}
                    </div>
                    {a.summary && <div className="truncate mt-0.5" style={{ color: 'var(--text-muted)' }}>{a.summary}</div>}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{categoryMap.get(a.categoryId)?.name ?? '-'}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {a.tags.map((tid) => {
                        const t = tagMap.get(tid);
                        return t ? <span key={tid} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: `${t.color}25`, color: t.color }}>{t.name}</span> : null;
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 flex-wrap">
                      {a.knowledgePoints.map((kid) => {
                        const kp = store.knowledgePoints.find((k) => k.id === kid);
                        return kp ? (
                          <button key={kid} onClick={() => { store.setSelectedKPId(kid); store.setViewMode('graph'); }}
                            className="text-[10px] px-1.5 py-0.5 rounded-md font-medium transition-colors"
                            style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}>
                            {kp.title}
                          </button>
                        ) : null;
                      })}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{a.readDate}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditing(a)} className="p-1" style={{ color: 'var(--text-muted)' }}>✎</button>
                      <button onClick={() => removeArticle(a.id)} className="p-1 hover:text-red-500" style={{ color: 'var(--text-muted)' }}><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-16 text-sm" style={{ color: 'var(--text-muted)' }}>暂无文章，点击"添加文章"开始记录</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing !== null && <ArticleForm article={editing} store={store} onClose={() => setEditing(null)} />}
    </div>
  );
}
