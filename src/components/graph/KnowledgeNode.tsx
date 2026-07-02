import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface KnowledgeNodeData {
  label: string;
  tagColor: string;
  selected: boolean;
  tagCount: number;
  dimmed?: boolean;
}

export default memo(function KnowledgeNode({ data }: { data: KnowledgeNodeData }) {
  const isSelected = data.selected;
  const isDimmed = data.dimmed && !isSelected;
  return (
    <div
      className="rounded-xl text-xs font-medium cursor-pointer transition-all flex overflow-hidden"
      style={{
        background: isSelected ? data.tagColor : 'var(--bg-card)',
        border: `1.5px solid ${isSelected ? data.tagColor : 'var(--border-light)'}`,
        color: isSelected ? '#fff' : 'var(--text-primary)',
        boxShadow: isSelected
          ? `0 4px 14px ${data.tagColor}40, 0 0 0 3px ${data.tagColor}20`
          : isDimmed ? 'none' : 'var(--shadow)',
        minWidth: 120,
        maxWidth: 170,
        opacity: isDimmed ? 0.15 : 1,
        pointerEvents: isDimmed ? 'none' : 'auto',
      }}
    >
      {/* Color bar on the left (when not selected) */}
      {!isSelected && (
        <div className="shrink-0" style={{ width: 3, background: data.tagColor }} />
      )}
      <div className="px-3.5 py-2.5 flex-1 min-w-0">
        <Handle type="target" position={Position.Top} className="!w-2 !h-2 !border-0 !rounded-full"
          style={{ background: isSelected ? '#fff' : 'var(--border)' }} />
        <div className="truncate leading-snug">{data.label}</div>
        {data.tagCount > 1 && (
          <div className="text-[10px] mt-0.5" style={{ opacity: 0.6 }}>{data.tagCount} 个标签</div>
        )}
        <Handle type="source" position={Position.Bottom} className="!w-2 !h-2 !border-0 !rounded-full"
          style={{ background: isSelected ? '#fff' : 'var(--border)' }} />
      </div>
    </div>
  );
});
