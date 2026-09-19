// Normalize observed-run graphs and validate standalone discovery output before rendering.
import { readFile, realpath } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { z } from 'zod'
import { graphFromRuns } from '../../src/graph.js'
import type { RunResult } from '../../src/types.js'
import type { ViewerGraph, ViewerSuite } from '../shared/types.js'
import { safeJson, stable } from '../../src/util.js'
import { inside } from './paths.js'
import type { EvidenceRegistry } from './evidence.js'

export function observedGraph(runs: RunResult[]): ViewerGraph {
  const graph = graphFromRuns(runs)
  const references = new Map<string, { run: number; step: number }[]>()
  const transitions = new Map<string, { run: number; step: number }[]>()
  const available = new Map<string, ViewerGraph['frontier'][number]>()
  const traversed = new Set(graph.edges.map((edge) => stable([edge.from, edge.action])))
  runs.forEach((run, index) => {
    for (const state of [run.initial, ...run.steps.flatMap((step) => [step.before, step.after])]) {
      if (!state) continue
      for (const action of state.actions ?? []) {
        if (!traversed.has(stable([state.fingerprint, action])))
          available.set(stable([state.fingerprint, action, run.flow.id]), {
            from: state.fingerprint,
            action,
            flowId: run.flow.id,
          })
      }
    }
    run.steps.forEach((step, position) => {
      if (!step.after) return
      const key = stable({
        from: step.before.fingerprint,
        to: step.after.fingerprint,
        action: step.action,
      })
      const entries = transitions.get(key) ?? []
      entries.push({ run: index, step: position + 1 })
      transitions.set(key, entries)
    })
    ;[run.initial, ...run.steps.map((step) => step.after)].forEach((state, step) => {
      if (!state) return
      const entries = references.get(state.fingerprint) ?? []
      entries.push({ run: index, step })
      references.set(state.fingerprint, entries)
    })
  })
  return {
    ...graph,
    edges: graph.edges.map((edge) => ({
      ...edge,
      references: transitions.get(stable(edge)) ?? [],
    })),
    source: 'runs',
    frontier: [...available.values()],
    errors: [],
    nodes: graph.nodes.map((node) => ({ ...node, references: references.get(node.id) ?? [] })),
  }
}
const graphSchema = z.object({
  nodes: z.array(z.object({ id: z.string(), url: z.string(), text: z.string() })),
  edges: z.array(
    z.object({
      from: z.string(),
      to: z.string(),
      action: z.object({ id: z.string(), label: z.string(), kind: z.string() }).passthrough(),
    }),
  ),
  stopped: z.string().optional(),
  errors: z.array(z.string()).default([]),
  complete: z.boolean().optional(),
  entryPoints: z
    .object({ requested: z.number().int().nonnegative(), opened: z.number().int().nonnegative() })
    .optional(),
  frontier: z
    .array(
      z.object({
        from: z.string(),
        action: z.object({ id: z.string(), label: z.string(), kind: z.string() }).passthrough(),
        flowId: z.string(),
      }),
    )
    .default([]),
})
async function loadGraph(root: string, name: string) {
  const file = await realpath(resolve(root, name))
  if (!inside(root, file)) throw new Error('Graph must stay inside its report directory.')
  const parsed = graphSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
  if (!parsed.success) throw new Error(`Invalid JevTest graph in ${root}`)
  const graph = parsed.data
  const ids = new Set(graph.nodes.map((node) => node.id))
  if (
    ids.size !== graph.nodes.length ||
    graph.edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to)) ||
    graph.frontier.some((item) => !ids.has(item.from))
  )
    throw new Error('Graph has duplicate states or missing transition endpoints.')
  return graph
}

export async function applicationGraph(root: string, runs: RunResult[]): Promise<ViewerGraph> {
  const observed = observedGraph(runs)
  const discovery = await loadGraph(root, 'action-space.json').catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return undefined
      throw error
    },
  )
  if (!discovery) return observed
  const nodes = new Map(
    discovery.nodes.map((node) => [
      node.id,
      { ...node, references: [] as { run: number; step: number }[] },
    ]),
  )
  const key = (edge: ViewerGraph['edges'][number] | (typeof discovery.edges)[number]) =>
    stable([edge.from, edge.to, edge.action])
  const edges = new Map(
    discovery.edges.map((edge) => [
      key(edge),
      { ...edge, references: [] as { run: number; step: number }[] },
    ]),
  )
  const unmatchedRunStates = observed.nodes.filter((node) => !nodes.has(node.id)).length
  const unmatchedTransitions = observed.edges.some((edge) => !edges.has(key(edge)))
  for (const node of observed.nodes) nodes.set(node.id, node)
  for (const edge of observed.edges) edges.set(key(edge), edge)
  const traversed = new Set([...edges.values()].map((edge) => stable([edge.from, edge.action])))
  const frontier = new Map(
    [...discovery.frontier, ...observed.frontier]
      .filter((item) => !traversed.has(stable([item.from, item.action])))
      .map((item) => [stable(item), item]),
  )
  // Completeness belongs to discovery's configured contexts; traces can reveal additional unknown actions.
  return {
    ...discovery,
    source: 'application',
    complete:
      discovery.complete === true &&
      frontier.size === 0 &&
      unmatchedRunStates === 0 &&
      !unmatchedTransitions,
    unmatchedRunStates,
    frontier: [...frontier.values()],
    nodes: [...nodes.values()],
    edges: [...edges.values()],
  }
}
export async function readDiscovery(
  root: string,
  id: number,
  assets: EvidenceRegistry,
): Promise<ViewerSuite> {
  const graph = await loadGraph(root, 'graph.json')
  const file = resolve(root, 'graph.json')
  const url = `/evidence/${id}/graph.json`
  assets.set(url, { root, file })
  return safeJson({
    id,
    name: basename(root),
    totals: { passed: 0, failed: 0, incomplete: 0, error: 0 },
    policy: 'discovery',
    downloads: { graph: url },
    runs: [],
    graph: {
      ...graph,
      edges: graph.edges.map((edge) => ({ ...edge, references: [] })),
      source: 'discovery',
      nodes: graph.nodes.map((node) => ({ ...node, references: [] })),
    },
  })
}
