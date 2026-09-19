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
  const story = join(root, 'story')
  const storyRun = { ...runs[0]!, directory: join(story, 'run-0') }
  await mkdir(storyRun.directory, { recursive: true })
  await writeFile(
    join(storyRun.directory, 'frame.png'),
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
      'base64',
    ),
  )
  await writeFile(join(storyRun.directory, 'initial.html'), '<h1>Snapshot frame</h1>')
  storyRun.initialEvidence = ['frame.png']
  storyRun.steps = Array.from({ length: 3 }, (_, index) => ({
    ...runs[0]!.steps[0]!,
    index: index + 1,
    action: {
      id: `action-${index}`,
      label: index === 1 ? 'Return to earlier state' : `Recorded action ${index + 1}`,
      kind: 'click' as const,
    },
    after: observed,
    evidence: index === 0 ? ['initial.html'] : index === 1 ? ['missing.png'] : ['frame.png'],
  }))
  await writeReport([storyRun], story, undefined, { policy: 'jev', title: 'Timelapse fixture' })
  const application = join(root, 'application')
  await writeReport(runs, application, undefined, { policy: 'jev', title: 'Whole app' })
  await writeFile(
    join(application, 'action-space.json'),
    JSON.stringify({
      nodes: [
        { id: 'before', url: observed.url, text: 'Start' },
        { id: 'after', url: observed.url, text: 'Payment complete' },
        { id: 'side', url: observed.url, text: 'Settings never visited by this flow' },
      ],
      edges: [
        { from: 'before', to: 'after', action: runs[0]!.steps[0]!.action },
        {
          from: 'before',
          to: 'side',
          action: { id: 'settings', label: 'Open settings', kind: 'click' },
        },
        { from: 'side', to: 'before', action: { id: 'return', label: 'Return', kind: 'click' } },
      ],
      frontier: [
        {
          from: 'side',
          action: { id: 'advanced', label: 'Advanced settings', kind: 'click' },
          flowId: 'admin',
        },
      ],
      complete: false,
      entryPoints: { requested: 2, opened: 2 },
      stopped: 'Depth limit reached',
      errors: [],
    }),
  )
  viewer = await startViewer({
    directories: [root, empty, paginated, discovery, story, application],
    port: 0,
  })
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
      .frameLocator('#capture iframe')
      .getByRole('heading', { name: 'Captured application' })
      .waitFor()
    expect(await page.evaluate(() => 'viewerInjected' in window)).toBe(false)
    expect(await page.locator('#capture iframe').getAttribute('sandbox')).toBe('')
    await page.getByRole('button', { name: 'Next →', exact: true }).click()
    await page.locator('.check .failed').waitFor()
    expect(await page.getByRole('button', { name: 'Screenshot', exact: true }).isDisabled()).toBe(
      true,
    )
    await page
      .frameLocator('#capture iframe')
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
    await page.getByRole('button', { name: 'Play timelapse', exact: true }).click()
    await page.waitForURL(/step=1/)
    await page.getByRole('button', { name: 'Play timelapse', exact: true }).waitFor()
    await page.goto(viewer.url + '/#suite=1')
    await page.getByRole('heading', { name: 'No matching flows' }).waitFor()
    expect(await page.locator('.stat b').allTextContents()).toEqual(['0', '0', '0', '0'])
    expect(await page.locator('main').innerText()).toContain('API usage not recorded')
  } finally {
    await page.close()
  }
})

it('shows a chronological image path and synchronizes timelapse, speed, pause, and scrubbing', async () => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  try {
    await page.clock.install()
    await page.goto(viewer.url + '/#suite=4&run=0&step=0')
    await page.getByRole('heading', { name: 'Recorded action path', exact: true }).waitFor()
    expect(await page.locator('.path-strip button').count()).toBe(4)
    await page
      .locator('.path-strip img')
      .first()
      .evaluate((image) => (image as HTMLImageElement).decode())
    expect(await page.locator('.path-strip').innerText()).toContain('Page snapshot recorded')
    await page.getByLabel('Timelapse speed').selectOption('2')
    await page.getByRole('button', { name: 'Play timelapse', exact: true }).click()
    await page.clock.fastForward(1200)
    await page.waitForURL(/step=1/)
    await page
      .frameLocator('#capture iframe')
      .getByRole('heading', { name: 'Snapshot frame' })
      .waitFor()
    expect(
      await page.locator('.path-strip button[aria-current="step"]').getAttribute('data-step'),
    ).toBe('1')
    await page.getByRole('button', { name: 'Pause timelapse', exact: true }).click()
    await page.clock.fastForward(5000)
    expect(new URL(page.url()).hash).toContain('step=1')
    await page.getByRole('slider', { name: 'Timelapse frame' }).fill('2')
    await page.waitForURL(/step=2/)
    await page.getByText('Screenshot unavailable', { exact: true }).waitFor()
    await page.getByRole('button', { name: 'View frame 3: Recorded action 3', exact: true }).click()
    await page.waitForURL(/step=3/)
    await page.getByRole('button', { name: 'Screenshot', exact: true }).click()
    await page.locator('#capture img').evaluate((image) => (image as HTMLImageElement).decode())
    await page.getByRole('button', { name: 'Play timelapse', exact: true }).click()
    await page.waitForURL(/step=0/)
    await page.getByRole('slider', { name: 'Timelapse frame' }).fill('2')
    await page.clock.fastForward(5000)
    expect(new URL(page.url()).hash).toContain('step=2')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await page.reload()
    await page.getByRole('slider', { name: 'Timelapse frame' }).waitFor()
    expect(await page.getByRole('slider', { name: 'Timelapse frame' }).inputValue()).toBe('2')
  } finally {
    await page.close()
  }
})

it('cancels playback when navigating away from a run', async () => {
  const page = await browser.newPage()
  try {
    await page.clock.install()
    await page.goto(viewer.url + '/#suite=0&run=0&step=0')
    await page.getByRole('button', { name: 'Play timelapse', exact: true }).click()
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
    await page.getByText('flow-failed', { exact: true }).click()
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

it('overlays coverage on the application map and reserves route highlighting for flow pages', async () => {
  const page = await browser.newPage({ viewport: { width: 1680, height: 1120 } })
  page.setDefaultTimeout(5000)
  try {
    const suite = await (await fetch(viewer.url + '/api/suites/5')).json()
    expect(suite.graph.source).toBe('application')
    expect(suite.graph.nodes).toHaveLength(3)
    expect(suite.graph.edges).toHaveLength(3)
    expect(suite.graph.edges[0].references).toHaveLength(4)
    expect(await (await fetch(viewer.url + suite.downloads.graph)).json()).toEqual(suite.graph)
    await page.goto(viewer.url + '/#suite=5&view=graph')
    await page.locator('.react-flow__node').first().waitFor()
    const geometry = await page
      .locator('.react-flow__node')
      .evaluateAll((items) => items.map((item) => (item as HTMLElement).style.transform))
    const toggle = page.getByRole('checkbox', { name: 'Show flow coverage' })
    expect(await toggle.isChecked()).toBe(true)
    expect(await page.getByLabel('Graph flow', { exact: true }).count()).toBe(0)
    expect(await page.getByLabel('Application coverage').innerText()).toContain(
      '2/3 states visited · 1/3 transitions traversed · 4 distinct flows',
    )
    await page.locator('.react-flow__edge').first().waitFor({ state: 'attached' })
    expect(await page.locator('.react-flow__node').count()).toBe(3)
    expect(await page.locator('.react-flow__edge').count()).toBe(3)
    expect(await page.locator('.flow-path-edge').count()).toBe(0)
    expect(await page.locator('.coverage-visited').count()).toBe(2)
    expect(await page.locator('.coverage-unvisited').count()).toBe(1)
    await page.getByLabel('Select observed state').selectOption('0')
    expect(
      await page.getByRole('region', { name: 'Flow coverage', exact: true }).innerText(),
    ).toContain('4 flows explored this')
    expect(
      await page
        .getByRole('region', { name: 'Flow coverage', exact: true })
        .locator('summary')
        .allTextContents(),
    ).toEqual(['flow-passed', 'flow-failed', 'flow-incomplete', 'flow-error'])
    await page.getByRole('button', { name: 'Submit payment', exact: true }).click()
    expect(
      await page.getByRole('region', { name: 'Flow coverage', exact: true }).innerText(),
    ).toContain('4 flows explored this')
    await toggle.uncheck()
    expect(await page.getByRole('region', { name: 'Flow coverage', exact: true }).count()).toBe(0)
    expect(await page.getByLabel('Application coverage').count()).toBe(0)
    expect(await page.locator('.coverage-visited, .coverage-unvisited').count()).toBe(0)
    expect(await page.locator('.react-flow__edge-text').allTextContents()).not.toEqual(
      expect.arrayContaining([expect.stringContaining('flows')]),
    )
    expect(
      await page
        .locator('.react-flow__node')
        .evaluateAll((items) => items.map((item) => (item as HTMLElement).style.transform)),
    ).toEqual(geometry)
    await toggle.check()
    await page.getByLabel('Select observed state').selectOption('2')
    expect(
      await page.getByRole('region', { name: 'Flow coverage', exact: true }).innerText(),
    ).toContain('0 flows explored this')
    expect(await page.locator('.graph-inspector').innerText()).toContain('Advanced settings')
    expect(await page.locator('.graph-inspector').innerText()).toContain('destination unknown')
    await page.goto(viewer.url + '/#suite=5&run=1&step=0')
    await page.getByRole('heading', { name: 'Flow path in the application' }).waitFor()
    await page.locator('.flow-path-edge').waitFor({ state: 'attached' })
    expect(await page.locator('.react-flow__node').count()).toBe(3)
    expect(await page.locator('.flow-path-edge').count()).toBe(1)
    await page.locator('.react-flow__node[data-id="state-1"]').click()
    await page.waitForURL(/step=1/)
    await page.locator('.check .failed').waitFor()
    expect(
      await page.locator('.path-strip button[aria-current="step"]').getAttribute('data-step'),
    ).toBe('1')
    expect(
      await page
        .locator('.react-flow__node')
        .evaluateAll((items) => items.map((item) => (item as HTMLElement).style.transform)),
    ).toEqual(geometry)
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
