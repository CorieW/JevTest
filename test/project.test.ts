// Declarative projects must enforce exact checks and retain per-flow input isolation.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { checks, defineProject } from '../src/project.js'
import { validateProject } from '../src/config.js'
const server = createServer((request, response) =>
  response
    .writeHead(200, { 'Content-Type': 'text/html' })
    .end(
      `<input id="email"><button id="go">Confirm</button><script>document.querySelector('#go').onclick=()=>{document.body.insertAdjacentHTML('beforeend','<div id="done">Confirmed</div><div class="order"></div>${request.url === '/duplicate' ? '<div class="order"></div>' : ''}')}</script>`,
    ),
)
let url: string
beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})
afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
it('isolates inputs and detects duplicate records through declarative browser checks', async () => {
  const project = defineProject({
    baseUrl: url,
    ready: 'body',
    flows: ['healthy', 'duplicate'].map((id) => ({
      id,
      goal: 'Create exactly one order',
      path: `/${id}`,
      completeWhen: '#done',
      inputs: { '#email': [`${id}@example.test`] },
      checks: [
        checks.visible('#done'),
        checks.text('#done', 'Confirmed'),
        checks.count('.order', 1),
      ],
    })),
  })
  for (const flow of project.flows) {
    const session = await project.adapter.open(flow, `helper-${flow.id}`)
    try {
      expect((await session.check()).complete).toBe(false)
      const { actions } = await session.observe()
      const fill = actions.find((action) => action.kind === 'fill')!
      expect(fill.value).toBe(`${flow.id}@example.test`)
      await session.execute(fill)
      await session.execute(actions.find((action) => action.kind === 'click')!)
      const result = await session.check()
      expect(result.complete).toBe(true)
      expect(result.assertions.every((check) => check.passed)).toBe(flow.id === 'healthy')
      expect(result.assertions.at(-1)).toMatchObject({
        expected: 1,
        actual: flow.id === 'healthy' ? 1 : 2,
      })
    } finally {
      await session.close()
    }
  }
})
it('never treats unfinished checks or missing exact checks as a pass', async () => {
  const project = defineProject({
    baseUrl: url,
    flows: [
      { id: 'pending', goal: 'Unfinished', completeWhen: 'body', checks: [checks.pending()] },
    ],
  })
  const session = await project.adapter.open(project.flows[0]!, 'pending')
  try {
    expect((await session.check()).assertions[0]?.passed).toBe(false)
  } finally {
    await session.close()
  }
  expect(() =>
    defineProject({
      baseUrl: url,
      flows: [{ id: 'missing', goal: 'Missing', completeWhen: 'body', checks: [] }],
    }),
  ).toThrow('missing).checks')
})
it('reports invalid configuration fields and duplicate IDs before opening a browser', () => {
  const flow = { id: 'checkout', goal: 'Order', startUrl: url, successCriteria: ['One order'] }
  const adapter = {
    open: async () => {
      throw new Error('must not open')
    },
  }
  expect(() => validateProject({ flows: [flow], adapter })).not.toThrow()
  expect(() => validateProject({ flows: [flow, flow], adapter })).toThrow('duplicate flow ID')
  expect(() =>
    validateProject({ flows: [{ ...flow, startUrl: 'file:///tmp/app' }], adapter }),
  ).toThrow('checkout).startUrl')
  expect(() => validateProject({ flows: [{ ...flow, successCriteria: [] }], adapter })).toThrow(
    'successCriteria',
  )
  expect(() => validateProject({ flows: [flow], adapter, limits: { maxSteps: 0 } })).toThrow(
    'limits',
  )
  expect(() => validateProject({ flows: [flow], adapter: {} })).toThrow('adapter.open')
})
