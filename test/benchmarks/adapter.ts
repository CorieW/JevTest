// Browser integration exposes public controls and data; correctness and fault-exposure bookkeeping stay private.
import { createBrowserAdapter } from '../../src/browser.js'
import type { Action, Adapter, Json, Policy, DecisionContext, Assessment } from '../../src/types.js'
import { ABORT } from '../../src/types.js'
import type { Benchmark, View } from './contracts.js'
import { asFlow } from './contracts.js'
import type { BenchmarkHost } from './host.js'
import { startBenchmark } from './host.js'
import type { Project } from '../../src/types.js'
export async function exampleProject(benchmark: Benchmark): Promise<Project> {
  const host = await startBenchmark(benchmark, Number(process.env.JEVTEST_PORT ?? 4320))
  try {
    return {
      ...benchmarkProject(benchmark, host),
      limits: { maxSteps: 12, concurrency: 2 },
      dispose: host.close,
    }
  } catch (error) {
    await host.close()
    throw error
  }
}
export function benchmarkProject(benchmark: Benchmark, host: BenchmarkHost) {
  const scenarios = new Map(benchmark.cases.map((s) => [s.id, s]))
  const browser = createBrowserAdapter({
    screenshots: false,
    setup: async (page, _flow, runId) => {
      host.trackBrowser(runId)
      await page.context().addCookies([
        {
          name: 'benchmark-run',
          value: runId,
          url: host.url,
          httpOnly: true,
          sameSite: 'Strict',
        },
      ])
    },
    cleanup: async (_flow, runId) => {
      host.release(runId)
    },
    ready: async (page) => {
      await page.waitForFunction(
        () =>
          Boolean((window as unknown as { benchmarkView?: View }).benchmarkView) &&
          !(window as unknown as { benchmarkBusy: boolean }).benchmarkBusy,
      )
    },
    readData: async (page) =>
      (await page.evaluate(() => {
        const view = (window as unknown as { benchmarkView: View }).benchmarkView
        return { screen: view.screen, observed: view.data }
      })) as unknown as Json,
    actions: async (page, flow) => {
      const fixtures = flow.fixtures as Record<string, Json> | undefined
      const view = await page.evaluate(
        () => (window as unknown as { benchmarkView: View }).benchmarkView,
      )
      const actions: Action[] = view.buttons.map((b) => ({
        id: b.id,
        label: b.label,
        kind: 'click',
        selector: `[data-action="${b.id}"]`,
      }))
      if (view.screen.screen === 'choose')
        for (const field of view.fields ?? []) {
          const values =
            field.type === 'select'
              ? (field.options ?? []).map((o) => ({ value: o.value, label: o.label }))
              : [
                  {
                    value: String(fixtures?.[field.fixture] ?? ''),
                    label: String(fixtures?.[field.fixture] ?? ''),
                  },
                ]
          for (const value of values)
            if (value.value)
              actions.push({
                id: `${field.type === 'select' ? 'select' : 'fill'}-${field.name}:${value.value}`,
                label: `${field.label}: ${value.label}`,
                kind: field.type === 'select' ? 'select' : 'fill',
                selector: `#${field.name}`,
                value: value.value,
              })
        }
      return actions
    },
    check: async (page, flow) => {
      const view = await page.evaluate(
        () => (window as unknown as { benchmarkView: View }).benchmarkView,
      )
      return benchmark.oracle(benchmark.restore(view), scenarios.get(flow.id)!.input)
    },
  })
  const adapter: Adapter = {
    open: async (flow, runId) => {
      const session = await browser.open(flow, runId)
      return {
        ...session,
        execute: async (action) => {
          host.recordStep(runId)
          await session.execute(action)
        },
      }
    },
  }
  return { flows: benchmark.cases.map((s) => asFlow(s, host.url)), adapter }
}
export class ReferencePolicy implements Policy {
  constructor(private readonly benchmark: Benchmark) {}
  async select(context: DecisionContext) {
    const scenario = this.benchmark.cases.find((s) => s.id === context.flow.id)!
    const choice = scenario.referenceActions[context.history.length] ?? ABORT
    return { choice, confidence: 1, probabilities: { [choice]: 1 } }
  }
  async assess(): Promise<Assessment> {
    return {
      choice: 'uncertain',
      confidence: 0,
      probabilities: { expected: 0, unexpected: 0, uncertain: 1 },
    }
  }
}
