// Project discovery explores every configured context and preserves unresolved work at limits.
import { expect, it } from 'vitest'
import { crawl } from '../src/graph.js'
import type { Adapter, Flow, Action } from '../src/types.js'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
const flows: Flow[] = ['user', 'admin'].map((id) => ({
  id,
  startUrl: 'http://app.test',
  goal: 'Inspect app',
  successCriteria: ['Unused by discovery'],
}))
function app(fail = false) {
  const counts = { opened: 0, closed: 0 }
  const adapter: Adapter = {
    async open(flow) {
      counts.opened++
      let current = 'home'
      return {
        async observe() {
          const choices =
            current === 'home'
              ? ['left', 'right', ...(flow.id === 'admin' ? ['admin'] : [])]
              : current === 'right'
                ? ['home']
                : []
          return {
            fingerprint: current,
            url: `http://app.test/${current}`,
            text: current,
            data: null,
            errors: [],
            network: [],
            actions: choices.map((id): Action => ({ id, label: id, kind: 'click' })),
          }
        },
        async execute(action) {
          if (fail && action.id === 'admin') throw new Error('Admin unavailable')
          current = action.id
        },
        async check() {
          throw new Error('Discovery must not certify correctness')
        },
        async capture() {
          return []
        },
        async close() {
          counts.closed++
        },
      }
    },
  }
  return { adapter, counts }
}
it('unions all entry contexts, branches, and cycles without skipping context-specific actions', async () => {
  const { adapter, counts } = app()
  const graph = await crawl({ adapter, flows })
  expect(graph.nodes.map((node) => node.id).sort()).toEqual(['admin', 'home', 'left', 'right'])
  expect(graph.edges).toHaveLength(4)
  expect(graph.edges.some((edge) => edge.from === 'right' && edge.to === 'home')).toBe(true)
  expect(graph).toMatchObject({
    complete: true,
    frontier: [],
    errors: [],
    entryPoints: { requested: 2, opened: 2 },
  })
  expect(counts.closed).toBe(counts.opened)
})
it.each([{ maxDepth: 1 }, { maxStates: 1 }, { maxEdges: 1 }])(
  'keeps bounded discovery incomplete with visible unexplored actions: %j',
  async (limits) => {
    const { adapter, counts } = app()
    const graph = await crawl({ adapter, flows, ...limits })
    expect(graph.complete).toBe(false)
    expect(graph.frontier.length).toBeGreaterThan(0)
    expect(graph.stopped).toContain('limit')
    expect(counts.closed).toBe(counts.opened)
  },
)
it('the CLI saves all entry contexts and returns nonzero for a partial action space', async () => {
  await mkdir('artifacts/discovery-tests', { recursive: true })
  const root = await mkdtemp(resolve('artifacts/discovery-tests/project-'))
  const config = join(root, 'config.mjs')
  await writeFile(
    config,
    `// Deterministic CLI discovery fixture with two independent entry contexts.
export default { flows: ${JSON.stringify(flows)}, adapter: { async open(flow) {
let step = 0;
return { async observe() { return { fingerprint: flow.id + step, url: flow.startUrl, text: String(step), data: null, errors: [], network: [], actions: step ? [] : [{ id: 'next', label: 'Next', kind: 'custom' }] } }, async execute() { step++ }, async close() {}, async check() { throw new Error('No correctness checks during discovery') }, async capture() { return [] } }
} } }`,
  )
  const args = [
    '--import',
    import.meta.resolve('tsx'),
    resolve('src/cli.ts'),
    'discover',
    '--config',
    config,
    '--output',
    root,
  ]
  await promisify(execFile)(process.execPath, args, { windowsHide: true })
  const full = JSON.parse(await readFile(join(root, 'action-space.json'), 'utf8'))
  expect(full).toMatchObject({ complete: true, entryPoints: { requested: 2, opened: 2 } })
  expect(full.nodes).toHaveLength(4)
  expect(full.edges).toHaveLength(2)
  await expect(
    promisify(execFile)(process.execPath, [...args, '--max-states', '1'], { windowsHide: true }),
  ).rejects.toMatchObject({ code: 1 })
  expect(JSON.parse(await readFile(join(root, 'action-space.json'), 'utf8'))).toMatchObject({
    complete: false,
    entryPoints: { requested: 2, opened: 1 },
  })
})

it('retains failed actions and never marks cancellation complete', async () => {
  const { adapter, counts } = app(true)
  const graph = await crawl({ adapter, flows })
  expect(graph.complete).toBe(false)
  expect(graph.errors).toContain('Admin unavailable')
  expect(graph.frontier.some((item) => item.action.id === 'admin')).toBe(true)
  expect(counts.closed).toBe(counts.opened)
  const controller = new AbortController()
  controller.abort(new Error('Cancelled'))
  expect(await crawl({ adapter, flows, signal: controller.signal })).toMatchObject({
    complete: false,
    entryPoints: { opened: 0 },
    errors: ['Cancelled'],
  })
})
