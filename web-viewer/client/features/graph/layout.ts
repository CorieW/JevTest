// Dagre positions directed multigraphs, including parallel actions and cycles.
import { graphlib, layout } from '@dagrejs/dagre'
import { MarkerType, Position, type Node, type Edge } from '@xyflow/react'
import type { ViewerGraph } from '../../../shared/types.js'
export type RoutedEdge = Edge<{
  points: { x: number; y: number }[]
  label: string
  pathSteps?: number[]
  current?: boolean
  flowCount?: number
}>
export function layoutGraph(graph: ViewerGraph): { nodes: Node[]; edges: RoutedEdge[] } {
  const model = new graphlib.Graph({ multigraph: true })
    .setGraph({ rankdir: 'LR', nodesep: 50, ranksep: 220, edgesep: 30, marginx: 40, marginy: 40 })
    .setDefaultEdgeLabel(() => ({}))
  // Internal IDs prevent saved fingerprints from becoming CSS selectors or reserved graph keys.
  const ids = new Map(graph.nodes.map((node, i) => [node.id, `state-${i}`]))
  graph.nodes.forEach((node) => model.setNode(ids.get(node.id)!, { width: 220, height: 86 }))
  graph.edges.forEach((edge, i) =>
    model.setEdge(ids.get(edge.from)!, ids.get(edge.to)!, {}, `action-${i}`),
  )
  layout(model)
  return {
    nodes: graph.nodes.map((node, i) => {
      const id = ids.get(node.id)!,
        position = model.node(id)
      return {
        id,
        width: 220,
        height: 86,
        position: { x: position.x - 110, y: position.y - 43 },
        sourcePosition: Position.Right,
        targetPosition: Position.Left,
        data: {
          label: `State ${i + 1}\n${node.text.slice(0, 60) || node.url}${graph.frontier.some((item) => item.from === node.id) ? '\nUntried actions available' : ''}`,
          fingerprint: node.id,
        },
        style: { width: 220, height: 86 },
        ariaLabel: `State ${i + 1}: ${node.text.slice(0, 90) || node.url}`,
      }
    }),
    edges: graph.edges.map((edge, i) => {
      const source = ids.get(edge.from)!,
        target = ids.get(edge.to)!,
        id = `action-${i}`
      return {
        id,
        source,
        target,
        type: 'routed',
        data: {
          points: model.edge({ v: source, w: target, name: id }).points,
          label: edge.action.label,
        },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#668b7c' },
        ariaLabel: edge.action.label,
      }
    }),
  }
}
