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
export interface DiscoveryGraph extends Graph {
  stopped: string
  errors: string[]
  complete: boolean
  entryPoints: { requested: number; opened: number }
  frontier: { from: string; action: Action; flowId: string }[]
}
export async function crawl(options: {
  adapter: Adapter
  flow?: Flow
  flows?: Flow[]
  maxDepth?: number
  maxStates?: number
  maxEdges?: number
  timeoutMs?: number
  cleanupTimeoutMs?: number
  signal?: AbortSignal
}): Promise<DiscoveryGraph> {
  const flows = options.flows ?? (options.flow ? [options.flow] : [])
  if (!flows.length) throw new Error('Discovery requires at least one entry flow.')
  const maxDepth = positiveInteger(options.maxDepth ?? 5, 'maxDepth')
  const maxStates = positiveInteger(options.maxStates ?? 50, 'maxStates')
  const maxEdges = positiveInteger(options.maxEdges ?? 100, 'maxEdges')
  const signal = AbortSignal.any([
    AbortSignal.timeout(positiveInteger(options.timeoutMs ?? 60_000, 'timeoutMs')),
    ...(options.signal ? [options.signal] : []),
  ])
  const cleanupTimeout = positiveInteger(options.cleanupTimeoutMs ?? 15_000, 'cleanupTimeoutMs')
  const nodes = new Map<string, Graph['nodes'][number]>()
  const edges = new Map<string, Graph['edges'][number]>()
  const errors: string[] = []
  const queue: { flow: Flow; path: Action[]; state: Observation }[] = []
  const visited = new Set<string>()
  const frontier = new Map<string, DiscoveryGraph['frontier'][number]>()
  let opened = 0
  let stopped = 'Configured reachable action space explored'
  const key = (flow: Flow, state: Observation, action?: Action) =>
    stable([flow.id, state.fingerprint, action])
  const enqueue = (flow: Flow, state: Observation, path: Action[]) => {
    const identity = key(flow, state)
    if (visited.has(identity)) return
    visited.add(identity)
    nodes.set(state.fingerprint, { id: state.fingerprint, url: state.url, text: state.text })
    for (const action of state.actions)
      frontier.set(key(flow, state, action), { from: state.fingerprint, action, flowId: flow.id })
    queue.push({ flow, state, path })
  }
  async function withSession<T>(flow: Flow, fn: (s: Session) => Promise<T>): Promise<T> {
    let session: Session | undefined
    try {
      const opening = options.adapter.open(flow, `crawl-${randomUUID()}`)
      opening.then(
        (s) => {
          if (signal.aborted) void s.close().catch(() => {})
        },
        () => {},
      )
      session = await bounded(opening, signal)
      return await bounded(fn(session), signal)
    } finally {
      if (session) await bounded(session.close(), AbortSignal.timeout(cleanupTimeout))
    }
  }
  try {
    for (const flow of flows) {
      signal.throwIfAborted()
      if (nodes.size >= maxStates) break
      try {
        const initial = await withSession(flow, (s) => s.observe())
        opened++
        enqueue(flow, initial, [])
      } catch (error) {
        if (signal.aborted) throw error
        errors.push(errorMessage(error))
      }
    }
    while (queue.length && nodes.size < maxStates && edges.size < maxEdges) {
      const next = queue.shift()!
      if (next.path.length >= maxDepth) continue
      for (const action of next.state.actions) {
        signal.throwIfAborted()
        if (nodes.size >= maxStates || edges.size >= maxEdges) break
        try {
          const after = await withSession(next.flow, async (s) => {
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
          const edge = { from: next.state.fingerprint, to: after.fingerprint, action }
          edges.set(stable(edge), edge)
          frontier.delete(key(next.flow, next.state, action))
          enqueue(next.flow, after, [...next.path, action])
        } catch (error) {
          if (signal.aborted) throw error
          errors.push(errorMessage(error))
        }
      }
    }
    if (nodes.size >= maxStates) stopped = 'State limit reached'
    else if (edges.size >= maxEdges) stopped = 'Edge limit reached'
    else if (frontier.size)
      stopped = errors.length ? 'Discovery errors left unexplored actions' : 'Depth limit reached'
    else if (errors.length) stopped = 'Discovery errors prevented complete exploration'
  } catch (error) {
    stopped = errorMessage(error)
    errors.push(stopped)
  }
  return {
    nodes: [...nodes.values()],
    edges: [...edges.values()],
    stopped,
    errors,
    complete: frontier.size === 0 && opened === flows.length && errors.length === 0,
    entryPoints: { requested: flows.length, opened },
    frontier: [...frontier.values()],
  }
}
