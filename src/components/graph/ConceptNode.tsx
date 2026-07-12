import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface ConceptNodeData {
  label: string;
  tagColor: string;
  selected: boolean;
  articleCount: number;   // 被多少篇文章引用（决定大小）
  childCount: number;     // 子概念数量
  relationCount: number;
  dimmed?: boolean;
}

export default memo(function ConceptNode({ data }: { data: ConceptNodeData }) {
  const isSelected = data.selected;
  const isDimmed = data.dimmed && !isSelected;
  const isolated = data.articleCount === 0;
  const signal = data.articleCount + data.relationCount;
  const scale = Math.min(1 + signal * 0.08, 1.55);
  const fontSize = Math.round(12 * Math.min(scale, 1.25));
  const padY = Math.round(7 * scale);
  const padX = Math.round(13 * scale);

  return (
    <div
      className="concept-node"
      data-selected={isSelected}
      data-isolated={isolated}
      data-dimmed={isDimmed}
      style={{
        '--node-color': data.tagColor,
        padding: `${padY}px ${padX}px`,
        fontSize,
      } as React.CSSProperties}
    >
      <Handle type="target" position={Position.Top} className="graph-handle" />
      <span className="concept-node-label">{data.label}</span>
      <span className="concept-node-orbit">
        {data.articleCount > 0 && <i />}
        {data.childCount > 0 && <b>{data.childCount}</b>}
      </span>
      <Handle type="source" position={Position.Bottom} className="graph-handle" />
    </div>
  );
});
