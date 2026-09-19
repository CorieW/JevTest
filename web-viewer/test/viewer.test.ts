// Exercise the real viewer's navigation, outcome semantics, untrusted evidence, and file boundaries.
import { beforeAll, afterAll, expect, it } from 'vitest'
import { chromium, type Browser } from 'playwright'
import { mkdir, mkdtemp, readFile, writeFile, symlink } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { get } from 'node:http'
import { startViewer } from '../server/http.js'
import { writeReport } from '../../src/report.js'
import type { RunResult, Observation } from '../../src/types.js'

let root: string
let viewer: Awaited<ReturnType<typeof startViewer>>
let browser: Browser
const attack = '<img src=x onerror="window.viewerInjected=true">'
const observed: Observation = {
  fingerprint: 'before',
  url: 'http://example.test/',
  text: 'Saved page',
  data: { balance: 20 },
  actions: [],
  errors: [],
  network: [],
}
beforeAll(async () => {
  await mkdir('artifacts/viewer-tests', { recursive: true })
  root = await mkdtemp(resolve('artifacts/viewer-tests/suite-'))
  const runs: RunResult[] = []
  for (const [index, status] of (['passed', 'failed', 'incomplete', 'error'] as const).entries()) {
    const directory = join(root, `run-${index}`)
    await mkdir(directory)
    const run: RunResult = {
      version: 1,
      id: `run-${index}`,
      directory,
      flow: {
        id: `flow-${status}`,
        goal: status === 'failed' ? `Transfer balance ${attack}` : `Inspect ${status} flow`,
        startUrl: observed.url,
        successCriteria: ['Debit once'],
      },
      status,
      reason: `${status} result`,
      durationMs: 1200,
      startedAt: '2026-09-18T09:00:00Z',
      initial: observed,
      initialEvidence: ['initial.html', 'missing.png'],
      initialCheck: {
        complete: false,
        assertions: [{ name: 'Debit once', passed: false, expected: 10, actual: 20 }],
        invariants: [{ name: 'Balance nonnegative', passed: true }],
      },
      steps: [
        {
          index: 1,
          before: observed,
          after: { ...observed, fingerprint: 'after', data: { balance: 8 } },
          action: { id: 'pay', label: 'Submit payment', kind: 'click' },
          selection: { choice: 'pay', confidence: 1, probabilities: { pay: 1 } },
          check: {
            complete: status !== 'incomplete',
            assertions: [
              { name: 'Debit once', passed: status === 'passed', expected: 10, actual: 8 },
            ],
          },
          evidence: ['initial.html'],
        },
      ],
      issues:
        status === 'passed'
          ? [{ source: 'model', step: 1, message: 'Candidate needs review' }]
          : [],
    }
    await writeFile(join(directory, 'trace.json'), JSON.stringify(run))
    await writeFile(
      join(directory, 'initial.html'),
      '<!doctype html><h1>Captured application</h1><script>parent.viewerInjected=true;fetch("/api/suites")</script>',
    )
    runs.push(run)
  }
  // An explicitly listed file behind a junction must not escape the suite boundary.
  const outside = await mkdtemp(resolve('artifacts/viewer-tests/outside-'))
  await writeFile(join(outside, 'secret.png'), 'outside report')
  await symlink(outside, join(root, 'run-0', 'escape'), 'junction')
  runs[0]!.initialEvidence.push('escape/secret.png', '../../outside.png')
  await writeReport(runs, root, undefined, { policy: 'baseline', title: 'Viewer fixture' })
  const empty = join(root, 'empty')
  await writeReport([], empty)
  const paginated = join(root, 'paginated')
  await writeReport(
    Array.from({ length: 18 }, (_, index) => ({
      ...runs[0]!,
      id: `page-${index}`,
      flow: { ...runs[0]!.flow, id: `page-${index}` },
    })),
    paginated,
  )
  const discovery = join(root, 'discovery')
  await mkdir(discovery)
  await writeFile(
    join(discovery, 'graph.json'),
    JSON.stringify({
      nodes: [
        { id: 'a', url: 'http://example.test', text: attack },
        { id: 'b', url: 'http://example.test/done', text: 'Destination' },
      ],
      edges: [
        { from: 'a', to: 'a', action: { id: 'stay', label: 'Stay here', kind: 'click' } },
        { from: 'a', to: 'b', action: { id: 'first', label: 'First route', kind: 'click' } },
        { from: 'a', to: 'b', action: { id: 'second', label: 'Second route', kind: 'click' } },
        { from: 'b', to: 'a', action: { id: 'back', label: 'Return', kind: 'click' } },
      ],
      stopped: 'State limit reached',
      errors: ['A recorded discovery error'],
    }),
  )
  viewer = await startViewer({ directories: [root, empty, paginated, discovery], port: 0 })
  browser = await chromium.launch()
})
afterAll(async () => {
  await browser?.close()
  await viewer?.close()
})

it('serves only read-only, allowlisted evidence inside the suite', async () => {
  expect((await fetch(viewer.url, { method: 'POST' })).status).toBe(405)
  const foreignHost = await new Promise<number | undefined>((done, reject) => {
    get(viewer.url, { headers: { host: 'other.example' } }, (response) => {
      response.resume()
      done(response.statusCode)
    }).on('error', reject)
  })
  expect(foreignHost).toBe(403)
  expect((await fetch(`${viewer.url}/package.json`)).status).toBe(404)
  const suite = await (await fetch(`${viewer.url}/api/suites/0`)).json()
  const evidence = suite.runs[0].states[0].evidence
  expect(evidence.some((item: { name: string }) => item.name === 'outside.png')).toBe(false)
  const escape = evidence.find((item: { name: string }) => item.name === 'secret.png')
  expect((await fetch(viewer.url + escape.url)).status).toBe(404)
  const snapshot = await fetch(viewer.url + evidence[0].url)
  expect(snapshot.headers.get('content-security-policy')).toContain('sandbox;')
  expect(snapshot.headers.get('content-security-policy')).toContain("default-src 'none'")
  expect((await fetch(`${viewer.url}/api/suites/99`)).status).toBe(404)
})

it('filters, searches, preserves outcome semantics, and steps through evidence safely', async () => {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1050 } })
  try {
    await page.goto(viewer.url)
    await page.getByRole('heading', { name: /Recorded flows/ }).waitFor()
    expect(await page.locator('.flow-link').count()).toBe(4)
    await page.getByRole('button', { name: 'Filter failed flows', exact: true }).click()
    expect(await page.locator('.flow-link').count()).toBe(1)
    expect(await page.locator('.flow-link').innerText()).toContain(attack)
    expect(await page.evaluate(() => 'viewerInjected' in window)).toBe(false)
    await page.getByRole('searchbox', { name: 'Search flows' }).fill('missing flow')
    await page.getByRole('heading', { name: 'No matching flows' }).waitFor()
    expect(
      await page
        .getByRole('searchbox', { name: 'Search flows' })
        .evaluate((input) => input === document.activeElement),
    ).toBe(true)
    await page.getByRole('searchbox', { name: 'Search flows' }).fill('')
    await page.locator('.flow-link').click()
    await page.getByRole('heading', { name: 'Exact correctness checks' }).waitFor()
    expect(await page.locator('.check').last().innerText()).toContain('PENDING')
    await page.getByText('This evidence file is missing.', { exact: false }).waitFor()
    await page.getByRole('button', { name: 'Page snapshot', exact: true }).click()
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Captured application' })
      .waitFor()
    expect(await page.evaluate(() => 'viewerInjected' in window)).toBe(false)
    expect(await page.locator('iframe').getAttribute('sandbox')).toBe('')
    await page.getByRole('button', { name: 'Next →', exact: true }).click()
    await page.locator('.check .failed').waitFor()
    expect(await page.getByRole('button', { name: 'Screenshot', exact: true }).isDisabled()).toBe(
      true,
    )
    await page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'Captured application' })
      .waitFor()
    expect(await page.locator('.comparison').innerText()).toContain('10')
    expect(await page.locator('.comparison').innerText()).toContain('8')
    await page.getByRole('button', { name: 'State changes', exact: true }).click()
    expect(await page.locator('#inspector').innerText()).toContain('data/balance')
    await page.reload()
    await page.getByRole('button', { name: 'Next →', exact: true }).waitFor()
    expect(await page.getByRole('button', { name: 'Next →', exact: true }).isDisabled()).toBe(true)
    await page.getByRole('button', { name: '← All flows', exact: true }).click()
    await page.getByLabel('Filter outcomes', { exact: true }).selectOption('incomplete')
    await page.locator('.flow-link').click()
    await page.getByRole('button', { name: 'Next →', exact: true }).click()
    expect(await page.locator('.run-heading .badge').innerText()).toBe('INCOMPLETE')
    expect(await page.locator('.check').last().innerText()).toContain('PENDING')
    await page.getByRole('button', { name: '← All flows', exact: true }).click()
    await page.getByLabel('Filter outcomes', { exact: true }).selectOption('candidates')
    expect(await page.locator('.flow-link').count()).toBe(1)
    expect(await page.locator('tbody .passed').innerText()).toBe('PASSED')
    expect(await page.locator('tbody .candidate').innerText()).toContain('CANDIDATE')
  } finally {
    await page.close()
  }
}, 60000)

it('handles missing evidence, empty suites, playback, and narrow screens', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.goto(viewer.url + '/#suite=0&run=0&step=0')
    await page.getByText('This evidence file is missing.', { exact: false }).waitFor()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByRole('button', { name: 'Play captured steps', exact: true }).click()
    await page.waitForURL(/step=1/)
    await page.getByRole('button', { name: 'Play captured steps', exact: true }).waitFor()
    await page.goto(viewer.url + '/#suite=1')
    await page.getByRole('heading', { name: 'No matching flows' }).waitFor()
    expect(await page.locator('.stat b').allTextContents()).toEqual(['0', '0', '0', '0'])
    expect(await page.locator('main').innerText()).toContain('API usage not recorded')
  } finally {
    await page.close()
  }
})

it('cancels playback when navigating away from a run', async () => {
  const page = await browser.newPage()
  try {
    await page.clock.install()
    await page.goto(viewer.url + '/#suite=0&run=0&step=0')
    await page.getByRole('button', { name: 'Play captured steps', exact: true }).click()
    await page.locator('[data-suite="1"]').click()
    await page.getByRole('heading', { name: 'No matching flows' }).waitFor()
    await page.clock.fastForward(5000)
    expect(new URL(page.url()).hash).toBe('#suite=1')
    expect(await page.locator('.flow-link').count()).toBe(0)
  } finally {
    await page.close()
  }
})

it('recovers from a failed result request through the retry control', async () => {
  const page = await browser.newPage()
  try {
    await page.route('**/api/suites/0', (route) => route.fulfill({ status: 500 }))
    await page.goto(viewer.url)
    await page.getByRole('heading', { name: 'Unable to open saved results' }).waitFor()
    await page.unroute('**/api/suites/0')
    await page.getByRole('button', { name: 'Try again', exact: true }).click()
    await page.getByRole('heading', { name: /Recorded flows/ }).waitFor()
    expect(await page.locator('.flow-link').count()).toBe(4)
  } finally {
    await page.close()
  }
})

it('renders the observed graph, supports zoom, and opens exact recorded evidence', async () => {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1120 } })
  page.setDefaultTimeout(5000)
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  try {
    await page.goto(viewer.url)
    await page.getByRole('link', { name: 'Action graph', exact: true }).click()
    await page.locator('.react-flow__node').first().waitFor()
    expect(await page.locator('.react-flow__node').count()).toBe(2)
    expect(await page.locator('.react-flow__minimap-node').count()).toBe(2)
    expect(await page.locator('.react-flow__edge').count()).toBe(1)
    await page.locator('.react-flow__edge-path').first().waitFor({ state: 'attached' })
    const viewport = page.locator('.react-flow__viewport')
    const before = await viewport.getAttribute('style')
    await page.getByRole('button', { name: /^zoom in$/i }).click()
    await page.waitForFunction(
      (previous) =>
        document.querySelector('.react-flow__viewport')?.getAttribute('style') !== previous,
      before,
    )
    await page.getByLabel('Select observed state', { exact: true }).selectOption('1')
    expect(await page.locator('.react-flow__node.selected').count()).toBe(1)
    await page.getByRole('button', { name: 'flow-failed · step 1 failed', exact: false }).click()
    await page.locator('.check .failed').waitFor()
    expect(new URL(page.url()).hash).toContain('run=1&step=1')
    await page.goBack()
    await page.locator('.react-flow__node').first().waitFor()
    await page.reload()
    await page.locator('.react-flow__node').first().waitFor()
    expect(errors).toEqual([])
  } finally {
    await page.close()
  }
})

it('shows discovery limits, cycles, parallel actions, empty graphs, and escaped labels', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.goto(viewer.url + '/#suite=3&view=graph')
    await page.locator('.react-flow__edge-path').first().waitFor({ state: 'attached' })
    expect(await page.locator('.react-flow__edge').count()).toBe(4)
    const paths = await page
      .locator('.react-flow__edge-path')
      .evaluateAll((items) => items.map((item) => item.getAttribute('d')))
    expect(new Set(paths).size).toBe(4)
    expect(paths.every((path) => path && !path.includes('NaN'))).toBe(true)
    expect(await page.locator('main').innerText()).toContain('State limit reached')
    expect(await page.locator('main').innerText()).toContain('1 discovery error(s)')
    expect(await page.evaluate(() => 'viewerInjected' in window)).toBe(false)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.getByLabel('Select observed state', { exact: true }).selectOption('0')
    expect(await page.locator('.graph-inspector pre').innerText()).toBe(attack)
    await page.getByRole('button', { name: 'Second route', exact: true }).click()
    await page.getByRole('heading', { name: 'Recorded action' }).waitFor()
    await page.getByRole('button', { name: 'Inspect destination state' }).click()
    expect(await page.locator('.graph-inspector pre').innerText()).toBe('Destination')
    await page.goto(viewer.url + '/#suite=1&view=graph')
    await page.getByRole('heading', { name: 'No observed states' }).waitFor()
  } finally {
    await page.close()
  }
})

it('rejects invalid summaries before listening', async () => {
  const invalid = join(root, 'invalid')
  await mkdir(invalid)
  await writeFile(join(invalid, 'summary.json'), JSON.stringify({ runs: [{ status: 'passed' }] }))
  await expect(startViewer({ directories: [invalid], port: 0 })).rejects.toThrow(
    'Invalid JevTest summary',
  )
})

it('rejects discovery graphs with dangling edges, duplicate states, or an escaped file', async () => {
  const directory = join(root, 'invalid-graph')
  await mkdir(directory)
  const file = join(directory, 'graph.json')
  const node = { id: 'a', url: '/', text: 'State' }
  await writeFile(
    file,
    JSON.stringify({
      nodes: [node],
      edges: [{ from: 'a', to: 'missing', action: { id: 'go', label: 'Go', kind: 'click' } }],
    }),
  )
  await expect(startViewer({ directories: [directory], port: 0 })).rejects.toThrow(
    'missing transition endpoints',
  )
  await writeFile(file, JSON.stringify({ nodes: [node, node], edges: [] }))
  await expect(startViewer({ directories: [directory], port: 0 })).rejects.toThrow(
    'duplicate states',
  )
  const escaped = join(root, 'escaped-graph')
  await mkdir(escaped)
  await symlink(directory, join(escaped, 'graph.json'), 'junction')
  await expect(startViewer({ directories: [escaped], port: 0 })).rejects.toThrow(
    'Graph must stay inside',
  )
})

it('paginates larger suites and refreshes edited saved results', async () => {
  const page = await browser.newPage()
  const summaryPath = join(root, 'paginated', 'summary.json')
  const original = await readFile(summaryPath, 'utf8')
  try {
    await page.goto(viewer.url + '/#suite=2')
    await page.getByRole('heading', { name: /Recorded flows/ }).waitFor()
    expect(await page.locator('.flow-link').count()).toBe(15)
    await page.getByRole('button', { name: 'Next page', exact: true }).click()
    expect(await page.locator('.flow-link').count()).toBe(3)
    const summary = JSON.parse(original)
    summary.runs = summary.runs.slice(0, 1)
    await writeFile(summaryPath, JSON.stringify(summary))
    await page.getByRole('button', { name: 'Refresh results ↻', exact: true }).click()
    await page.getByRole('heading', { name: 'Recorded flows / 1', exact: true }).waitFor()
    expect(await page.locator('.flow-link').count()).toBe(1)
    expect(await page.getByRole('button', { name: 'Next page', exact: true }).isDisabled()).toBe(
      true,
    )
    expect(await page.locator('.stat b').allTextContents()).toEqual(['1', '0', '0', '0'])
  } finally {
    await writeFile(summaryPath, original)
    await page.close()
  }
})
