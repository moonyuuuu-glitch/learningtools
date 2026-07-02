import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';

interface TagNodeData { label: string; color: string; }

export default memo(function TagNode({ data }: { data: TagNodeData }) {
  return (
    <div
      className="px-3.5 py-1.5 rounded-full text-[11px] font-semibold"
      style={{
        background: `${data.color}25`,
        border: `1.5px solid ${data.color}50`,
        color: data.color,
      }}
    >
      <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !border-0 !rounded-full"
        style={{ background: data.color }} />
      #{data.label}
      <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !border-0 !rounded-full"
        style={{ background: data.color }} />
    </div>
  );
});
