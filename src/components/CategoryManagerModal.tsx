import { useState, useCallback } from 'react';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import type { Category } from '../types';
import { nanoid } from '../utils';
import { useBeforeUnloadWarning } from '../hooks/useBeforeUnloadWarning';

interface Props {
  categories: Category[];
  onUpsert: (cat: Category) => void | Promise<void>;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function CategoryManagerModal({ categories, onUpsert, onDelete, onClose }: Props) {
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [dirty, setDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useBeforeUnloadWarning(dirty || isSaving, '分类有未保存更改，刷新或关闭会丢失。');

  const startNew = () => {
    setEditing({ id: nanoid(), name: '', order: categories.length });
    setName('');
    setDirty(false);
  };
  const startEdit = (c: Category) => {
    setEditing(c);
    setName(c.name);
    setDirty(false);
  };
  const save = useCallback(async () => {
    if (!editing || !name.trim()) return;
    if (isSaving) return;
    setIsSaving(true);
    try {
      await Promise.resolve(onUpsert({ ...editing, name: name.trim() }));
      setDirty(false);
      setEditing(null);
    } finally {
      setIsSaving(false);
    }
  }, [editing, isSaving, name, onUpsert]);

  const handleClose = () => {
    if (isSaving) return;
    if (dirty && !window.confirm('当前分类有未保存更改，确定要关闭吗？')) return;
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(59,47,47,0.25)', backdropFilter: 'blur(4px)' }} onClick={handleClose}>
      <div className="w-80 rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>分类管理</h3>
          <button onClick={handleClose}><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
        </div>

        <div className="space-y-1 max-h-60 overflow-y-auto mb-3">
          {categories.map((c) => (
            <div key={c.id} className="flex items-center gap-2 px-2 py-2 rounded-xl group transition-colors"
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-surface)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
              <span className="flex-1 text-xs" style={{ color: 'var(--text-primary)' }}>{c.name}</span>
              <button onClick={() => startEdit(c)} className="opacity-0 group-hover:opacity-100"><Pencil size={12} style={{ color: 'var(--text-muted)' }} /></button>
              <button onClick={() => onDelete(c.id)} className="opacity-0 group-hover:opacity-100"><Trash2 size={12} className="hover:text-red-500" style={{ color: 'var(--text-muted)' }} /></button>
            </div>
          ))}
        </div>

        {editing ? (
          <div className="rounded-xl p-3 space-y-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-light)' }}>
            <input value={name} onChange={(e) => { setName(e.target.value); setDirty(true); }} placeholder="分类名称（如：编程、历史…）" className="input-base" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => {
                if (dirty && !isSaving && !window.confirm('当前分类有未保存更改，确定取消编辑吗？')) return;
                setEditing(null);
                setDirty(false);
              }} className="text-xs px-3 py-1" style={{ color: 'var(--text-muted)' }}>取消</button>
              <button onClick={() => { void save(); }} className="text-xs text-white px-3 py-1 rounded-lg font-medium disabled:opacity-60" style={{ background: 'var(--accent)' }} disabled={isSaving}>{isSaving ? '保存中…' : '保存'}</button>
            </div>
          </div>
        ) : (
          <button onClick={startNew} className="flex items-center gap-1.5 text-xs font-medium mt-1"
            style={{ color: 'var(--accent)' }}>
            <Plus size={14} /> 新增分类
          </button>
        )}
      </div>
    </div>
  );
}
