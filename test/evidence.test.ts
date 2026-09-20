// Evidence must preserve record identity and uncertainty without embedding application-specific rules.
import { expect, it } from 'vitest'
import { stateChanges } from '../src/evidence.js'

it('reports observed numeric deltas without labeling them as failures', () => {
  const result = stateChanges(
    { temperature: 18, enabled: false },
    { temperature: 21.5, enabled: true },
  )
  expect(result.changes).toContainEqual({
    path: 'data/temperature',
    kind: 'changed',
    before: 18,
    after: 21.5,
    delta: 3.5,
  })
  expect(JSON.stringify(result)).not.toContain('unexpected')
})
it('matches identified records so a removed row does not become edits to its neighbor', () => {
  const first = { id: 'alpha', value: 1 }
  const second = { id: 'beta', value: 2 }
  expect(stateChanges([first, second], [second]).changes).toEqual([
    { path: 'data[id="alpha"]', kind: 'removed', before: first },
  ])
})
it('keeps numeric and string identities distinct and reports record order', () => {
  const first = { id: 1, value: 'integer' }
  const second = { id: '1', value: 'string' }
  const result = stateChanges([first, second], [second, first])
  expect(result.changes).toHaveLength(1)
  expect(result.changes[0]?.path).toContain('order')
})
it('distinguishes missing fields from null, and marks truncated evidence', () => {
  expect(stateChanges({}, { name: null }).changes).toEqual([
    { path: 'data/name', kind: 'added', after: null },
  ])
  expect(stateChanges({ a: 1, b: 2 }, { a: 2, b: 3 }, 1)).toMatchObject({ truncated: true })
})
it('preserves sequences when records have no unambiguous stable identity', () => {
  const before = [
    { name: 'same', value: 1 },
    { name: 'same', value: 2 },
  ]
  const after = [{ name: 'same', value: 2 }]
  expect(stateChanges(before, after).changes).toEqual([
    { path: 'data', kind: 'changed', before, after },
  ])
})
