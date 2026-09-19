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
  runs.forEach((run, index) => {
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
      action: z.object({ id: z.string(), label: z.string(), kind: z.string() }),
    }),
  ),
  stopped: z.string().optional(),
  errors: z.array(z.string()).default([]),
})
export async function readDiscovery(
  root: string,
  id: number,
  assets: EvidenceRegistry,
): Promise<ViewerSuite> {
  const file = await realpath(resolve(root, 'graph.json'))
  if (!inside(root, file)) throw new Error('Graph must stay inside its report directory.')
  const parsed = graphSchema.safeParse(JSON.parse(await readFile(file, 'utf8')))
  if (!parsed.success) throw new Error(`Invalid JevTest graph in ${root}`)
  const graph = parsed.data
  const ids = new Set(graph.nodes.map((node) => node.id))
  if (
    ids.size !== graph.nodes.length ||
    graph.edges.some((edge) => !ids.has(edge.from) || !ids.has(edge.to))
  )
    throw new Error('Graph has duplicate states or missing transition endpoints.')
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
