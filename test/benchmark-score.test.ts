// A fault label alone must never turn a premature warning or an aborted test into a true positive.
import { expect, it } from 'vitest'
import { scoreCase, summarize } from './benchmarks/score.js'
import { reservations } from '../examples/reservations/jevtest/config.js'
import type { RunResult } from '../src/types.js'

const base: RunResult = {
  version: 1,
  id: 'run',
  flow: { id: 'case', goal: 'Test', startUrl: 'http://localhost', successCriteria: ['Done'] },
  status: 'incomplete',
  reason: 'Aborted',
  startedAt: '2026-09-17T00:00:00Z',
  durationMs: 1,
  initialEvidence: [],
  steps: [],
  issues: [],
  directory: 'artifacts/test',
}
const reproduced = {
  sourceRun: 'run',
  reproduced: true,
  stepsExecuted: 0,
  reason: 'Prefix reproduced',
  directory: 'artifacts/test',
}
it('separates actual detection, unexercised faults, and healthy false alarms', () => {
  const healthy = reservations.cases.find((s) => !s.fault)!
  const faulty = reservations.cases.find((s) => s.fault)!
  const detection = scoreCase(
    faulty,
    {
      ...base,
      status: 'failed',
      issues: [
        { source: 'model', step: 3, message: 'Wrong total' },
        { source: 'assertion', step: 3, message: 'Wrong total' },
      ],
    },
    { steps: 3, injectedAt: 3 },
    reproduced,
  )
  const premature = scoreCase(
    faulty,
    { ...base, issues: [{ source: 'model', step: 1, message: 'Unrelated warning' }] },
    { steps: 1, injectedAt: null },
    reproduced,
  )
  const falseAlarm = scoreCase(
    healthy,
    {
      ...base,
      status: 'passed',
      issues: [{ source: 'model', step: 3, message: 'Spurious warning' }],
    },
    { steps: 3, injectedAt: null },
    reproduced,
  )
  const clean = scoreCase(
    healthy,
    { ...base, status: 'passed' },
    { steps: 3, injectedAt: null },
    reproduced,
  )
  const scores = summarize([detection, premature, falseAlarm, clean])
  expect(premature.modelDetected).toBe(false)
  expect(scores.model).toMatchObject({
    truePositives: 1,
    falseNegatives: 1,
    falsePositives: 1,
    trueNegatives: 1,
    precision: 0.5,
    recall: 0.5,
    exposedRecall: 1,
  })
  expect(scores.combined.recall).toBe(0.5)
  expect(scores.incomplete).toBe(1)
  expect(scores.unexposedModelWarnings).toBe(2)
})
it('does not credit a warning that preceded a later fault', () => {
  const row = scoreCase(
    reservations.cases.find((s) => s.fault)!,
    { ...base, issues: [{ source: 'model', step: 1, message: 'Too early' }] },
    { steps: 3, injectedAt: 3 },
    reproduced,
  )
  expect(row.modelDetected).toBe(false)
  expect(row.misplacedModelWarning).toBe(true)
})
it('does not count unfinished healthy flows as verified true negatives', () => {
  const row = scoreCase(
    reservations.cases.find((s) => !s.fault)!,
    base,
    { steps: 0, injectedAt: null },
    reproduced,
  )
  const summary = summarize([row])
  expect(summary.model.trueNegatives).toBe(0)
  expect(summary.model.unclassifiedHealthy).toBe(1)
  expect(summary.combined.trueNegatives).toBe(0)
  expect(summary.healthyCompleted).toBe(0)
})
