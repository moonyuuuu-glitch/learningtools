import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Store } from '../hooks/useStore';
import type { Article } from '../types';
import { formatDate } from '../utils';

interface Props { store: Store; }

function getDays(offset: number, count: number): string[] {
  const days: string[] = [];
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() + offset);
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  return days;
}

// Soft pastel row backgrounds for categories
const ROW_COLORS = ['#FFF3C720', '#FFE1E120', '#DBEAFE20', '#D1FAE520', '#FED7AA20', '#E8E0F020'];

export default function CalendarBoard({ store }: Props) {
  const { articles, categories } = store;
  const [weekOffset, setWeekOffset] = useState(-13);
  const days = useMemo(() => getDays(weekOffset, 14), [weekOffset]);

  const cellMap = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const a of articles) {
      if (!days.includes(a.readDate)) continue;
      const key = `${a.categoryId}_${a.readDate}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(a);
    }
    return map;
  }, [articles, days]);

  const [tooltip, setTooltip] = useState<{ article: Article; x: number; y: number } | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex flex-col h-full" style={{ background: 'var(--bg-main)' }}>
      {/* Controls */}
      <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid var(--border-light)' }}>
        <button onClick={() => setWeekOffset((o) => o - 14)} className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
          <ChevronLeft size={16} />
        </button>
        <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          {formatDate(days[0])} — {formatDate(days[days.length - 1])}
        </span>
        <button onClick={() => setWeekOffset((o) => o + 14)} className="p-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-secondary)' }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--bg-hover)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}>
          <ChevronRight size={16} />
        </button>
        <button onClick={() => setWeekOffset(-13)} className="text-xs px-3 py-1 rounded-lg transition-colors"
          style={{ color: 'var(--accent)', background: 'var(--accent-light)' }}>回到今天</button>
        <div className="flex-1" />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{articles.length} 篇记录</span>
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-auto px-5 py-3">
        <div className="rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow)' }}>
          <table className="min-w-full text-xs border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 110 }} />
              {days.map((d) => <col key={d} style={{ width: 95 }} />)}
            </colgroup>
            <thead className="sticky top-0 z-10">
              <tr>
                <th className="sticky left-0 z-20 px-3 py-2.5 text-left font-medium"
                  style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-light)', borderRight: '1px solid var(--border-light)' }}>
                  分类
                </th>
                {days.map((d) => (
                  <th key={d} className="px-2 py-2.5 text-center font-medium"
                    style={{
                      background: d === today ? 'var(--accent-light)' : 'var(--bg-surface)',
                      color: d === today ? 'var(--accent)' : 'var(--text-muted)',
                      borderBottom: '1px solid var(--border-light)',
                    }}>
                    <div>{d.slice(5).replace('-', '/')}</div>
                    <div className="text-[10px] opacity-60 mt-0.5">{['日','一','二','三','四','五','六'][new Date(d).getDay()]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {categories.map((cat, ci) => (
                <tr key={cat.id}>
                  <td className="sticky left-0 z-10 px-3 py-2.5 font-medium whitespace-nowrap"
                    style={{ background: 'var(--bg-card)', color: 'var(--text-secondary)', borderRight: '1px solid var(--border-light)', borderBottom: '1px solid var(--border-light)' }}>
                    {cat.name}
                  </td>
                  {days.map((d) => {
                    const cells = cellMap.get(`${cat.id}_${d}`) ?? [];
                    return (
                      <td key={d} className="px-1.5 py-1.5 align-top"
                        style={{
                          borderBottom: '1px solid var(--border-light)',
                          borderRight: '1px solid var(--border-light)',
                          background: d === today ? 'var(--accent-light)' : (ROW_COLORS[ci % ROW_COLORS.length] ?? 'transparent'),
                          minHeight: 44,
                        }}>
                        <div className="space-y-1">
                          {cells.map((a) => (
                            <div
                              key={a.id}
                              className="rounded-md px-1.5 py-1 text-[10px] truncate cursor-pointer transition-all font-medium"
                              title={a.title}
                              style={{ background: 'var(--bg-card)', border: '1px solid var(--border-light)', color: 'var(--text-primary)', boxShadow: 'var(--shadow)' }}
                              onMouseEnter={(e) => {
                                const rect = (e.target as HTMLElement).getBoundingClientRect();
                                setTooltip({ article: a, x: rect.left, y: rect.bottom + 4 });
                                (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)';
                              }}
                              onMouseLeave={(e) => {
                                setTooltip(null);
                                (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-light)';
                              }}
                            >
                              {a.title}
                            </div>
                          ))}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {categories.length === 0 && (
                <tr><td colSpan={15} className="text-center py-16" style={{ color: 'var(--text-muted)' }}>请先在导航栏添加学习分类</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 rounded-xl p-3 max-w-xs pointer-events-none"
          style={{ left: Math.min(tooltip.x, window.innerWidth - 260), top: tooltip.y, background: 'var(--bg-card)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)' }}
        >
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>{tooltip.article.title}</div>
          {tooltip.article.summary && <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{tooltip.article.summary}</div>}
          {tooltip.article.url && <div className="text-[11px] mt-1 truncate" style={{ color: 'var(--accent)' }}>{tooltip.article.url}</div>}
        </div>
      )}
    </div>
  );
}
