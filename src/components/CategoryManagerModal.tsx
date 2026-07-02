import { useState } from 'react';
import { X, Plus, Pencil, Trash2 } from 'lucide-react';
import type { Category } from '../types';
import { nanoid } from '../utils';

interface Props {
  categories: Category[];
  onUpsert: (cat: Category) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function CategoryManagerModal({ categories, onUpsert, onDelete, onClose }: Props) {
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');

  const startNew = () => { setEditing({ id: nanoid(), name: '', order: categories.length }); setName(''); };
  const startEdit = (c: Category) => { setEditing(c); setName(c.name); };
  const save = () => {
    if (!editing || !name.trim()) return;
    onUpsert({ ...editing, name: name.trim() });
    setEditing(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(59,47,47,0.25)', backdropFilter: 'blur(4px)' }} onClick={onClose}>
      <div className="w-80 rounded-2xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-lg)' }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>分类管理</h3>
          <button onClick={onClose}><X size={16} style={{ color: 'var(--text-muted)' }} /></button>
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
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="分类名称（如：编程、历史…）" className="input-base" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditing(null)} className="text-xs px-3 py-1" style={{ color: 'var(--text-muted)' }}>取消</button>
              <button onClick={save} className="text-xs text-white px-3 py-1 rounded-lg font-medium" style={{ background: 'var(--accent)' }}>保存</button>
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
