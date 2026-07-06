import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface ConceptNodeData {
  label: string;
  tagColor: string;
  selected: boolean;
  articleCount: number;   // 被多少篇文章引用（决定大小）
  childCount: number;     // 子概念数量
  dimmed?: boolean;
}

export default memo(function ConceptNode({ data }: { data: ConceptNodeData }) {
  const isSelected = data.selected;
  const isDimmed = data.dimmed && !isSelected;
  const isolated = data.articleCount === 0;
  // 大小随引用数缩放：0 篇最小，越多越大
  const scale = Math.min(1 + data.articleCount * 0.18, 2.2);
  const fontSize = Math.round(12 * Math.min(scale, 1.6));
  const padY = Math.round(5 * scale);
  const padX = Math.round(10 * scale);

  return (
    <div
      className="rounded-full font-medium cursor-pointer transition-all inline-flex items-center gap-1"
      style={{
        background: isSelected ? data.tagColor : 'var(--bg-card)',
        border: `1.5px ${isolated ? 'dashed' : 'solid'} ${isSelected ? data.tagColor : (isolated ? 'var(--border)' : data.tagColor)}`,
        color: isSelected ? '#fff' : 'var(--text-primary)',
        boxShadow: isSelected
          ? `0 4px 14px ${data.tagColor}40, 0 0 0 3px ${data.tagColor}20`
          : isDimmed ? 'none' : 'var(--shadow)',
        opacity: isDimmed ? 0.15 : (isolated && !isSelected ? 0.6 : 1),
        pointerEvents: isDimmed ? 'none' : 'auto',
        padding: `${padY}px ${padX}px`,
        fontSize,
        whiteSpace: 'nowrap',
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-2 !h-2 !border-0 !rounded-full"
        style={{ background: isSelected ? '#fff' : 'var(--border)' }} />
      <span>{data.label}</span>
      {data.childCount > 0 && (
        <span className="text-[9px] opacity-70">▸{data.childCount}</span>
      )}
      {data.articleCount > 0 && (
        <span className="rounded-full inline-block"
          style={{
            width: 5, height: 5,
            background: isSelected ? '#fff' : data.tagColor,
            opacity: 0.9,
          }} />
      )}
      <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !border-0 !rounded-full"
        style={{ background: isSelected ? '#fff' : 'var(--border)' }} />
    </div>
  );
});
