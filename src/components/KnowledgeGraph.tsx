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
import ConceptNode from './graph/ConceptNode';
import { computeGraph, parsePairKey } from '../lib/concepts';
import { organizeConcepts } from '../api/ai';
import { nanoid } from '../utils';

const nodeTypes: NodeTypes = { concept: ConceptNode };

interface ForceNode extends SimulationNodeDatum {
  id: string;
  group: string; // primary tag id for clustering
  radius: number;
}

function layoutWithForce(nodes: Node[], edges: Edge[]) {
  if (nodes.length === 0) return nodes;

  const simNodes: ForceNode[] = nodes.map((n) => {
    const d = n.data as Record<string, unknown>;
    const count = (d.articleCount as number) ?? 0;
    return {
      id: n.id,
      group: (d.tagColor as string) ?? 'default',
      radius: 30 + Math.min(count * 6, 40),
      x: Math.random() * 600,
      y: Math.random() * 600,
    };
  });

  const nodeIdSet = new Set(simNodes.map((n) => n.id));
  const simLinks = edges
    .filter((e) => nodeIdSet.has(e.source as string) && nodeIdSet.has(e.target as string))
    .map((e) => ({ source: e.source as string, target: e.target as string }));

  const groups = new Map<string, { x: number; y: number }>();
  let gi = 0;
  for (const n of simNodes) {
    if (!groups.has(n.group)) {
      const angle = (gi / 6) * 2 * Math.PI;
      groups.set(n.group, { x: Math.cos(angle) * 220, y: Math.sin(angle) * 220 });
      gi++;
    }
  }

  const sim = forceSimulation(simNodes)
    .force('link', forceLink(simLinks).id((d) => (d as ForceNode).id).distance(90).strength(0.5))
    .force('charge', forceManyBody().strength(-260))
    .force('center', forceCenter(0, 0))
    .force('collide', forceCollide<ForceNode>((d) => d.radius))
    .force('clusterX', forceX<ForceNode>((d) => groups.get(d.group)?.x ?? 0).strength(0.12))
    .force('clusterY', forceY<ForceNode>((d) => groups.get(d.group)?.y ?? 0).strength(0.12))
    .stop();

  for (let i = 0; i < 300; i++) sim.tick();

  return nodes.map((n, i) => ({
    ...n,
    position: { x: simNodes[i].x ?? 0, y: simNodes[i].y ?? 0 },
  }));
}

export default function KnowledgeGraph({ store }: { store: Store }) {
  const { knowledgePoints, articles, tagMap, filterTags, selectedKPId, setSelectedKPId } = store;
  const [editingScene, setEditingScene] = useState<string | null>(null);
  const [sceneName, setSceneName] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [organizing, setOrganizing] = useState(false);
  const [organizeError, setOrganizeError] = useState('');
  const [organizePlan, setOrganizePlan] = useState<
    { id: string; oldTitle: string; shortName: string; mergeIntoId?: string; mergeIntoTitle?: string; checked: boolean }[] | null
  >(null);

  const hasFilter = filterTags.length > 0;

  const matchedIds = useMemo(() => {
    if (!hasFilter) return new Set<string>();
    return new Set(
      knowledgePoints
        .filter((kp) => kp.tags.some((t) => filterTags.includes(t)))
        .map((kp) => kp.id),
    );
  }, [knowledgePoints, filterTags, hasFilter]);

  // 共现图数据：节点权重 + 共现边（实时派生，不落库）
  const graph = useMemo(() => computeGraph(articles, knowledgePoints), [articles, knowledgePoints]);

  // 每个概念的子概念数量
  const childCountMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const kp of knowledgePoints) {
      if (kp.parentId) m.set(kp.parentId, (m.get(kp.parentId) ?? 0) + 1);
    }
    return m;
  }, [knowledgePoints]);

  const { rawNodes, rawEdges } = useMemo(() => {
    // 可见节点：顶层概念(无 parentId) 或 父概念已展开的子概念
    const visible = knowledgePoints.filter(
      (kp) => !kp.parentId || expanded.has(kp.parentId),
    );
    const visibleIds = new Set(visible.map((kp) => kp.id));

    const kpNodes: Node[] = visible.map((kp) => {
      const primaryTag = kp.tags[0] ? tagMap.get(kp.tags[0]) : undefined;
      const dimmed = hasFilter && !matchedIds.has(kp.id);
      return {
        id: kp.id,
        type: 'concept',
        position: { x: 0, y: 0 },
        data: {
          label: kp.title,
          tagColor: primaryTag?.color ?? '#85B7A7',
          selected: kp.id === selectedKPId,
          articleCount: graph.nodeWeight.get(kp.id) ?? 0,
          childCount: childCountMap.get(kp.id) ?? 0,
          dimmed,
        },
      };
    });

    const edges: Edge[] = [];

    // 1) 共现边：同篇文章里的概念自动连线，越粗代表共现越多
    for (const [key, weight] of graph.edges.entries()) {
      const [a, b] = parsePairKey(key);
      if (!visibleIds.has(a) || !visibleIds.has(b)) continue;
      const bothMatch = !hasFilter || (matchedIds.has(a) && matchedIds.has(b));
      edges.push({
        id: `co-${key}`,
        source: a,
        target: b,
        style: {
          stroke: '#85B7A7',
          strokeWidth: Math.min(1 + weight * 1.4, 6),
          opacity: bothMatch ? Math.min(0.35 + weight * 0.12, 0.75) : 0.08,
        },
      });
    }

    // 2) 手动关联边（linkedPoints）：虚线区分
    for (const kp of knowledgePoints) {
      if (!visibleIds.has(kp.id)) continue;
      for (const targetId of kp.linkedPoints) {
        if (!visibleIds.has(targetId)) continue;
        const eid = `lk-${[kp.id, targetId].sort().join('-')}`;
        if (edges.find((e) => e.id === eid)) continue;
        // 若已有共现边则跳过，避免重复
        const coKey = kp.id < targetId ? `co-${kp.id}|${targetId}` : `co-${targetId}|${kp.id}`;
        if (edges.find((e) => e.id === coKey)) continue;
        const bothMatch = !hasFilter || (matchedIds.has(kp.id) && matchedIds.has(targetId));
        edges.push({
          id: eid,
          source: kp.id,
          target: targetId,
          style: { stroke: '#9B8E8E', strokeWidth: 1.5, opacity: bothMatch ? 0.4 : 0.08, strokeDasharray: '4 3' },
        });
      }
    }

    // 3) 父子结构边（展开时）
    for (const kp of visible) {
      if (kp.parentId && visibleIds.has(kp.parentId)) {
        edges.push({
          id: `pc-${kp.parentId}-${kp.id}`,
          source: kp.parentId,
          target: kp.id,
          style: { stroke: '#C9A98C', strokeWidth: 1.2, opacity: 0.5, strokeDasharray: '2 4' },
        });
      }
    }

    return { rawNodes: kpNodes, rawEdges: edges };
  }, [knowledgePoints, tagMap, selectedKPId, hasFilter, matchedIds, graph, childCountMap, expanded]);

  const layoutedNodes = useMemo(() => layoutWithForce(rawNodes, rawEdges), [rawNodes, rawEdges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rawEdges);

  useEffect(() => { setNodes(layoutedNodes); }, [layoutedNodes, setNodes]);
  useEffect(() => { setEdges(rawEdges); }, [rawEdges, setEdges]);

  const onConnect = useCallback((c: Connection) => setEdges((eds) => addEdge(c, eds)), [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedKPId(node.id === selectedKPId ? null : node.id);
    // 有子概念则切换展开/收起
    if ((childCountMap.get(node.id) ?? 0) > 0) {
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
        return next;
      });
    }
  }, [selectedKPId, setSelectedKPId, childCountMap]);

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

  const handleOrganize = async () => {
    if (knowledgePoints.length === 0) return;
    setOrganizing(true);
    setOrganizeError('');
    try {
      const result = await organizeConcepts({
        concepts: knowledgePoints.map((kp) => ({ id: kp.id, title: kp.title })),
      });
      const titleById = new Map(knowledgePoints.map((kp) => [kp.id, kp.title]));
      const plan = result.items
        .filter((item) => titleById.has(item.id))
        .map((item) => {
          const oldTitle = titleById.get(item.id)!;
          const shortName = (item.shortName || oldTitle).trim();
          const mergeIntoId = item.mergeIntoId && titleById.has(item.mergeIntoId) && item.mergeIntoId !== item.id
            ? item.mergeIntoId : undefined;
          return {
            id: item.id,
            oldTitle,
            shortName,
            mergeIntoId,
            mergeIntoTitle: mergeIntoId ? titleById.get(mergeIntoId) : undefined,
            checked: true,
          };
        })
        // 只保留有实际变化的项（改名或合并）
        .filter((p) => p.mergeIntoId || p.shortName !== p.oldTitle);
      if (plan.length === 0) {
        setOrganizeError('没有可整理的概念，命名已经很规范了');
      }
      setOrganizePlan(plan);
    } catch (error) {
      setOrganizeError(error instanceof Error ? error.message : 'AI 整理失败');
    } finally {
      setOrganizing(false);
    }
  };

  const applyOrganize = async () => {
    if (!organizePlan) return;
    const items = organizePlan.filter((p) => p.checked);
    // 1) 先处理合并：把文章 & 其它概念对被合并 id 的引用改到目标 id，再删除被合并概念
    for (const item of items) {
      if (!item.mergeIntoId) continue;
      const from = item.id;
      const to = item.mergeIntoId;
      // 文章引用重定向
      for (const art of articles) {
        if (art.knowledgePoints.includes(from)) {
          const next = Array.from(new Set(art.knowledgePoints.map((x) => (x === from ? to : x))));
          await store.upsertArticle({ ...art, knowledgePoints: next });
        }
      }
      // 其它概念的 linkedPoints 重定向
      for (const other of knowledgePoints) {
        if (other.id === from) continue;
        if (other.linkedPoints.includes(from)) {
          const next = Array.from(new Set(other.linkedPoints.map((x) => (x === from ? to : x)))).filter((x) => x !== other.id);
          await store.upsertKP({ ...other, linkedPoints: next, updatedAt: Date.now() });
        }
      }
      await store.removeKP(from);
    }
    // 2) 再处理改名（跳过已被合并删除的）
    const mergedIds = new Set(items.filter((p) => p.mergeIntoId).map((p) => p.id));
    for (const item of items) {
      if (item.mergeIntoId || mergedIds.has(item.id)) continue;
      const kp = knowledgePoints.find((k) => k.id === item.id);
      if (kp && item.shortName !== kp.title) {
        await store.upsertKP({ ...kp, title: item.shortName, updatedAt: Date.now() });
      }
    }
    setOrganizePlan(null);
  };

  const isolatedCount = useMemo(
    () => knowledgePoints.filter((kp) => (graph.nodeWeight.get(kp.id) ?? 0) === 0 && kp.linkedPoints.length === 0).length,
    [knowledgePoints, graph],
  );

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
        <button
          onClick={() => void handleOrganize()}
          disabled={organizing || knowledgePoints.length === 0}
          className="text-xs px-2.5 py-1 rounded-lg font-medium transition-all disabled:opacity-50"
          style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
        >
          {organizing ? '整理中…' : '一键整理概念'}
        </button>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {hasFilter ? `${matchedIds.size} / ` : ''}{knowledgePoints.length} 个概念
          {isolatedCount > 0 && <span style={{ color: 'var(--text-muted)' }}> · {isolatedCount} 个孤立</span>}
        </span>
      </div>
      {organizeError && (
        <div className="px-5 py-1.5 text-[11px]" style={{ color: 'var(--accent)', borderBottom: '1px solid var(--border-light)' }}>{organizeError}</div>
      )}

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

      {/* Organize concepts modal */}
      {organizePlan && organizePlan.length > 0 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(59,47,47,0.25)', backdropFilter: 'blur(4px)' }}
          onClick={() => setOrganizePlan(null)}>
          <div className="w-full max-w-md rounded-2xl p-5 max-h-[80vh] overflow-y-auto"
            style={{ background: 'var(--bg-card)', boxShadow: 'var(--shadow-lg)' }}
            onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>整理概念</h3>
            <p className="text-[11px] mb-3" style={{ color: 'var(--text-muted)' }}>勾选要应用的调整（改名或合并），点确定后生效：</p>
            <div className="space-y-1.5 mb-4">
              {organizePlan.map((p, idx) => (
                <button key={p.id}
                  onClick={() => setOrganizePlan((prev) => prev!.map((x, i) => i === idx ? { ...x, checked: !x.checked } : x))}
                  className="flex items-center gap-2 w-full text-left rounded-lg px-2.5 py-1.5 text-xs transition-all"
                  style={{
                    background: p.checked ? 'var(--accent-light)' : 'var(--bg-surface)',
                    border: `1px solid ${p.checked ? 'var(--accent)' : 'var(--border-light)'}`,
                    color: 'var(--text-secondary)',
                  }}>
                  <span style={{ color: p.checked ? 'var(--accent)' : 'var(--text-muted)' }}>{p.checked ? '✓' : '○'}</span>
                  <span className="flex-1 truncate">
                    <span style={{ color: 'var(--text-muted)' }}>{p.oldTitle}</span>
                    {p.mergeIntoId
                      ? <> → 合并到 <b style={{ color: 'var(--accent)' }}>{p.mergeIntoTitle}</b></>
                      : <> → <b style={{ color: 'var(--text-primary)' }}>{p.shortName}</b></>}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setOrganizePlan(null)} className="text-xs px-3 py-1.5 rounded-lg" style={{ color: 'var(--text-muted)' }}>取消</button>
              <button onClick={() => void applyOrganize()} className="text-xs text-white px-3 py-1.5 rounded-lg font-medium" style={{ background: 'var(--accent)' }}>确定应用</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
