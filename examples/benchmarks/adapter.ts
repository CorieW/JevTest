// The policy receives only public flows and rendered state; the private oracle runs in check().
import { createBrowserAdapter } from '../../src/browser.js'
import type { Json, Policy, DecisionContext, Assessment } from '../../src/types.js'
import { ABORT } from '../../src/types.js'
import type { Benchmark, Screen, View } from './contracts.js'
import { asFlow } from './contracts.js'
import type { BenchmarkHost } from './host.js'

export function benchmarkProject(benchmark: Benchmark, host: BenchmarkHost) {
  const scenarios = new Map(benchmark.cases.map((s) => [s.id, s]))
  const adapter = createBrowserAdapter({
    screenshots: false,
    setup: async (page, _flow, runId) => {
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
    normalize: (observation) => {
      // The DOM prints the same records as readData. Send those facts once, without duplicate JSON text.
      const application = (observation.data as unknown as { application: { screen: Screen } })
        .application
      const screen = application.screen
      return {
        ...observation,
        text: `${benchmark.title}: ${screen.screen} / ${screen.operation}. ${screen.notice}`,
      }
    },
    actions: async (page) =>
      page.locator('button[data-action]').evaluateAll((elements) =>
        elements.map((el) => ({
          id: el.getAttribute('data-action')!,
          label: el.textContent!.trim(),
          kind: 'click' as const,
          selector: `[data-action="${el.getAttribute('data-action')}"]`,
        })),
      ),
    check: async (page, flow) => {
      const view = await page.evaluate(
        () => (window as unknown as { benchmarkView: View }).benchmarkView,
      )
      // Domain adapters reconstruct persisted records from the public view, not mutation internals.
      const state = stateFromView(benchmark.slug, view)
      return benchmark.oracle(state, scenarios.get(flow.id)!.input)
    },
  })
  return { flows: benchmark.cases.map((s) => asFlow(s, host.url)), adapter }
}
function stateFromView(slug: string, view: View): Screen {
  const data = view.data as Record<string, Json>
  if (slug === 'reservations')
    return Object.assign({}, view.screen, {
      reservations: data.reservations,
      charged: data.chargedCredits,
      refunded: data.refundedCredits,
      result: data.result,
    })
  if (slug === 'ledger') {
    const balances = data.balances as Record<string, number>
    const recipient = Object.keys(balances).find((k) => k !== 'Primary' && k !== 'Other')!
    return Object.assign({}, view.screen, {
      primary: balances.Primary,
      recipient: balances[recipient],
      other: balances.Other,
      fees: data.collectedFees,
      entries: data.entries,
      paymentStatus: data.paymentStatus,
      cards: data.cards,
      result: data.result,
    })
  }
  return Object.assign({}, view.screen, {
    tasks: data.tasks,
    activities: data.activities,
    completedCount: data.completedCount,
    result: data.result,
  })
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
