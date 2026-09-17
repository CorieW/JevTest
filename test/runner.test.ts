// Runner contract tests cover false passes, incomplete runs, execution faults, isolation, and cancellation.
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Adapter, Check, Flow, Policy, Session } from '../src/types.js'
import { ABORT } from '../src/types.js'
import { runFlow, runSuite } from '../src/runner.js'
import { TraversalPolicy } from '../src/jev.js'

const flow: Flow = {
  id: 'contract',
  goal: 'Reach done',
  startUrl: 'http://localhost',
  successCriteria: ['Done'],
}
function fixture(
  options: {
    check?: (n: number) => Check
    sameState?: boolean
    executeError?: boolean
    hang?: boolean
  } = {},
) {
  const counts = { opened: 0, closed: 0, executed: 0 }
  const adapter: Adapter = {
    async open() {
      counts.opened++
      let n = 0
      const session: Session = {
        async observe() {
          return {
            fingerprint: String(options.sameState ? 0 : n),
            url: flow.startUrl,
            text: String(n),
            data: null,
            actions: [{ id: 'advance', label: 'Advance', kind: 'custom' }],
            errors: [],
            network: [],
          }
        },
        async execute() {
          counts.executed++
          if (options.hang) await new Promise(() => {})
          if (options.executeError) throw new Error('Button broke')
          n++
        },
        async check() {
          return (
            options.check?.(n) ?? { complete: n > 0, assertions: [{ name: 'Done', passed: n > 0 }] }
          )
        },
        async capture() {
          return []
        },
        async close() {
          counts.closed++
        },
      }
      return session
    },
  }
  return { adapter, counts }
}
async function run(
  options: Parameters<typeof fixture>[0] = {},
  policy: Policy = new TraversalPolicy(),
  limits = {},
) {
  const f = fixture(options)
  const outputDir = await mkdtemp(join(tmpdir(), 'jevtest-'))
  const result = await runFlow({ flow, adapter: f.adapter, policy, outputDir, limits })
  return { ...f, result }
}
describe('runner', () => {
  it('only passes after deterministic checks and persists replay data', async () => {
    const { result, counts } = await run()
    expect(result.status).toBe('passed')
    expect(counts.closed).toBe(1)
    expect(
      JSON.parse(await readFile(join(result.directory, 'trace.json'), 'utf8')).steps,
    ).toHaveLength(1)
  })
  it('detects exact failures even when the policy sees no problem', async () => {
    const { result } = await run({
      check: (n) => ({ complete: n > 0, assertions: [{ name: 'One order', passed: false }] }),
    })
    expect(result.status).toBe('failed')
    expect(result.issues[0]?.source).toBe('assertion')
  })
  it('checks invariants before selecting an action', async () => {
    const { result, counts } = await run({
      check: () => ({
        complete: false,
        assertions: [],
        invariants: [{ name: 'Checkout exists', passed: false }],
      }),
    })
    expect(result.status).toBe('failed')
    expect(counts.executed).toBe(0)
  })
  it('rejects vacuous completion', async () => {
    expect((await run({ check: () => ({ complete: true, assertions: [] }) })).result.status).toBe(
      'error',
    )
  })
  it('never marks an abort as passed', async () => {
    const policy = new TraversalPolicy()
    policy.select = async () => ({ choice: ABORT, confidence: 1, probabilities: { [ABORT]: 1 } })
    const { result, counts } = await run({}, policy)
    expect(result.status).toBe('incomplete')
    expect(counts.executed).toBe(0)
  })
  it('does not execute a hallucinated action', async () => {
    const policy = new TraversalPolicy()
    policy.select = async () => ({ choice: 'unknown', confidence: 1, probabilities: {} })
    const { result, counts } = await run({}, policy)
    expect(result.status).toBe('error')
    expect(counts.executed).toBe(0)
  })
  it('bounds repetitions and steps', async () => {
    const options = { sameState: true, check: () => ({ complete: false, assertions: [] }) }
    const repeat = await run(options, undefined, { maxRepetitions: 2 })
    expect(repeat.counts.executed).toBe(2)
    expect(repeat.result.reason).toContain('repetition')
    const step = await run(options, undefined, { maxSteps: 1 })
    expect(step.counts.executed).toBe(1)
    expect(step.result.status).toBe('incomplete')
  })
  it('captures action errors and closes the session', async () => {
    const { result, counts } = await run({ executeError: true })
    expect(result.issues[0]?.source).toBe('execution')
    expect(result.steps[0]?.after).toBeDefined()
    expect(counts.closed).toBe(1)
  })
  it('cancels stalled actions and saves an incomplete result', async () => {
    const { result, counts } = await run({ hang: true }, undefined, { timeoutMs: 30 })
    expect(result.status).toBe('incomplete')
    expect(counts.closed).toBe(1)
  })
  it('opens an independent session for each parallel flow', async () => {
    const { adapter, counts } = fixture()
    const results = await runSuite({
      flows: [flow, { ...flow, id: 'two' }],
      adapter,
      policy: new TraversalPolicy(),
      outputDir: await mkdtemp(join(tmpdir(), 'jevtest-')),
    })
    expect(results.map((r) => r.status)).toEqual(['passed', 'passed'])
    expect(counts.opened).toBe(2)
    expect(counts.closed).toBe(2)
    expect(results[0]?.directory).not.toBe(results[1]?.directory)
  })
})
