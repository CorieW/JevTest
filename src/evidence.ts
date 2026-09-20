// Domain-independent evidence projection: observed changes are facts, never automatic bug labels.
import type { Flow, Json, Observation } from './types.js'
import { stable } from './util.js'

export interface Change {
  path: string
  kind: 'added' | 'removed' | 'changed'
  before?: Json
  after?: Json
  delta?: number
}
export function stateChanges(before: Json, after: Json, limit = 60) {
  const changes: Change[] = []
  let truncated = false
  const add = (path: string, left: Json | undefined, right: Json | undefined) => {
    if (changes.length >= limit) {
      truncated = true
      return
    }
    changes.push({
      path,
      kind: left === undefined ? 'added' : right === undefined ? 'removed' : 'changed',
      ...(left === undefined ? {} : { before: left }),
      ...(right === undefined ? {} : { after: right }),
      ...(typeof left === 'number' && typeof right === 'number'
        ? { delta: Number((right - left).toPrecision(12)) }
        : {}),
    })
  }
  const object = (value: Json | undefined): value is Record<string, Json> =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
  const walk = (left: Json | undefined, right: Json | undefined, path: string, depth: number) => {
    if (stable(left) === stable(right) && (left === undefined) === (right === undefined)) return
    if (depth >= 12) return add(path, left, right)
    if (Array.isArray(left) && Array.isArray(right)) {
      // Match records by an observed unique identity; do not misread a deletion as edits to every later row.
      const identity = ['id', 'key', 'name'].find((key) =>
        [left, right].every(
          (rows) =>
            rows.every((r) => object(r) && ['string', 'number'].includes(typeof r[key])) &&
            new Set(rows.map((r) => stable((r as Record<string, Json>)[key]))).size === rows.length,
        ),
      )
      if (identity && left.length + right.length > 0) {
        const keyed = (rows: Json[]) =>
          new Map(rows.map((r) => [stable((r as Record<string, Json>)[identity]), r]))
        const oldRows = keyed(left)
        const newRows = keyed(right)
        for (const id of new Set([...oldRows.keys(), ...newRows.keys()]))
          walk(oldRows.get(id), newRows.get(id), `${path}[${identity}=${id}]`, depth + 1)
        const retainedBefore = [...oldRows.keys()].filter((id) => newRows.has(id))
        const retainedAfter = [...newRows.keys()].filter((id) => oldRows.has(id))
        if (stable(retainedBefore) !== stable(retainedAfter))
          add(`${path} (record order)`, retainedBefore, retainedAfter)
        return
      }
      // Preserve complete sequences when identity is ambiguous; indices alone do not establish identity.
      return add(path, left, right)
    }
    if (object(left) && object(right)) {
      for (const key of new Set([...Object.keys(left), ...Object.keys(right)]))
        walk(
          left[key],
          right[key],
          `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`,
          depth + 1,
        )
      return
    }
    add(path, left, right)
  }
  walk(before, after, 'data', 0)
  return { changes, truncated }
}

export const publicTask = (flow: Flow) => ({
  goal: flow.goal,
  requirements: flow.successCriteria,
  fixtures: flow.fixtures ?? null,
})

export function observedState(observation: Observation) {
  return {
    text: observation.text.slice(0, 3000),
    textTruncated: observation.text.length > 3000,
    data: observation.data,
    errors: observation.errors,
    failedRequests: observation.network.filter(
      (r) => r.error || r.status === null || r.status >= 400,
    ),
  }
}
