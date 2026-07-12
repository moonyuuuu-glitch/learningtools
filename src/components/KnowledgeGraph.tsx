import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeTypes,
  type ReactFlowInstance,
  useEdgesState,
  useNodesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationNodeDatum,
} from 'd3-force'
import { Focus, Globe2, RotateCcw, ScanSearch } from 'lucide-react'
import type { Store } from '../hooks/useStore'
import type { GraphViewState, KnowledgeEntityType } from '../types'
import { computeGraph, parsePairKey } from '../lib/concepts'
import ConceptNode from './graph/ConceptNode'
import FrameworkNode from './graph/FrameworkNode'

const nodeTypes: NodeTypes = {
  concept: ConceptNode,
  framework: FrameworkNode,
}

interface ForceNode extends SimulationNodeDatum {
  id: string
  radius: number
}

function seededPosition(id: string) {
  let hash = 2166136261
  for (const character of id) {
    hash ^= character.charCodeAt(0)
    hash = Math.imul(hash, 16777619)
  }
  const angle = ((hash >>> 0) % 360) * Math.PI / 180
  const radius = 120 + ((hash >>> 8) % 260)
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius }
}

function stableLayout(
  nodes: Node[],
  edges: Edge[],
  positions: GraphViewState['positions'],
) {
  if (nodes.length === 0) return nodes
  const simulationNodes: ForceNode[] = nodes.map((node) => {
    const saved = positions[node.id] ?? seededPosition(node.id)
    return {
      id: node.id,
      radius: node.type === 'framework' ? 58 : 42,
      x: saved.x,
      y: saved.y,
      fx: positions[node.id]?.x,
      fy: positions[node.id]?.y,
    }
  })
  const known = new Set(simulationNodes.map((node) => node.id))
  const links = edges
    .filter((edge) => known.has(String(edge.source)) && known.has(String(edge.target)))
    .map((edge) => ({ source: String(edge.source), target: String(edge.target) }))
  const simulation = forceSimulation(simulationNodes)
    .force('link', forceLink(links).id((datum) => (datum as ForceNode).id).distance(130).strength(0.35))
    .force('charge', forceManyBody().strength(-340))
    .force('collide', forceCollide<ForceNode>((datum) => datum.radius + 12))
    .force('center', forceCenter(0, 0))
    .stop()
  for (let tick = 0; tick < 240; tick += 1) simulation.tick()
  return nodes.map((node, index) => ({
    ...node,
    position: {
      x: simulationNodes[index].x ?? 0,
      y: simulationNodes[index].y ?? 0,
    },
  }))
}

const DEFAULT_STATE: GraphViewState = {
  x: 0,
  y: 0,
  zoom: 1,
  mode: 'global',
  filterTags: [],
  showSignals: true,
  positions: {},
}

export default function KnowledgeGraph({ store }: { store: Store }) {
  const state = store.graphViewState ?? DEFAULT_STATE
  const instanceRef = useRef<ReactFlowInstance<Node, Edge> | null>(null)
  const hydratedRef = useRef(false)
  const graph = useMemo(
    () => computeGraph(store.articles, store.knowledgePoints),
    [store.articles, store.knowledgePoints],
  )

  const entityKey = (type: KnowledgeEntityType, id: string) =>
    type === 'framework' ? `fw:${id}` : id

  const focusKey = state.focusId && state.focusType
    ? entityKey(state.focusType, state.focusId)
    : null

  const formalEdges = useMemo<Edge[]>(() =>
    store.relations
      .filter((relation) => relation.reviewStatus === 'reviewed' || relation.reviewStatus === 'needs_review')
      .map((relation) => ({
        id: relation.id,
        source: entityKey(relation.fromType, relation.fromId),
        target: entityKey(relation.toType, relation.toId),
        type: 'smoothstep',
        label: relation.type === 'related_to' ? undefined : relation.type,
        style: {
          stroke: relation.reviewStatus === 'needs_review' ? '#A89778' : '#5D715F',
          strokeWidth: 1.8,
          strokeDasharray: relation.reviewStatus === 'needs_review' ? '5 4' : undefined,
        },
        labelStyle: { fill: '#665D52', fontSize: 9, fontWeight: 600 },
        labelBgStyle: { fill: '#F6F2E9', fillOpacity: 0.94 },
        data: { kind: 'formal' },
      })), [store.relations])

  const signalEdges = useMemo<Edge[]>(() => {
    if (!state.showSignals) return []
    return [...graph.edges.entries()].map(([key, weight]) => {
      const [source, target] = parsePairKey(key)
      return {
        id: `signal:${key}`,
        source,
        target,
        style: {
          stroke: '#A8B6A3',
          strokeWidth: Math.min(0.75 + weight * 0.35, 2.2),
          opacity: 0.28,
          strokeDasharray: '2 7',
        },
        data: { kind: 'signal' },
      }
    })
  }, [graph, state.showSignals])

  const allEdges = useMemo(
    () => [...signalEdges, ...formalEdges],
    [signalEdges, formalEdges],
  )

  const visibleIds = useMemo(() => {
    const all = new Set<string>([
      ...store.knowledgePoints.map((point) => point.id),
      ...store.frameworks
        .filter((framework) => framework.reviewStatus === 'reviewed')
        .map((framework) => `fw:${framework.id}`),
    ])
    if (state.mode !== 'focus' || !focusKey) return all
    const visible = new Set([focusKey])
    for (let depth = 0; depth < 2; depth += 1) {
      for (const edge of allEdges) {
        if (visible.has(String(edge.source))) visible.add(String(edge.target))
        if (visible.has(String(edge.target))) visible.add(String(edge.source))
      }
    }
    return visible
  }, [allEdges, focusKey, state.mode, store.frameworks, store.knowledgePoints])

  const rawNodes = useMemo<Node[]>(() => {
    const pointNodes: Node[] = store.knowledgePoints
      .filter((point) =>
        visibleIds.has(point.id)
        && (state.filterTags.length === 0
          || point.tags.some((tagId) => state.filterTags.includes(tagId))))
      .map((point) => {
        const tag = point.tags[0] ? store.tagMap.get(point.tags[0]) : undefined
        return {
          id: point.id,
          type: 'concept',
          position: { x: 0, y: 0 },
          data: {
            label: point.title,
            tagColor: tag?.color ?? '#7E9B85',
            selected: store.selectedKPId === point.id,
            articleCount: graph.nodeWeight.get(point.id) ?? 0,
            childCount: store.knowledgePoints.filter((item) => item.parentId === point.id).length,
          },
        }
      })
    const frameworkNodes: Node[] = store.frameworks
      .filter((framework) =>
        framework.reviewStatus === 'reviewed' && visibleIds.has(`fw:${framework.id}`))
      .map((framework) => ({
        id: `fw:${framework.id}`,
        type: 'framework',
        position: { x: 0, y: 0 },
        data: {
          label: framework.title,
          selected: store.selectedFrameworkId === framework.id,
          pinned: framework.pinned,
          sourceCount: framework.sourceArticleIds.length,
        },
      }))
    return [...pointNodes, ...frameworkNodes]
  }, [
    graph.nodeWeight,
    state.filterTags,
    store.frameworks,
    store.knowledgePoints,
    store.selectedFrameworkId,
    store.selectedKPId,
    store.tagMap,
    visibleIds,
  ])

  const visibleNodeIds = useMemo(
    () => new Set(rawNodes.map((node) => node.id)),
    [rawNodes],
  )
  const visibleEdges = useMemo(
    () => allEdges.filter((edge) =>
      visibleNodeIds.has(String(edge.source)) && visibleNodeIds.has(String(edge.target))),
    [allEdges, visibleNodeIds],
  )
  const layoutedNodes = useMemo(
    () => stableLayout(rawNodes, visibleEdges, state.positions),
    [rawNodes, state.positions, visibleEdges],
  )
  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(visibleEdges)

  useEffect(() => setNodes(layoutedNodes), [layoutedNodes, setNodes])
  useEffect(() => setEdges(visibleEdges), [setEdges, visibleEdges])

  const persistState = useCallback((patch: Partial<GraphViewState>) => {
    void store.updateGraphViewState({
      ...DEFAULT_STATE,
      ...state,
      ...patch,
    })
  }, [state, store])

  const handleInit = useCallback((instance: ReactFlowInstance<Node, Edge>) => {
    instanceRef.current = instance
    if (hydratedRef.current) return
    hydratedRef.current = true
    if (store.graphViewState) {
      instance.setViewport({
        x: store.graphViewState.x,
        y: store.graphViewState.y,
        zoom: store.graphViewState.zoom,
      })
    } else {
      window.setTimeout(() => instance.fitView({ padding: 0.24 }), 0)
    }
  }, [store.graphViewState])

  const goGlobal = useCallback(() => {
    store.setSelectedKPId(null)
    store.setSelectedFrameworkId(null)
    store.setSelectedRelationId(null)
    persistState({
      mode: 'global',
      focusId: undefined,
      focusType: undefined,
      filterTags: [],
    })
    window.setTimeout(() => instanceRef.current?.fitView({ padding: 0.24 }), 0)
  }, [persistState, store])

  return (
    <div className="knowledge-explorer">
      <div className="graph-toolbar">
        <div>
          <p className="eyebrow">知识探索器</p>
          <strong>{state.mode === 'global' ? '全局地图' : '聚焦探索'}</strong>
        </div>
        <div className="graph-legend">
          <span><i className="legend-formal" />正式关系</span>
          <span><i className="legend-signal" />弱关联信号</span>
        </div>
        <div className="graph-toolbar-actions">
          <button
            data-active={state.mode === 'global'}
            onClick={goGlobal}
          >
            <Globe2 size={14} /> 全局
          </button>
          <button
            data-active={state.mode === 'focus'}
            disabled={!store.selectedKPId && !store.selectedFrameworkId}
            onClick={() => {
              const type = store.selectedFrameworkId ? 'framework' : 'knowledge_point'
              const id = store.selectedFrameworkId ?? store.selectedKPId
              if (!id) return
              persistState({ mode: 'focus', focusId: id, focusType: type })
            }}
          >
            <Focus size={14} /> 聚焦
          </button>
          <button
            data-active={state.showSignals}
            onClick={() => persistState({ showSignals: !state.showSignals })}
          >
            <ScanSearch size={14} /> 弱信号
          </button>
          <button onClick={goGlobal}><RotateCcw size={14} /> 回到全局</button>
        </div>
      </div>
      <div className="graph-tag-row">
        {store.tags.map((tag) => {
          const active = state.filterTags.includes(tag.id)
          return (
            <button
              key={tag.id}
              data-active={active}
              onClick={() => persistState({
                filterTags: active
                  ? state.filterTags.filter((id) => id !== tag.id)
                  : [...state.filterTags, tag.id],
              })}
            >
              <i style={{ background: tag.color }} /> {tag.name}
            </button>
          )
        })}
      </div>
      <div className="graph-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onInit={handleInit}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onMoveEnd={(_, viewport) => persistState(viewport)}
          onNodeDragStop={(_, node) => persistState({
            positions: { ...state.positions, [node.id]: node.position },
          })}
          onNodeClick={(_, node) => {
            store.setSelectedRelationId(null)
            if (node.id.startsWith('fw:')) {
              const id = node.id.slice(3)
              store.setSelectedFrameworkId(id)
              store.setSelectedKPId(null)
              persistState({ selectedId: id, selectedType: 'framework' })
            } else {
              store.setSelectedKPId(node.id)
              store.setSelectedFrameworkId(null)
              persistState({ selectedId: node.id, selectedType: 'knowledge_point' })
            }
          }}
          onEdgeClick={(_, edge) => {
            if (edge.data?.kind !== 'formal') return
            store.setSelectedRelationId(edge.id)
          }}
          minZoom={0.25}
          maxZoom={2.2}
        >
          <Background variant={BackgroundVariant.Dots} gap={30} size={1} color="#BCC8B8" />
          <Controls />
          <MiniMap
            nodeColor={(node) => node.type === 'framework' ? '#B6845C' : '#718D78'}
            maskColor="rgba(242, 240, 232, 0.74)"
          />
        </ReactFlow>
      </div>
    </div>
  )
}