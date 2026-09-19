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
import { graphCoverage } from './coverage.js'
import { FlowCoverage } from './FlowCoverage.js'
const edgeTypes = { routed: ActionEdge }
export function ActionGraph({
  suite,
  flowIndex,
  step,
  onChoose,
}: {
  suite: ViewerSuite
  flowIndex?: number
  step?: number
  onChoose?: (step: number) => void
}) {
  const [showCoverage, setShowCoverage] = useState(true)
  const runIndex = flowIndex === undefined ? 'all' : String(flowIndex)
  const coverageVisible = flowIndex === undefined && showCoverage
  const graph = suite.graph
  const coverage = useMemo(() => graphCoverage(graph, suite.runs), [graph, suite.runs])
  const Heading = flowIndex === undefined ? 'h1' : 'h2'
  const { nodes, edges } = useMemo(() => layoutGraph(graph), [graph])
  const [selection, setSelection] = useState<{ kind: 'node' | 'edge'; index: number }>()
  const [query, setQuery] = useState('')
  const canvas = useRef<ReactFlowInstance<Node, RoutedEdge>>(null)
  const highlightedNodes = useMemo(
    () =>
      nodes.map((node, index) => ({
        ...node,
        data: {
          ...node.data,
          label: `${node.data.label}${coverageVisible ? `\n${coverage.nodes[index]} flows` : ''}`,
        },
        className:
          runIndex !== 'all' &&
          graph.nodes[index]!.references.some((reference) => reference.run === Number(runIndex))
            ? 'flow-path-node'
            : coverageVisible
              ? coverage.nodes[index]
                ? 'coverage-visited'
                : 'coverage-unvisited'
              : undefined,
        style: {
          ...node.style,
          opacity:
            runIndex === 'all' ||
            graph.nodes[index]!.references.some((reference) => reference.run === Number(runIndex))
              ? 1
              : 0.3,
          background: graph.nodes[index]!.references.some(
            (reference) => reference.run === Number(runIndex) && reference.step === step,
          )
            ? '#bfeccc'
            : coverageVisible && coverage.nodes[index]
              ? '#def2e6'
              : undefined,
        },
        selected: selection?.kind === 'node' && selection.index === index,
      })),
    [nodes, selection, graph, runIndex, step, coverage, coverageVisible],
  )
  const highlightedEdges = useMemo(
    () =>
      edges.map((edge, index) => ({
        ...edge,
        className:
          runIndex !== 'all' &&
          graph.edges[index]!.references.some((reference) => reference.run === Number(runIndex))
            ? 'flow-path-edge'
            : undefined,
        style: {
          opacity:
            runIndex === 'all' ||
            graph.edges[index]!.references.some((reference) => reference.run === Number(runIndex))
              ? 1
              : 0.15,
        },
        data: {
          ...edge.data!,
          flowCount: coverageVisible ? coverage.edges[index] : undefined,
          pathSteps:
            runIndex === 'all'
              ? []
              : graph.edges[index]!.references.filter(
                  (reference) => reference.run === Number(runIndex),
                ).map((reference) => reference.step),
          current:
            runIndex !== 'all' &&
            graph.edges[index]!.references.some(
              (reference) => reference.run === Number(runIndex) && reference.step === step,
            ),
        },
        selected: selection?.kind === 'edge' && selection.index === index,
      })),
    [edges, selection, graph, runIndex, step, coverage, coverageVisible],
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
          <div className="eyebrow">Application action space</div>
          <Heading>{flowIndex === undefined ? suite.name : 'Flow path in the application'}</Heading>
          <p>
            {graph.nodes.length} observed states · {graph.edges.length} recorded transitions
          </p>
        </div>
        <a href={suite.downloads.graph} download>
          Download graph JSON ↗
        </a>
      </div>
      <p className="graph-note">
        {graph.source === 'runs'
          ? 'Application discovery has not been loaded. This partial map contains recorded states and known untried actions. Run project discovery into this report directory to expand it.'
          : graph.complete
            ? 'All reachable actions exposed by the configured entry points and fixture inputs were explored. This does not prove coverage of other inputs, roles, or external states.'
            : 'Partial application action space: discovery limits or errors may leave paths unexplored.'}
        {runIndex !== 'all' &&
          ' The full map stays in place; only this flow’s route is highlighted. Edge numbers show execution order.'}
      </p>
      <p className="graph-note">
        {graph.frontier.length} known untried actions
        {graph.entryPoints
          ? ` · ${graph.entryPoints.opened}/${graph.entryPoints.requested} entry contexts opened`
          : ''}
      </p>
      {graph.stopped && <p className="graph-note">Discovery stopped: {graph.stopped}</p>}
      {!!graph.unmatchedRunStates && (
        <p className="graph-note">
          {graph.unmatchedRunStates} recorded states were not in the saved discovery map. They are
          included without guessing connections to other states.
        </p>
      )}
      {flowIndex === undefined && (
        <div className="graph-coverage">
          <label className="coverage-toggle">
            <input
              type="checkbox"
              checked={showCoverage}
              onChange={(event) => setShowCoverage(event.target.checked)}
            />
            Show flow coverage
          </label>
          {showCoverage && (
            <div aria-label="Application coverage">
              <p>
                {coverage.visitedStates}/{nodes.length} states visited ·{' '}
                {coverage.traversedTransitions}/{edges.length} transitions traversed ·{' '}
                {coverage.flows} distinct flows
              </p>
              <p>
                Green: visited by flows. Dashed: no flow visits. Click a state or action to see its
                flows.
              </p>
              <p>
                Coverage measures recorded flow visits on the known map, regardless of test outcome.
                Discovery alone does not count as flow coverage; unknown paths are not included.
              </p>
            </div>
          )}
        </div>
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
              onNodeClick={(_, node) => {
                const index = Number(node.id.slice(6))
                setSelection({ kind: 'node', index })
                const reference = graph.nodes[index]?.references.find(
                  (item) => item.run === flowIndex,
                )
                if (reference) onChoose?.(reference.step)
              }}
              onEdgeClick={(_, edge) => {
                const index = Number(edge.id.slice(7))
                setSelection({ kind: 'edge', index })
                const reference = graph.edges[index]?.references.find(
                  (item) => item.run === flowIndex,
                )
                if (reference) onChoose?.(reference.step)
              }}
            >
              <Background />
              <Controls showInteractive={false} />
              <MiniMap
                pannable
                zoomable
                nodeColor={(node) =>
                  node.className === 'flow-path-node' || node.className === 'coverage-visited'
                    ? '#23774f'
                    : '#cbd8d1'
                }
              />
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
                {flowIndex === undefined ? (
                  coverageVisible && (
                    <FlowCoverage suite={suite} references={selectedNode.references} />
                  )
                ) : (
                  <>
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
                  </>
                )}
                <h3>Outgoing actions</h3>
                {graph.frontier
                  .filter((item) => item.from === selectedNode.id)
                  .map((item, index) => (
                    <p className="graph-untried" key={index}>
                      {item.action.label} <small>Unexplored · destination unknown</small>
                    </p>
                  ))}
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
                {flowIndex === undefined
                  ? coverageVisible && (
                      <FlowCoverage suite={suite} references={selectedEdge.references} />
                    )
                  : selectedEdge.references
                      .filter((item) => runIndex === 'all' || item.run === Number(runIndex))
                      .map((item) => (
                        <button
                          className="graph-reference"
                          key={`${item.run}-${item.step}`}
                          onClick={() =>
                            onChoose && item.run === flowIndex
                              ? onChoose(item.step)
                              : navigate(suite.id, item.run, item.step)
                          }
                        >
                          Open step {item.step} · {suite.runs[item.run]!.flow.id}
                        </button>
                      ))}
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
