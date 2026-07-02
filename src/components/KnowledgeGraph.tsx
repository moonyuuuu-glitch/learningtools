import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type NodeTypes,
  useNodesState, useEdgesState, addEdge, type Connection,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as dagreLib from '@dagrejs/dagre';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dagre = (dagreLib as any).default ?? dagreLib;
import type { Store } from '../hooks/useStore';
import KnowledgeNode from './graph/KnowledgeNode';
import TagNode from './graph/TagNode';

const nodeTypes: NodeTypes = { knowledge: KnowledgeNode, tag: TagNode };

const NODE_WIDTH = 160;
const NODE_HEIGHT = 44;

function layoutWithDagre(nodes: Node[], edges: Edge[]) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', ranksep: 70, nodesep: 50 });
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }));
  edges.forEach((e) => g.setEdge(e.source, e.target));
  dagre.layout(g);
  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } };
  });
}

export default function KnowledgeGraph({ store }: { store: Store }) {
  const { knowledgePoints, tagMap, filterTags, selectedKPId, setSelectedKPId } = store;

  const { rawNodes, rawEdges } = useMemo(() => {
    const visible = filterTags.length === 0
      ? knowledgePoints
      : knowledgePoints.filter((kp) => kp.tags.some((t) => filterTags.includes(t)));

    const kpNodes: Node[] = visible.map((kp) => {
      const primaryTag = kp.tags[0] ? tagMap.get(kp.tags[0]) : undefined;
      return {
        id: kp.id,
        type: 'knowledge',
        position: { x: 0, y: 0 },
        data: {
          label: kp.title,
          tagColor: primaryTag?.color ?? '#85B7A7',
          selected: kp.id === selectedKPId,
          tagCount: kp.tags.length,
        },
      };
    });

    const tagNodes: Node[] = [];
    const tagEdges: Edge[] = [];

    if (selectedKPId) {
      const root = knowledgePoints.find((k) => k.id === selectedKPId);
      if (root) {
        for (const tagId of root.tags) {
          const tag = tagMap.get(tagId);
          if (!tag) continue;
          const tagNodeId = `tag-${tagId}`;
          tagNodes.push({
            id: tagNodeId,
            type: 'tag',
            position: { x: 0, y: 0 },
            data: { label: tag.name, color: tag.color },
          });
          tagEdges.push({ id: `${root.id}-${tagNodeId}`, source: root.id, target: tagNodeId, style: { stroke: tag.color, strokeWidth: 2, opacity: 0.5 }, animated: true });

          const related = visible.filter((kp) => kp.id !== root.id && kp.tags.includes(tagId));
          for (const kp of related) {
            tagEdges.push({ id: `${tagNodeId}-${kp.id}`, source: tagNodeId, target: kp.id, style: { stroke: tag.color, strokeWidth: 1.5, opacity: 0.35 } });
          }
        }
      }
    }

    const linkedEdges: Edge[] = [];
    for (const kp of visible) {
      for (const targetId of kp.linkedPoints) {
        if (visible.find((v) => v.id === targetId)) {
          const eid = [kp.id, targetId].sort().join('-');
          if (!linkedEdges.find((e) => e.id === eid)) {
            linkedEdges.push({
              id: eid,
              source: kp.id,
              target: targetId,
              style: { stroke: '#9B8E8E', strokeWidth: 1.5, opacity: 0.4 },
            });
          }
        }
      }
    }

    return {
      rawNodes: [...kpNodes, ...tagNodes],
      rawEdges: [...linkedEdges, ...tagEdges],
    };
  }, [knowledgePoints, tagMap, filterTags, selectedKPId]);

  const layoutedNodes = useMemo(() => layoutWithDagre(rawNodes, rawEdges), [rawNodes, rawEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges);

  useEffect(() => { setNodes(layoutedNodes); }, [layoutedNodes, setNodes]);
  useEffect(() => { setEdges(rawEdges); }, [rawEdges, setEdges]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    if (node.type === 'knowledge') {
      setSelectedKPId(node.id === selectedKPId ? null : node.id);
    }
  }, [selectedKPId, setSelectedKPId]);

  const allTags = Array.from(store.tagMap.values());

  return (
    <div className="flex flex-col h-full">
      {/* Tag filter bar */}
      <div className="flex items-center gap-2 px-5 py-2.5 flex-wrap"
        style={{ borderBottom: '1px solid var(--border-light)' }}>
        <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>标签筛选</span>
        {allTags.map((tag) => {
          const active = store.filterTags.includes(tag.id);
          return (
            <button
              key={tag.id}
              onClick={() => {
                store.setFilterTags(active ? store.filterTags.filter((t) => t !== tag.id) : [...store.filterTags, tag.id]);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all"
              style={{
                background: active ? tag.color : 'var(--bg-card)',
                color: active ? '#fff' : 'var(--text-secondary)',
                border: active ? 'none' : '1px solid var(--border-light)',
                boxShadow: active ? 'none' : 'var(--shadow)',
              }}
            >
              {!active && <span className="w-2 h-2 rounded-full" style={{ background: tag.color }} />}
              {tag.name}
            </button>
          );
        })}
        {store.filterTags.length > 0 && (
          <button onClick={() => store.setFilterTags([])} className="text-xs px-2 py-1 rounded-lg transition-colors"
            style={{ color: 'var(--accent)' }}>清除</button>
        )}
        <div className="flex-1" />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{knowledgePoints.length} 个知识点</span>
      </div>

      {/* Graph */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          minZoom={0.3}
          maxZoom={2}
        >
          <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#C5D1BE" />
          <Controls />
          <MiniMap
            nodeColor={(n) => (n.data as any).tagColor ?? '#85B7A7'}
            maskColor="rgba(239,244,236,0.7)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
