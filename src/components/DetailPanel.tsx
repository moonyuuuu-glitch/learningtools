import { useEffect, useMemo, useState, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { X, Trash2, Link2, Save, Sparkles } from 'lucide-react';
import type { Store } from '../hooks/useStore';
import type { KnowledgePoint } from '../types';
import { nanoid } from '../utils';
import { summarizeContent, suggestTags } from '../api/ai';
import { useBeforeUnloadWarning } from '../hooks/useBeforeUnloadWarning';

interface Props { store: Store; }

const TAG_COLORS = ['#E8A87C', '#D9534F', '#85B7A7', '#7DB8B0', '#C7A4C0', '#F0C987', '#8AACB8', '#C8B8DB', '#F4B9B2'];

function normalizeTagName(value: string) {
  return value.trim().replace(/^#+\s*/, '').toLowerCase();
}

function pickTagColor(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

function sanitizeSuggestion(value: string) {
  return value.trim().replace(/^#+\s*/, '');
}

function levenshtein(a: string, b: string) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]) + 1;
    }
  }
  return dp[a.length][b.length];
}

function findClosestTagId(
  normalized: string,
  tagNameToId: Map<string, string>,
  maxDistance = 2,
) {
  let bestId: string | undefined;
  let bestDistance = Number.MAX_SAFE_INTEGER;
  for (const [name, id] of tagNameToId.entries()) {
    const distance = levenshtein(normalized, name);
    if (distance <= maxDistance && distance < bestDistance) {
      bestDistance = distance;
      bestId = id;
    }
  }
  return bestId;
}

export default function DetailPanel({ store }: Props) {
  const { selectedKPId, setSelectedKPId, knowledgePoints, tagMap, upsertKP, removeKP, articles } = store;

  const kp = useMemo(() => knowledgePoints.find((k) => k.id === selectedKPId), [knowledgePoints, selectedKPId]);
  const [title, setTitle] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [linkedPoints, setLinkedPoints] = useState<string[]>([]);
  const [linkSearch, setLinkSearch] = useState('');
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [aiBusy, setAiBusy] = useState<'summary' | 'tags' | null>(null);
  const [aiError, setAiError] = useState('');
  useBeforeUnloadWarning(dirty || isSaving, '知识点有未保存更改，刷新或关闭会丢失。');

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder: '在这里输入知识点的详细讲解…' }),
    ],
    content: '',
    onUpdate: () => setDirty(true),
    editorProps: { attributes: { class: 'tiptap' } },
  });

  useEffect(() => {
    if (!editor) return;
    if (kp) {
      setTitle(kp.title);
      setSelectedTags(kp.tags);
      setLinkedPoints(kp.linkedPoints);
      try { editor.commands.setContent(kp.content ? JSON.parse(kp.content) : ''); }
      catch { editor.commands.setContent(kp.content); }
      setDirty(false);
    } else {
      editor.commands.setContent('');
      setTitle('');
      setSelectedTags([]);
      setLinkedPoints([]);
      setDirty(false);
    }
  }, [kp, editor]);

  const saveIfNeeded = useCallback(async () => {
    if (!editor || !kp || isSaving || !dirty) return;
    setIsSaving(true);
    const now = Date.now();
    const id = kp.id;
    const updated: KnowledgePoint = {
      id,
      title: title.trim() || '未命名',
      content: JSON.stringify(editor.getJSON()),
      parentId: kp.parentId,
      tags: selectedTags,
      linkedPoints,
      createdAt: kp.createdAt ?? now,
      updatedAt: now,
    };
    try {
      await upsertKP(updated);
      setSelectedKPId(id);
      setDirty(false);
    } finally {
      setIsSaving(false);
    }
  }, [dirty, editor, isSaving, kp, linkedPoints, selectedTags, setSelectedKPId, title, upsertKP]);

  const handleSave = () => {
    void saveIfNeeded();
  };

  const handleNew = () => {
    const now = Date.now();
    const blank: KnowledgePoint = { id: nanoid(), title: '新知识点', content: '', parentId: undefined, tags: [], linkedPoints: [], createdAt: now, updatedAt: now };
    upsertKP(blank).then(() => setSelectedKPId(blank.id));
  };

  const backlinks = useMemo(() => knowledgePoints.filter((k) => k.id !== selectedKPId && k.linkedPoints.includes(selectedKPId ?? '')), [knowledgePoints, selectedKPId]);
  const relatedArticles = useMemo(() => articles.filter((a) => a.knowledgePoints.includes(selectedKPId ?? '')), [articles, selectedKPId]);

  const linkSuggestions = useMemo(() => {
    if (!linkSearch) return [];
    return knowledgePoints.filter((k) => k.id !== selectedKPId && k.title.toLowerCase().includes(linkSearch.toLowerCase()) && !linkedPoints.includes(k.id)).slice(0, 6);
  }, [linkSearch, knowledgePoints, selectedKPId, linkedPoints]);

  const toggleTag = (id: string) => {
    setSelectedTags((prev) => prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]);
    setDirty(true);
  };

  const addLink = (id: string) => {
    setLinkedPoints((prev) => [...prev, id]);
    setLinkSearch('');
    setDirty(true);
  };

  const removeLink = (id: string) => {
    setLinkedPoints((prev) => prev.filter((l) => l !== id));
    setDirty(true);
  };

  useEffect(() => {
    if (!dirty || !kp) return;
    const timer = window.setTimeout(() => {
      void saveIfNeeded();
    }, 800);
    return () => window.clearTimeout(timer);
  }, [dirty, kp, saveIfNeeded]);

  const handleAiSummary = async () => {
    if (!editor || !title.trim()) return;
    setAiBusy('summary');
    setAiError('');
    try {
      const plainText = editor.getText().trim();
      const result = await summarizeContent({
        title,
        content: plainText || title,
      });
      editor.commands.setContent(
        `<p>${result.summary}</p><ul>${result.bullets.map((item) => `<li>${item}</li>`).join('')}</ul>`,
      );
      setDirty(true);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 总结失败');
    } finally {
      setAiBusy(null);
    }
  };

  const handleAiTags = async () => {
    if (!editor || !title.trim()) return;
    setAiBusy('tags');
    setAiError('');
    try {
      const result = await suggestTags({
        title,
        content: editor.getText().trim() || title,
        existingTags: Array.from(tagMap.values()).map((tag) => tag.name),
        relatedKnowledgePoints: linkedPoints
          .map((id) => knowledgePoints.find((k) => k.id === id)?.title)
          .filter(Boolean) as string[],
      });
      const tagNameToId = new Map(
        Array.from(tagMap.values()).map((tag) => [normalizeTagName(tag.name), tag.id]),
      );
      const nextTags = new Set(selectedTags);
      for (const rawSuggestion of result.suggestions) {
        const suggestion = sanitizeSuggestion(rawSuggestion);
        if (!suggestion) continue;
        const normalized = normalizeTagName(suggestion);
        let matchedTagId = tagNameToId.get(normalized);
        if (!matchedTagId) {
          matchedTagId = findClosestTagId(normalized, tagNameToId);
        }
        if (!matchedTagId) {
          const newTag = {
            id: nanoid(),
            name: suggestion,
            color: pickTagColor(suggestion),
          };
          await store.upsertTag(newTag);
          matchedTagId = newTag.id;
          tagNameToId.set(normalized, matchedTagId);
        }
        nextTags.add(matchedTagId);
      }
      setSelectedTags(Array.from(nextTags));
      setDirty(true);
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI 标签建议失败');
    } finally {
      setAiBusy(null);
    }
  };

  if (!selectedKPId && !kp) {
    return (
      <aside className="w-72 flex flex-col items-center justify-center gap-4"
        style={{ borderLeft: '1px solid var(--border-light)', background: 'var(--bg-card)' }}>
        <div className="text-center px-6">
          <div className="w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center"
            style={{ background: 'var(--bg-surface)' }}>
            <Network size={20} style={{ color: 'var(--text-muted)' }} />
          </div>
          <p className="text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>点击图谱中的节点</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>查看和编辑知识点</p>
        </div>
        <button onClick={handleNew} className="text-xs text-white px-4 py-2 rounded-lg font-medium transition-colors"
          style={{ background: 'var(--accent)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--accent-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}>
          + 新建知识点
        </button>
      </aside>
    );
  }

  return (
    <aside className="w-80 flex flex-col" style={{ borderLeft: '1px solid var(--border-light)', background: 'var(--bg-card)' }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
        <span className="text-xs font-semibold flex-1" style={{ color: 'var(--text-secondary)' }}>知识点详情</span>
        {(dirty || isSaving) && (
          <button onClick={handleSave} className="flex items-center gap-1 text-xs text-white px-2.5 py-1 rounded-lg font-medium disabled:opacity-60"
            style={{ background: 'var(--accent)' }} disabled={isSaving}>
            <Save size={11} /> {isSaving ? '保存中…' : '保存'}
          </button>
        )}
        <button onClick={() => { if (kp) removeKP(kp.id); }} title="删除">
          <Trash2 size={14} style={{ color: 'var(--text-muted)' }} className="hover:text-red-500 transition-colors" />
        </button>
        <button onClick={() => {
          if (dirty && !isSaving && !window.confirm('当前知识点有未保存更改，确定要关闭吗？')) return;
          setSelectedKPId(null);
        }}>
          <X size={14} style={{ color: 'var(--text-muted)' }} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Title */}
        <div className="px-4 pt-3 pb-2">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
            onBlur={() => { void saveIfNeeded(); }}
            placeholder="知识点标题"
            className="w-full bg-transparent focus:outline-none text-sm font-semibold py-1"
            style={{ color: 'var(--text-primary)', borderBottom: '1px solid var(--border-light)' }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
          />
        </div>

        {/* Tags */}
        <div className="px-4 pb-3">
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>标签</p>
          <div className="flex flex-wrap gap-1">
            {Array.from(tagMap.values()).map((tag) => {
              const active = selectedTags.includes(tag.id);
              return (
                <button key={tag.id} onClick={() => toggleTag(tag.id)}
                  className="text-[11px] px-2 py-0.5 rounded-full transition-all font-medium"
                  style={{
                    background: active ? tag.color : 'var(--bg-surface)',
                    color: active ? '#fff' : 'var(--text-secondary)',
                    border: active ? 'none' : '1px solid var(--border-light)',
                  }}>
                  {tag.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Editor */}
        <div className="px-4 pb-3">
          <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>笔记</p>
          <div className="flex items-center gap-2 mb-2">
            <button
              onClick={handleAiSummary}
              disabled={aiBusy !== null}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-lg font-medium disabled:opacity-60"
              style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
            >
              <Sparkles size={12} />
              {aiBusy === 'summary' ? 'AI 总结中…' : 'AI 总结'}
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
          {aiError && (
            <p className="text-[11px] mb-2" style={{ color: 'var(--accent)' }}>
              {aiError}
            </p>
          )}
          <div className="rounded-xl p-3 min-h-[140px]"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border-light)' }}>
            <EditorContent editor={editor} />
          </div>
        </div>

        {/* Linked Knowledge Points */}
        <div className="px-4 pb-3">
          <p className="text-[11px] mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            <Link2 size={10} /> 关联知识点
          </p>
          <div className="space-y-1 mb-2">
            {linkedPoints.map((lid) => {
              const t = knowledgePoints.find((k) => k.id === lid);
              return t ? (
                <div key={lid} className="flex items-center gap-2 rounded-lg px-2 py-1.5 group"
                  style={{ background: 'var(--bg-surface)' }}>
                  <button onClick={() => setSelectedKPId(lid)} className="flex-1 text-left text-xs truncate transition-colors"
                    style={{ color: 'var(--accent)' }}>{t.title}</button>
                  <button onClick={() => removeLink(lid)} className="opacity-0 group-hover:opacity-100 transition-opacity">
                    <X size={10} className="hover:text-red-500" style={{ color: 'var(--text-muted)' }} />
                  </button>
                </div>
              ) : null;
            })}
          </div>
          <div className="relative">
            <input value={linkSearch} onChange={(e) => setLinkSearch(e.target.value)} placeholder="搜索并添加关联…" className="input-base" />
            {linkSuggestions.length > 0 && (
              <div className="absolute z-20 top-full mt-1 left-0 right-0 rounded-xl overflow-hidden"
                style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}>
                {linkSuggestions.map((s) => (
                  <button key={s.id} onClick={() => addLink(s.id)}
                    className="block w-full text-left px-3 py-2 text-xs transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Backlinks */}
        {backlinks.length > 0 && (
          <div className="px-4 pb-3">
            <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>反向链接</p>
            {backlinks.map((b) => (
              <button key={b.id} onClick={() => setSelectedKPId(b.id)}
                className="block text-xs py-0.5 truncate w-full text-left transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                ← {b.title}
              </button>
            ))}
          </div>
        )}

        {/* Related articles */}
        {relatedArticles.length > 0 && (
          <div className="px-4 pb-4">
            <p className="text-[11px] mb-1.5" style={{ color: 'var(--text-muted)' }}>相关文章</p>
            {relatedArticles.map((a) => (
              <a key={a.id} href={a.url || '#'} target="_blank" rel="noreferrer"
                className="block text-xs py-0.5 truncate transition-colors"
                style={{ color: 'var(--text-secondary)' }}
                onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}>
                ↗ {a.title}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* New KP button at bottom */}
      <div className="px-4 py-3" style={{ borderTop: '1px solid var(--border-light)' }}>
        <button onClick={handleNew} className="w-full text-xs py-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--accent)' }}>+ 新建知识点</button>
      </div>
    </aside>
  );
}

function Network(props: { size: number; style?: React.CSSProperties }) {
  return (
    <svg width={props.size} height={props.size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={props.style}>
      <circle cx="12" cy="5" r="3"/><circle cx="6" cy="19" r="3"/><circle cx="18" cy="19" r="3"/>
      <path d="M12 8v4m-4.5 3.5L10 13m4 0 2.5 2.5"/>
    </svg>
  );
}
