// Loopback application server with durable sessions, validation, optimistic revisions, and idempotent commands.
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { resolve } from 'node:path'
import type { AddressInfo } from 'node:net'
import { z } from 'zod'
import type { Benchmark, View } from './contracts.js'
import { SessionRepository } from './repository.js'
import type { Reply, StoredSession } from './repository.js'
import { escape } from './ui.js'
import { clientScript, appStyles } from './client.js'
export interface Audit {
  steps: number
  injectedAt: number | null
}
const requestSchema = z
  .object({
    action: z.string().min(1).max(100),
    values: z.record(z.string().max(100), z.string().max(200)).default({}),
  })
  .strict()
export async function startBenchmark(
  benchmark: Benchmark,
  port = 0,
  options: { storageDir?: string } = {},
) {
  const cases = new Map(benchmark.cases.map((s) => [s.id, s]))
  const root = resolve('artifacts/example-sessions')
  mkdirSync(root, { recursive: true })
  const repository = new SessionRepository(
    options.storageDir ?? mkdtempSync(resolve(root, `${benchmark.slug}-`)),
  )
  const audits = new Map<string, Audit>(),
    browserRuns = new Set<string>()
  const render = (view: View) => benchmark.render(view)
  const reply = (session: StoredSession): Reply => {
    const view = benchmark.view(session.state, cases.get(session.scenarioId)!)
    return { view, html: render(view), revision: session.revision }
  }
  const page = (result: Reply) =>
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(result.view.title)}</title><style>${appStyles}</style></head><body><header><h1>${escape(result.view.title)}</h1><a href="/scenarios">Switch sample workspace</a></header><main id="app">${result.html}</main><script>window.benchmarkView=${JSON.stringify(result.view).replace(/</g, '\\u003c')};window.benchmarkRevision=${result.revision};${clientScript}</script></body></html>`
  const server = createServer(async (request, response) => {
    const json = (status: number, body: unknown) =>
      response
        .writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' })
        .end(JSON.stringify(body))
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const cookie = request.headers.cookie
        ?.split(';')
        .map((c) => c.trim())
        .find((c) => c.startsWith('benchmark-run='))
        ?.slice(14)
      const runId = cookie && /^[a-zA-Z0-9_-]{1,160}$/.test(cookie) ? cookie : randomUUID()
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('X-Content-Type-Options', 'nosniff')
      if (request.method === 'GET' && url.pathname === '/favicon.ico') {
        response.writeHead(204).end()
        return
      }
      if (request.method === 'GET' && url.pathname === '/') {
        response
          .writeHead(302, { Location: `/case/${benchmark.cases.find((c) => !c.fault)!.id}` })
          .end()
        return
      }
      if (request.method === 'GET' && url.pathname === '/scenarios') {
        response
          .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(
            `<!doctype html><html lang="en"><title>Sample workspaces</title><style>${appStyles}</style><main><h1>Sample workspaces</h1><p>Local synthetic records. Choose a task to inspect.</p>${benchmark.cases.map((s) => `<p><a href="/case/${s.id}">${escape(s.goal)}</a></p>`).join('')}</main></html>`,
          )
        return
      }
      if (request.method === 'GET' && url.pathname.startsWith('/case/')) {
        const scenario = cases.get(url.pathname.slice(6))
        if (!scenario) {
          json(404, { error: 'Workspace not found' })
          return
        }
        let session = repository.get(runId)
        if (!session || session.scenarioId !== scenario.id) {
          session = {
            scenarioId: scenario.id,
            state: benchmark.initial(scenario),
            revision: 0,
            receipts: [],
          }
          repository.save(runId, session)
          audits.set(runId, { steps: 0, injectedAt: null })
        }
        response.setHeader(
          'Set-Cookie',
          `benchmark-run=${runId}; HttpOnly; SameSite=Strict; Path=/`,
        )
        response
          .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(page(reply(session)))
        return
      }
      if (request.method === 'GET' && url.pathname === '/api/state') {
        const session = repository.get(runId)
        json(session ? 200 : 404, session ? reply(session) : { error: 'Workspace not found' })
        return
      }
      if (request.method !== 'POST' || url.pathname !== '/api/commands') {
        json(404, { error: 'Not found' })
        return
      }
      if (request.headers.origin && request.headers.origin !== `http://${request.headers.host}`) {
        json(403, { error: 'Cross-origin command rejected' })
        return
      }
      if (!request.headers['content-type']?.startsWith('application/json')) {
        json(415, { error: 'Use application/json' })
        return
      }
      let raw = ''
      for await (const chunk of request) {
        raw += chunk
        if (Buffer.byteLength(raw) > 8192) {
          json(413, { error: 'Request too large' })
          return
        }
      }
      let decoded: unknown
      try {
        decoded = JSON.parse(raw)
      } catch {
        json(400, { error: 'Invalid JSON' })
        return
      }
      const parsed = requestSchema.safeParse(decoded)
      if (!parsed.success) {
        json(400, { error: 'Invalid command payload' })
        return
      }
      const session = repository.get(runId)
      if (!session) {
        json(404, { error: 'Workspace not found' })
        return
      }
      const key = request.headers['idempotency-key'],
        revision = request.headers['if-match']
      if (
        typeof key !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,100}$/.test(key) ||
        typeof revision !== 'string' ||
        !/^\d+$/.test(revision)
      ) {
        json(428, { error: 'A revision and idempotency key are required' })
        return
      }
      const fingerprint = createHash('sha256').update(JSON.stringify(parsed.data)).digest('hex')
      const previous = session.receipts.find((r) => r.key === key)
      if (previous) {
        json(
          previous.fingerprint === fingerprint ? previous.status : 409,
          previous.fingerprint === fingerprint
            ? previous.body
            : { ...reply(session), error: 'Idempotency key reused with different input' },
        )
        return
      }
      if (Number(revision) !== session.revision) {
        json(409, {
          ...reply(session),
          error: 'This workspace changed. Review the refreshed records and try again.',
        })
        return
      }
      const scenario = cases.get(session.scenarioId)!
      if (
        !benchmark.view(session.state, scenario).buttons.some((b) => b.id === parsed.data.action)
      ) {
        json(409, { ...reply(session), error: 'That action is not available on this screen' })
        return
      }
      const transition = benchmark.reduce(
        session.state,
        parsed.data.action,
        scenario,
        parsed.data.values,
      )
      const next = { ...session, state: transition.state, revision: session.revision + 1 }
      const result = reply(next),
        status = transition.status ?? 200
      next.receipts = [...session.receipts, { key, fingerprint, status, body: result }].slice(-32)
      repository.save(runId, next)
      const audit = audits.get(runId) ?? { steps: 0, injectedAt: null }
      if (!browserRuns.has(runId)) audit.steps++
      if (transition.injected && audit.injectedAt === null) audit.injectedAt = audit.steps
      audits.set(runId, audit)
      json(status, result)
    } catch {
      json(500, { error: 'Unable to save the request. Reload before retrying.' })
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    storageDir: repository.directory,
    audit: (runId: string): Audit => audits.get(runId) ?? { steps: 0, injectedAt: null },
    trackBrowser: (runId: string) => {
      browserRuns.add(runId)
    },
    recordStep: (runId: string) => {
      const audit = audits.get(runId) ?? { steps: 0, injectedAt: null }
      audit.steps++
      audits.set(runId, audit)
    },
    release: (runId: string) => {
      repository.delete(runId)
      browserRuns.delete(runId)
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeIdleConnections()
      }),
  }
}
export type BenchmarkHost = Awaited<ReturnType<typeof startBenchmark>>
