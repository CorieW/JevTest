// Exhaustive oracle checks validate every fixture; browser checks sample all workflow/version combinations.
import { describe, expect, it } from 'vitest'
import { benchmarks } from '../examples/benchmarks/catalog.js'
import { asFlow } from '../examples/benchmarks/contracts.js'
import { benchmarkProject, ReferencePolicy } from '../examples/benchmarks/adapter.js'
import { startBenchmark } from '../examples/benchmarks/host.js'
import { checkOutcome, runSuite } from '../src/runner.js'
import { replay } from '../src/replay.js'

describe('benchmark definitions', () => {
  for (const benchmark of benchmarks) {
    it(`${benchmark.slug}: defines 240 flows with 120 matched pairs and no model-visible labels`, () => {
      expect(benchmark.cases).toHaveLength(240)
      expect(new Set(benchmark.cases.map((s) => s.id)).size).toBe(240)
      expect(new Set(benchmark.cases.map((s) => s.pairId)).size).toBe(120)
      for (const scenario of benchmark.cases) {
        const twin = benchmark.cases.find(
          (s) => s.pairId === scenario.pairId && s.id !== scenario.id,
        )!
        expect(scenario.input).toEqual(twin.input)
        expect(scenario.goal).toBe(twin.goal)
        const flow = asFlow(scenario, 'http://localhost')
        if (scenario.fault) expect(JSON.stringify(flow)).not.toContain(scenario.fault)
        expect(benchmark.view(benchmark.initial(scenario), scenario)).toEqual(
          benchmark.view(benchmark.initial(twin), twin),
        )
      }
    })
    it(`${benchmark.slug}: every control passes and every fault changes observable requirements`, () => {
      for (const scenario of benchmark.cases) {
        let state = benchmark.initial(scenario)
        let injected = false
        for (const action of scenario.referenceActions) {
          expect(benchmark.view(state, scenario).buttons.some((b) => b.id === action)).toBe(true)
          const result = benchmark.reduce(state, action, scenario)
          state = result.state
          injected ||= Boolean(result.injected)
        }
        expect(injected).toBe(Boolean(scenario.fault))
        expect(
          checkOutcome(benchmark.oracle(state, scenario.input))?.status,
          `${scenario.workflow}/${scenario.variant}/${scenario.fault}`,
        ).toBe(scenario.fault ? 'failed' : 'passed')
      }
    })
    it(`${benchmark.slug}: equivalent routes preserve outcomes and cannot bypass defects`, () => {
      const aliases: Record<string, string> =
        benchmark.slug === 'ledger'
          ? { transfer: 'limit', limit: 'transfer' }
          : benchmark.slug === 'taskboard'
            ? { assign: 'permission', permission: 'assign' }
            : { reserve: 'capacity', capacity: 'reserve' }
      for (const scenario of benchmark.cases.filter((s) => s.variant < 2 && aliases[s.workflow])) {
        let state = benchmark.initial(scenario)
        let injected = false
        const actions = [
          `open-${aliases[scenario.workflow]}`,
          ...scenario.referenceActions.slice(1),
        ]
        for (const action of actions) {
          const transition = benchmark.reduce(state, action, scenario)
          state = transition.state
          injected ||= Boolean(transition.injected)
        }
        expect(injected).toBe(Boolean(scenario.fault))
        expect(checkOutcome(benchmark.oracle(state, scenario.input))?.status).toBe(
          scenario.fault ? 'failed' : 'passed',
        )
      }
    })
    it(`${benchmark.slug}: isolated browser sessions execute and replay representative flows`, async () => {
      const host = await startBenchmark(benchmark)
      try {
        const project = benchmarkProject(benchmark, host)
        const sample = benchmark.cases.filter((s) => s.variant === 0)
        const results = await runSuite({
          flows: sample.map((s) => asFlow(s, host.url)),
          adapter: project.adapter,
          policy: new ReferencePolicy(benchmark),
          limits: { concurrency: 2, maxSteps: 4 },
          outputDir: 'artifacts/benchmark-test',
        })
        for (const result of results) {
          const scenario = sample.find((s) => s.id === result.flow.id)!
          expect(result.status, result.reason).toBe(scenario.fault ? 'failed' : 'passed')
          expect(host.audit(result.id).injectedAt).toBe(scenario.fault ? 3 : null)
          expect(JSON.stringify(result.flow)).not.toContain('referenceActions')
        }
        const reproduced = await replay(results[1]!, project.adapter, 'artifacts/benchmark-test')
        expect(reproduced.reproduced, reproduced.reason).toBe(true)
      } finally {
        await host.close()
      }
    }, 60_000)
  }
})
