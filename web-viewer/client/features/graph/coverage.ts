// Count distinct test flows separately from discovery and repeated visits.
import type { ViewerGraph, ViewerSuite } from '../../../shared/types.js'

export function flowVisits(
  references: ViewerGraph['nodes'][number]['references'],
  runs: ViewerSuite['runs'],
) {
  const flows = new Map<string, { id: string; references: typeof references }>()
  for (const reference of references) {
    const run = runs[reference.run]
    if (!run) continue
    const flow = flows.get(run.flow.id) ?? { id: run.flow.id, references: [] }
    if (!flow.references.some((item) => item.run === reference.run && item.step === reference.step))
      flow.references.push(reference)
    flows.set(flow.id, flow)
  }
  return [...flows.values()]
}

export function graphCoverage(graph: ViewerGraph, runs: ViewerSuite['runs']) {
  const nodes = graph.nodes.map((node) => flowVisits(node.references, runs).length)
  const edges = graph.edges.map((edge) => flowVisits(edge.references, runs).length)
  return {
    nodes,
    edges,
    visitedStates: nodes.filter(Boolean).length,
    traversedTransitions: edges.filter(Boolean).length,
    flows: flowVisits(
      [
        ...graph.nodes.flatMap((node) => node.references),
        ...graph.edges.flatMap((edge) => edge.references),
      ],
      runs,
    ).length,
  }
}
