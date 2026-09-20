// Real Chromium validation uses twelve labeled flows, saved evidence, replay, and bounded discovery.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { startShop } from '../examples/shop/src/server.js'
import { cases, shopProject } from '../examples/shop/jevtest/project.js'
import { runSuite } from '../src/runner.js'
import { TraversalPolicy } from '../src/jev.js'
import { replay } from '../src/replay.js'
import { crawl, graphFromRuns } from '../src/graph.js'
import { createBrowserAdapter, discoverActions } from '../src/browser.js'
import { writeReport } from '../src/report.js'
import type { RunResult } from '../src/types.js'

let shop: Awaited<ReturnType<typeof startShop>>
let results: RunResult[]
beforeAll(async () => {
  shop = await startShop()
  const project = shopProject(shop.url)
  results = await runSuite({
    flows: project.flows,
    adapter: project.adapter,
    policy: new TraversalPolicy(),
    limits: project.limits,
    outputDir: resolve('artifacts/test'),
  })
}, 120_000)
afterAll(async () => {
  await shop?.close()
})
it('waits for shared cleanup when close is called concurrently', async () => {
  let markEntered!: () => void
  let releaseCleanup!: () => void
  const entered = new Promise<void>((resolve) => {
    markEntered = resolve
  })
  const release = new Promise<void>((resolve) => {
    releaseCleanup = resolve
  })
  let calls = 0
  const adapter = createBrowserAdapter({
    check: async () => ({ complete: false, assertions: [] }),
    cleanup: async () => {
      calls++
      markEntered()
      await release
    },
  })
  const session = await adapter.open(shopProject(shop.url).flows[0]!, 'concurrent-close')
  const first = session.close()
  await entered
  let finished = false
  const second = session.close().then(() => {
    finished = true
  })
  try {
    await Promise.resolve()
    expect(finished).toBe(false)
    expect(calls).toBe(1)
  } finally {
    releaseCleanup()
    await Promise.all([first, second])
  }
})
it('passes all six healthy flows and detects all six planted faults', () => {
  for (const result of results) {
    const spec = cases.find((c) => c.id === result.flow.id)!
    expect(result.status, `${result.flow.id}: ${result.reason}`).toBe(
      spec.bug === 'none' ? 'passed' : 'failed',
    )
    if (spec.bug !== 'none') expect(result.issues.some((i) => i.source === 'assertion')).toBe(true)
  }
})
it('captures HTTP errors and browser errors as evidence', () => {
  const result = results.find((r) => r.flow.id === 'payment-failure')!
  expect(result.steps.at(-1)?.after?.network.some((n) => n.status === 500)).toBe(true)
  expect(result.steps.at(-1)?.after?.errors.length).toBeGreaterThan(0)
})
it('reproduces a healthy flow and planted bug without Jev', async () => {
  const adapter = shopProject(shop.url).adapter
  for (const id of ['single-item', 'duplicate-order']) {
    const result = await replay(
      results.find((r) => r.flow.id === id)!,
      adapter,
      'artifacts/test',
    )
    expect(result.reproduced, result.reason).toBe(true)
  }
})
it('reports drift instead of silently adapting a replay', async () => {
  const trace = structuredClone(results[0]!)
  trace.initial!.fingerprint = 'changed'
  const result = await replay(trace, shopProject(shop.url).adapter, 'artifacts/test')
  expect(result.reproduced).toBe(false)
  expect(result.reason).toContain('diverged')
})
it('discovers states from resets and exports reports', async () => {
  const project = shopProject(shop.url)
  const graph = await crawl({
    adapter: project.adapter,
    flow: project.flows[0]!,
    maxDepth: 4,
    maxStates: 8,
    maxEdges: 8,
  })
  expect(graph.errors).toEqual([])
  expect(graph.nodes).toHaveLength(4)
  expect(graph.edges).toHaveLength(3)
  expect(graphFromRuns(results).edges.length).toBeGreaterThan(10)
  expect(await writeReport(results, 'artifacts/test')).toContain('report.html')
})
it('discovers only visible usable controls and supplied input choices', async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await page.setContent(
      '<input id="name"><input type="password" id="password"><button id="go">Go</button><button disabled>Disabled</button><button style="display:none">Hidden</button><select id="size"><option>S</option></select>',
    )
    const actions = await discoverActions(page, { '#name': ['Ada'], '#size': ['S'] })
    expect(actions.map((a) => a.selector).sort()).toEqual(['#go', '#name', '#size'])
    expect(actions.find((a) => a.kind === 'fill')?.value).toBe('Ada')
    await page.setContent(
      '<label for="email">Contact email</label><input id="email"><span id="heading">Plan size</span><select id="plan" aria-labelledby="heading"><option>S</option></select><input type="submit" value="Save profile" id="save">',
    )
    const labeled = await discoverActions(page, {
      '#email': ['person@example.test'],
      '#plan': ['S'],
    })
    expect(labeled.find((a) => a.selector === '#email')?.label).toContain('Contact email')
    expect(labeled.find((a) => a.selector === '#plan')?.label).toContain('Plan size')
    expect(labeled.find((a) => a.selector === '#save')?.label).toContain('Save profile')
  } finally {
    await browser.close()
  }
})
