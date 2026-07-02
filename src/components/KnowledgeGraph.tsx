import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow, Background, Controls, MiniMap,
  type Node, type Edge, type NodeTypes,
  useNodesState, useEdgesState, addEdge, type Connection,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide, forceX, forceY, type SimulationNodeDatum } from 'd3-force';
import type { Store } from '../hooks/useStore';
import KnowledgeNode from './graph/KnowledgeNode';
import TagNode from './graph/TagNode';
import { nanoid } from '../utils';

const nodeTypes: NodeTypes = { knowledge: KnowledgeNode, tag: TagNode };

interface ForceNode extends SimulationNodeDatum {
  id: string;
  group: string; // primary tag id for clustering
}

function layoutWithForce(nodes: Node[], edges: Edge[]) {
  if (nodes.length === 0) return nodes;

  const simNodes: ForceNode[] = nodes.map((n) => ({
    id: n.id,
    group: (n.data as Record<string, unknown>).tagColor as string ?? 'default',
    x: Math.random() * 600,
    y: Math.random() * 600,
  }));

  const nodeIdSet = new Set(simNodes.map((n) => n.id));
  const simLinks = edges
    .filter((e) => nodeIdSet.has(e.source as string) && nodeIdSet.has(e.target as string))
    .map((e) => ({ source: e.source as string, target: e.target as string }));

  // Group centers for clustering: nodes with same primary tag attract each other
  const groups = new Map<string, { x: number; y: number }>();
  let gi = 0;
  for (const n of simNodes) {
    if (!groups.has(n.group)) {
      const angle = (gi / 6) * 2 * Math.PI;
      groups.set(n.group, { x: Math.cos(angle) * 200, y: Math.sin(angle) * 200 });
      gi++;
    }
  }

  const sim = forceSimulation(simNodes)
    .force('link', forceLink(simLinks).id((d) => (d as ForceNode).id).distance(120).strength(0.4))
    .force('charge', forceManyBody().strength(-300))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide(60))
    // Cluster force: pull nodes toward their group center
    .force('clusterX', forceX<ForceNode>((d) => groups.get(d.group)?.x ?? 0).strength(0.15))
    .force('clusterY', forceY<ForceNode>((d) => groups.get(d.group)?.y ?? 0).strength(0.15))
    .stop();

  // Run simulation synchronously
  for (let i = 0; i < 300; i++) sim.tick();

  return nodes.map((n, i) => ({
    ...n,
    position: { x: simNodes[i].x ?? 0, y: simNodes[i].y ?? 0 },
  }));
}

export default function KnowledgeGraph({ store }: { store: Store }) {
  const { knowledgePoints, tagMap, filterTags, selectedKPId, setSelectedKPId } = store;
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [sceneName, setSceneName] = useState('');

  const hasFilter = filterTags.length > 0;

  const matchedIds = useMemo(() => {
    if (!hasFilter) return new Set<string>();
    return new Set(
      knowledgePoints
        .filter((kp) => kp.tags.some((t) => filterTags.includes(t)))
        .map((kp) => kp.id),
    );
  }, [knowledgePoints, filterTags, hasFilter]);

  const { rawNodes, rawEdges } = useMemo(() => {
    const kpNodes: Node[] = knowledgePoints.map((kp) => {
      const primaryTag = kp.tags[0] ? tagMap.get(kp.tags[0]) : undefined;
      const dimmed = hasFilter && !matchedIds.has(kp.id);
      return {
        id: kp.id,
        type: 'knowledge',
        position: { x: 0, y: 0 },
        data: {
          label: kp.title,
          tagColor: primaryTag?.color ?? '#85B7A7',
          selected: kp.id === selectedKPId,
          tagCount: kp.tags.length,
          dimmed,
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

          const related = knowledgePoints.filter((kp) => kp.id !== root.id && kp.tags.includes(tagId));
          for (const kp of related) {
            tagEdges.push({ id: `${tagNodeId}-${kp.id}`, source: tagNodeId, target: kp.id, style: { stroke: tag.color, strokeWidth: 1.5, opacity: 0.35 } });
          }
        }
      }
    }

    const linkedEdges: Edge[] = [];
    for (const kp of knowledgePoints) {
      for (const targetId of kp.linkedPoints) {
        if (knowledgePoints.find((v) => v.id === targetId)) {
          const eid = [kp.id, targetId].sort().join('-');
          if (!linkedEdges.find((e) => e.id === eid)) {
            const bothMatch = !hasFilter || (matchedIds.has(kp.id) && matchedIds.has(targetId));
            linkedEdges.push({
              id: eid,
              source: kp.id,
              target: targetId,
              style: {
                stroke: '#9B8E8E',
                strokeWidth: 1.5,
                opacity: bothMatch ? 0.4 : 0.08,
              },
            });
          }
        }
      }
    }

    return {
      rawNodes: [...kpNodes, ...tagNodes],
      rawEdges: [...linkedEdges, ...tagEdges],
    };
  }, [knowledgePoints, tagMap, selectedKPId, hasFilter, matchedIds]);

  const layoutedNodes = useMemo(() => layoutWithForce(rawNodes, rawEdges), [rawNodes, rawEdges]);

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

  const saveCurrentAsScene = () => {
    if (filterTags.length === 0) return;
    setEditingScene('new');
    setSceneName('');
  };

  const confirmSaveScene = async () => {
    if (!sceneName.trim()) return;
    await store.upsertScene({
      id: editingScene === 'new' ? nanoid() : editingScene!,
      name: sceneName.trim(),
      tagIds: [...filterTags],
    });
    setEditingScene(null);
    setSceneName('');
  };

  return (
    <div className="flex flex-col h-full">
      {/* Scene bar */}
      {store.scenes.length > 0 && (
        <div className="flex items-center gap-2 px-5 py-2 flex-wrap"
          style={{ borderBottom: '1px solid var(--border-light)' }}>
          <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>场景</span>
          {store.scenes.map((scene) => {
            const active = store.activeSceneId === scene.id;
            return (
              <button
                key={scene.id}
                onClick={() => store.activateScene(active ? null : scene.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  if (window.confirm(`删除场景「${scene.name}」？`)) {
                    void store.removeScene(scene.id);
                  }
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-medium transition-all"
                style={{
                  background: active ? 'var(--accent)' : 'var(--bg-card)',
                  color: active ? '#fff' : 'var(--text-secondary)',
                  border: active ? 'none' : '1px solid var(--border-light)',
                  boxShadow: active ? `0 2px 8px var(--accent)40` : 'var(--shadow)',
                }}
              >
                {scene.name}
              </button>
            );
          })}
        </div>
      )}

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
                if (store.activeSceneId) store.activateScene(null);
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
        {filterTags.length > 0 && (
          <>
            <button onClick={() => { store.setFilterTags([]); store.activateScene(null); }} className="text-xs px-2 py-1 rounded-lg transition-colors"
              style={{ color: 'var(--accent)' }}>清除</button>
            {!store.activeSceneId && (
              <button onClick={saveCurrentAsScene} className="text-xs px-2 py-1 rounded-lg transition-colors"
                style={{ color: 'var(--text-muted)', border: '1px dashed var(--border)' }}>
                保存为场景
              </button>
            )}
          </>
        )}
        <div className="flex-1" />
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {hasFilter ? `${matchedIds.size} / ` : ''}{knowledgePoints.length} 个知识点
        </span>
      </div>

      {/* Scene name input popover */}
      {editingScene && (
        <div className="flex items-center gap-2 px-5 py-2" style={{ background: 'var(--bg-surface)', borderBottom: '1px solid var(--border-light)' }}>
          <input
            autoFocus
            value={sceneName}
            onChange={(e) => setSceneName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void confirmSaveScene(); if (e.key === 'Escape') setEditingScene(null); }}
            className="input-base text-xs"
            placeholder="场景名称，如：AI 创业、面试准备…"
            style={{ maxWidth: 240 }}
          />
          <button onClick={() => void confirmSaveScene()} className="text-xs text-white px-3 py-1 rounded-lg font-medium" style={{ background: 'var(--accent)' }}>保存</button>
          <button onClick={() => setEditingScene(null)} className="text-xs px-2 py-1" style={{ color: 'var(--text-muted)' }}>取消</button>
        </div>
      )}

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
            nodeColor={(n) => (n.data as Record<string, unknown>).tagColor as string ?? '#85B7A7'}
            maskColor="rgba(239,244,236,0.7)"
          />
        </ReactFlow>
      </div>
    </div>
  );
}
