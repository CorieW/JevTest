// Repeated executions and loop visits must not inflate the distinct-flow coverage count.
import { expect, it } from 'vitest'
import { flowVisits, graphCoverage } from '../client/features/graph/coverage.js'
import type { ViewerGraph, ViewerSuite } from '../shared/types.js'

it('counts flow identities once while retaining their run and step evidence', () => {
  const runs = [
    { flow: { id: 'checkout' } },
    { flow: { id: 'checkout' } },
    { flow: { id: 'cancel' } },
  ] as ViewerSuite['runs']
  const references = [
    { run: 0, step: 0 },
    { run: 0, step: 1 },
    { run: 0, step: 1 },
    { run: 1, step: 0 },
    { run: 2, step: 0 },
  ]
  const visits = flowVisits(references, runs)
  expect(visits.map((flow) => flow.id)).toEqual(['checkout', 'cancel'])
  expect(visits[0]!.references).toEqual([
    { run: 0, step: 0 },
    { run: 0, step: 1 },
    { run: 1, step: 0 },
  ])
  const graph: ViewerGraph = {
    source: 'discovery',
    complete: true,
    frontier: [],
    errors: [],
    nodes: [
      { id: 'home', url: '/', text: 'Home', references },
      { id: 'settings', url: '/settings', text: 'Settings', references: [] },
    ],
    edges: [
      {
        from: 'home',
        to: 'settings',
        action: { id: 'settings', kind: 'click', label: 'Settings' },
        references: [],
      },
    ],
  }
  expect(graphCoverage(graph, runs)).toEqual({
    nodes: [2, 0],
    edges: [0],
    visitedStates: 1,
    traversedTransitions: 0,
    flows: 2,
  })
  expect(graphCoverage(graph, [])).toEqual({
    nodes: [0, 0],
    edges: [0],
    visitedStates: 0,
    traversedTransitions: 0,
    flows: 0,
  })
})
