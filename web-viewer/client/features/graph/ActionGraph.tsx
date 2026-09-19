// Interactive saved-state graph; selections inspect evidence and never execute actions.
import { useMemo, useRef, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type ReactFlowInstance,
  type Node,
} from '@xyflow/react'
import type { ViewerSuite } from '../../../shared/types.js'
import { layoutGraph, type RoutedEdge } from './layout.js'
import { ActionEdge } from './ActionEdge.js'
import { navigate } from '../../lib/route.js'
import { Badge } from '../../components/Badge.js'
const edgeTypes = { routed: ActionEdge }
export function ActionGraph({ suite }: { suite: ViewerSuite }) {
  const [runIndex, setRunIndex] = useState(suite.runs.length > 50 ? '0' : 'all')
  const graph = useMemo(() => {
    if (runIndex === 'all') return suite.graph
    const edges = suite.graph.edges.filter((edge) =>
      edge.references.some((reference) => reference.run === Number(runIndex)),
    )
    const endpoints = new Set(edges.flatMap((edge) => [edge.from, edge.to]))
    return {
      ...suite.graph,
      edges,
      nodes: suite.graph.nodes.filter(
        (node) =>
          endpoints.has(node.id) ||
          node.references.some((reference) => reference.run === Number(runIndex)),
      ),
    }
  }, [suite.graph, runIndex])
  const { nodes, edges } = useMemo(() => layoutGraph(graph), [graph])
  const [selection, setSelection] = useState<{ kind: 'node' | 'edge'; index: number }>()
  const [query, setQuery] = useState('')
  const canvas = useRef<ReactFlowInstance<Node, RoutedEdge>>(null)
  const highlightedNodes = useMemo(
    () =>
      nodes.map((node, index) => ({
        ...node,
        selected: selection?.kind === 'node' && selection.index === index,
      })),
    [nodes, selection],
  )
  const highlightedEdges = useMemo(
    () =>
      edges.map((edge, index) => ({
        ...edge,
        selected: selection?.kind === 'edge' && selection.index === index,
      })),
    [edges, selection],
  )
  const chooseState = (index: number) => {
    setSelection({ kind: 'node', index })
    void canvas.current?.fitView({ nodes: [{ id: `state-${index}` }], maxZoom: 1, duration: 200 })
  }
  const selectedNode = selection?.kind === 'node' ? graph.nodes[selection.index] : undefined
  const selectedEdge = selection?.kind === 'edge' ? graph.edges[selection.index] : undefined
  const matches = graph.nodes
    .map((node, index) => ({ node, index }))
    .filter(({ node }) =>
      `${node.id} ${node.url} ${node.text}`.toLowerCase().includes(query.toLowerCase()),
    )
  return (
    <section className="action-graph">
      <div className="heading">
        <div>
          <div className="eyebrow">Action graph</div>
          <h1>{suite.name}</h1>
          <p>
            {graph.nodes.length} observed states · {graph.edges.length} recorded transitions
          </p>
        </div>
        <a href={suite.downloads.graph} download>
          Download graph JSON ↗
        </a>
      </div>
      <p className="graph-note">
        {graph.source === 'discovery'
          ? 'Bounded discovery: only explored actions are shown. Discovery does not verify correctness.'
          : 'Observed test paths: unexplored actions are not shown. States can be shared by runs with different outcomes.'}
      </p>
      {graph.stopped && <p className="graph-note">Discovery stopped: {graph.stopped}</p>}
      {suite.runs.length > 0 && (
        <label className="graph-flow-filter">
          Show paths from
          <select
            aria-label="Graph flow"
            value={runIndex}
            onChange={(event) => {
              setRunIndex(event.target.value)
              setSelection(undefined)
              setQuery('')
            }}
          >
            <option value="all">All recorded flows ({suite.runs.length})</option>
            {suite.runs.map((run, index) => (
              <option key={index} value={index}>
                {run.flow.id} · {run.status}
              </option>
            ))}
          </select>
        </label>
      )}
      {graph.errors.length > 0 && (
        <details className="error-box">
          <summary>{graph.errors.length} discovery error(s)</summary>
          <ul>
            {graph.errors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </details>
      )}
      {nodes.length === 0 ? (
        <div className="panel empty">
          <h2>No observed states</h2>
          <p>This report contains no state observations to visualize.</p>
        </div>
      ) : (
        <div className="graph-grid">
          <div className="graph-canvas panel" aria-label="Interactive action graph">
            <ReactFlow<Node, RoutedEdge>
              key={runIndex}
              nodes={highlightedNodes}
              edges={highlightedEdges}
              onInit={(instance) => {
                canvas.current = instance
              }}
              edgeTypes={edgeTypes}
              nodesDraggable={false}
              nodesConnectable={false}
              edgesReconnectable={false}
              deleteKeyCode={null}
              fitView
              minZoom={0.05}
              maxZoom={2}
              onNodeClick={(_, node) =>
                setSelection({ kind: 'node', index: Number(node.id.slice(6)) })
              }
              onEdgeClick={(_, edge) =>
                setSelection({ kind: 'edge', index: Number(edge.id.slice(7)) })
              }
            >
              <Background />
              <Controls showInteractive={false} />
              <MiniMap pannable zoomable nodeColor="#b4d7c6" />
            </ReactFlow>
          </div>
          <aside className="panel graph-inspector" aria-label="Graph inspector">
            <h2>Inspect the graph</h2>
            <label>
              Find a state
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search state text, URL, or ID"
              />
            </label>
            <label>
              Observed state
              <select
                aria-label="Select observed state"
                value={selectedNode ? String(selection!.index) : ''}
                onChange={(event) =>
                  event.target.value === ''
                    ? setSelection(undefined)
                    : chooseState(Number(event.target.value))
                }
              >
                <option value="">Select a state</option>
                {matches.map(({ node, index }) => (
                  <option key={node.id} value={index}>
                    State {index + 1}: {node.text.slice(0, 60) || node.url}
                  </option>
                ))}
              </select>
            </label>
            {matches.length === 0 && <p>No matching states.</p>}
            {selectedNode ? (
              <>
                <h3>State {selection!.index + 1}</h3>
                <code>{selectedNode.id}</code>
                <p>{selectedNode.url}</p>
                <details open>
                  <summary>Observed text</summary>
                  <pre>{selectedNode.text || 'No text recorded.'}</pre>
                </details>
                <h3>Recorded evidence</h3>
                {selectedNode.references.length ? (
                  selectedNode.references.map((reference) => {
                    const run = suite.runs[reference.run]!
                    return (
                      <button
                        className="graph-reference"
                        key={`${reference.run}-${reference.step}`}
                        onClick={() => navigate(suite.id, reference.run, reference.step)}
                      >
                        <span>
                          {run.flow.id} · step {reference.step}
                        </span>
                        <Badge status={run.status} />
                      </button>
                    )
                  })
                ) : (
                  <p>No run evidence is attached to this state.</p>
                )}
                <h3>Outgoing actions</h3>
                {graph.edges.map((edge, index) =>
                  edge.from === selectedNode.id ? (
                    <button
                      className="graph-reference"
                      key={index}
                      onClick={() => setSelection({ kind: 'edge', index })}
                    >
                      {edge.action.label}
                    </button>
                  ) : null,
                )}
              </>
            ) : selectedEdge ? (
              <>
                <h3>Recorded action</h3>
                <p>{selectedEdge.action.label}</p>
                <code>
                  {selectedEdge.action.kind} · {selectedEdge.action.id}
                </code>
                <p>From: {selectedEdge.from}</p>
                <p>To: {selectedEdge.to}</p>
                <button
                  onClick={() =>
                    chooseState(graph.nodes.findIndex((node) => node.id === selectedEdge.to))
                  }
                >
                  Inspect destination state
                </button>
              </>
            ) : (
              <p>
                Select a state or action. Scroll to zoom, drag the background to pan, or use the
                fit-view control.
              </p>
            )}
          </aside>
        </div>
      )}
    </section>
  )
}
