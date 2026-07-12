import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import { Layers3 } from 'lucide-react'

interface FrameworkNodeData {
  label: string
  selected: boolean
  pinned: boolean
  sourceCount: number
  relationCount: number
  dimmed?: boolean
}

export default memo(function FrameworkNode({ data }: { data: FrameworkNodeData }) {
  return (
    <div
      className="framework-node"
      data-selected={data.selected}
      data-dimmed={data.dimmed}
    >
      <Handle type="target" position={Position.Top} className="graph-handle" />
      <div className="framework-node-mark"><Layers3 size={13} /></div>
      <div>
        <div className="framework-node-label">{data.label}</div>
        <div className="framework-node-meta">
          {data.pinned ? '置顶常看' : `${data.sourceCount} 篇来源 · ${data.relationCount} 条连接`}
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} className="graph-handle" />
    </div>
  )
})