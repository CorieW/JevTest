// Observed graphs and a bounded breadth-first crawler keep discovery distinct from correctness.
import { randomUUID } from 'node:crypto'
import type { Action, Adapter, Flow, Observation, RunResult, Session } from './types.js'
import { bounded } from './runner.js'
import { errorMessage, positiveInteger, stable } from './util.js'

export interface Graph {
  nodes: { id: string; url: string; text: string }[]
  edges: { from: string; to: string; action: Action }[]
}
export function graphFromRuns(results: RunResult[]): Graph {
  const nodes = new Map<string, Graph['nodes'][number]>()
  const edges = new Map<string, Graph['edges'][number]>()
  const add = (state: Observation) =>
    nodes.set(state.fingerprint, { id: state.fingerprint, url: state.url, text: state.text })
  for (const run of results) {
    if (run.initial) add(run.initial)
    for (const step of run.steps) {
      add(step.before)
      if (!step.after) continue
      add(step.after)
      const edge = {
        from: step.before.fingerprint,
        to: step.after.fingerprint,
        action: step.action,
      }
      edges.set(stable(edge), edge)
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] }
}
export function toDot(graph: Graph): string {
  const quote = (value: string) => JSON.stringify(value)
  return [
    'digraph JevTest {',
    '  rankdir=LR;',
    ...graph.nodes.map(
      (n) => `  ${quote(n.id)} [label=${quote(`${n.text.slice(0, 80)}\n${n.id}`)}];`,
    ),
    ...graph.edges.map(
      (e) => `  ${quote(e.from)} -> ${quote(e.to)} [label=${quote(e.action.label)}];`,
    ),
    '}',
  ].join('\n')
}
export async function crawl(options: {
  adapter: Adapter
  flow: Flow
  maxDepth?: number
  maxStates?: number
  maxEdges?: number
  timeoutMs?: number
}): Promise<Graph & { stopped: string; errors: string[] }> {
  const maxDepth = positiveInteger(options.maxDepth ?? 5, 'maxDepth')
  const maxStates = positiveInteger(options.maxStates ?? 50, 'maxStates')
  const maxEdges = positiveInteger(options.maxEdges ?? 100, 'maxEdges')
  const signal = AbortSignal.timeout(positiveInteger(options.timeoutMs ?? 60_000, 'timeoutMs'))
  const nodes = new Map<string, Graph['nodes'][number]>()
  const edges: Graph['edges'] = []
  const errors: string[] = []
  const queue: { path: Action[]; state: Observation }[] = []
  let stopped = 'Reachable action space explored within depth limit'
  async function withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
    let session: Session | undefined
    try {
      const opening = options.adapter.open(options.flow, `crawl-${randomUUID()}`)
      opening.then(
        (s) => {
          if (signal.aborted) void s.close().catch(() => {})
        },
        () => {},
      )
      session = await bounded(opening, signal)
      return await bounded(fn(session), signal)
    } finally {
      if (session) await bounded(session.close(), AbortSignal.timeout(5000))
    }
  }
  const add = (state: Observation) =>
    nodes.set(state.fingerprint, { id: state.fingerprint, url: state.url, text: state.text })
  try {
    const initial = await withSession((s) => s.observe())
    add(initial)
    queue.push({ path: [], state: initial })
    while (queue.length && nodes.size < maxStates && edges.length < maxEdges) {
      const next = queue.shift()!
      if (next.path.length >= maxDepth) continue
      for (const action of next.state.actions) {
        signal.throwIfAborted()
        if (nodes.size >= maxStates || edges.length >= maxEdges) break
        try {
          const after = await withSession(async (s) => {
            for (const prior of next.path) {
              signal.throwIfAborted()
              await s.execute(prior)
            }
            const current = await s.observe()
            if (current.fingerprint !== next.state.fingerprint)
              throw new Error('Reset/replay drift during discovery')
            const available = current.actions.find((a) => a.id === action.id)
            if (!available || stable(available) !== stable(action))
              throw new Error('Action changed during discovery')
            signal.throwIfAborted()
            await s.execute(available)
            return s.observe()
          })
          edges.push({ from: next.state.fingerprint, to: after.fingerprint, action })
          if (!nodes.has(after.fingerprint)) {
            add(after)
            queue.push({ path: [...next.path, action], state: after })
          }
        } catch (error) {
          if (signal.aborted) throw error
          errors.push(errorMessage(error))
        }
      }
    }
    if (nodes.size >= maxStates) stopped = 'State limit reached'
    else if (edges.length >= maxEdges) stopped = 'Edge limit reached'
  } catch (error) {
    stopped = errorMessage(error)
    errors.push(stopped)
  }
  return { nodes: [...nodes.values()], edges, stopped, errors }
}
