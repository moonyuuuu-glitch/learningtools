import { useState, useCallback } from 'react';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import type { Tag } from '../types';
import { nanoid } from '../utils';
import { useBeforeUnloadWarning } from '../hooks/useBeforeUnloadWarning';

interface Props {
  tags: Tag[];
  tagColors: string[];
  onUpsert: (tag: Tag) => void | Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function TagManagerModal({ tags, tagColors, onUpsert, onDelete, onClose }: Props) {
  const [editing, setEditing] = useState<Tag | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState(tagColors[0]);
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useBeforeUnloadWarning(dirty || isSaving, '标签有未保存更改，刷新或关闭会丢失。');

  const startNew = () => {
    setEditing({ id: nanoid(), name: '', color: tagColors[0] });
    setName('');
    setColor(tagColors[0]);
    setDirty(false);
  };
  const startEdit = (t: Tag) => {
    setEditing(t);
    setName(t.name);
    setColor(t.color);
    setDirty(false);
  };
  const save = useCallback(async () => {
    if (!editing || !name.trim()) return;
    if (isSaving) return;
    setIsSaving(true);
    try {
      await Promise.resolve(onUpsert({ ...editing, name: name.trim(), color }));
      setDirty(false);
      setEditing(null);
    } finally {
      setIsSaving(false);
    }
  }, [color, editing, isSaving, name, onUpsert]);

  const handleClose = () => {
    if (isSaving) return;
    if (dirty && !window.confirm('当前标签有未保存更改，确定要关闭吗？')) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(59,47,47,0.25)', backdropFilter: 'blur(4px)' }} onClick={handleClose}>
      <div className="w-96 rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>标签管理</h3>
          <button onClick={handleClose}><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        <div className="space-y-1 max-h-60 overflow-y-auto mb-3">
          {tags.map((t) => (
            <div key={t.id} className="flex items-center gap-2 px-2 py-2 rounded-xl group transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: t.color }} />
              <span className="flex-1 text-xs" style={{ color: 'var(--text-primary)' }}>{t.name}</span>
              <button onClick={() => startEdit(t)} className="opacity-0 group-hover:opacity-100"><Pencil size={12} style={{ color: 'var(--text-muted)' }} /></button>
              <button onClick={() => onDelete(t.id)} className="opacity-0 group-hover:opacity-100"><Trash2 size={12} className="hover:text-red-500" style={{ color: 'var(--text-muted)' }} /></button>
            </div>
          ))}
        </div>

        {editing ? (
          <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
            <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="标签名称" className="input-base" />
            <div className="flex gap-2 flex-wrap">
              {tagColors.map((c) => (
                <button key={c} onClick={() => { setColor(c); setDirty(true); }}
                  className="w-6 h-6 rounded-full border-2 transition-all"
                  style={{ background: c, borderColor: color === c ? 'var(--text-primary)' : 'transparent', transform: color === c ? 'scale(1.15)' : 'scale(1)' }} />
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => {
                if (dirty && !isSaving && !window.confirm('当前标签有未保存更改，确定取消编辑吗？')) return;
                setEditing(null);
                setDirty(false);
              }} className="text-xs px-3 py-1" style={{ color: 'var(--text-muted)' }}>取消</button>
              <button onClick={() => { void save(); }} className="text-xs text-white px-3 py-1 rounded-lg font-medium disabled:opacity-60" style={{ background: 'var(--accent)' }} disabled={isSaving}>{isSaving ? '保存中…' : '保存'}</button>
            </div>
          </div>
        ) : (
          <button onClick={startNew} className="flex items-center gap-1.5 text-xs font-medium mt-1"
            style={{ color: 'var(--accent)' }}>
            <Plus size={14} /> 新增标签
          </button>
        )}
      </div>
    </div>
  );
}
