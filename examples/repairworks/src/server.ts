// Loopback-only HTTP host with session-bound forms and serialized local persistence.
import { createServer } from 'node:http'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { AppError } from './domain.js'
import { openRepository } from './repository.js'
import { execute } from './service.js'
import { errorPage, loginPage, render } from './view.js'

interface Session {
  csrf: string
  staffId: string
  expires: number
}
async function readForm(request: IncomingMessage) {
  if (request.headers['content-type']?.split(';')[0] !== 'application/x-www-form-urlencoded')
    throw new AppError('Submit a URL-encoded form.', 415)
  const buffers: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    bytes += chunk.length
    if (bytes > 16_384) throw new AppError('The submitted form is too large.', 413)
    buffers.push(Buffer.from(chunk))
  }
  return new URLSearchParams(Buffer.concat(buffers).toString('utf8'))
}
export async function startRepairWorks(options: { port?: number; file?: string } = {}) {
  const repository = await openRepository(
    options.file ?? resolve('artifacts/repairworks/database.json'),
  )
  const sessions = new Map<string, Session>()
  let baseUrl = ''
  const server = createServer((request, response) => {
    void handle(request, response).catch((error) => {
      const status = error instanceof AppError ? error.status : 500
      response.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(
        errorPage(
          error instanceof AppError
            ? error.message
            : 'The request could not be saved. Please retry.',
          status,
        ),
      )
    })
  })
  async function handle(request: IncomingMessage, response: ServerResponse) {
    response.setHeader('Cache-Control', 'no-store')
    response.setHeader('X-Content-Type-Options', 'nosniff')
    response.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
    )
    if (request.headers.host !== new URL(baseUrl).host) throw new AppError('Unexpected host.', 400)
    const url = new URL(request.url ?? '/', baseUrl)
    if (url.pathname === '/health' && request.method === 'GET') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ status: 'ready', application: 'RepairWorks' }))
      return
    }
    if (!['GET', 'POST'].includes(request.method ?? ''))
      throw new AppError('Method not allowed.', 405)
    const now = Date.now()
    for (const [key, entry] of sessions) if (entry.expires < now) sessions.delete(key)
    let sessionId = /(?:^|;\s*)repairworks=([a-f0-9-]+)/.exec(request.headers.cookie ?? '')?.[1]
    let session = sessionId ? sessions.get(sessionId) : undefined
    if (!session) {
      if (sessions.size >= 1000) throw new AppError('Too many active sessions.', 503)
      sessionId = randomUUID()
      session = { csrf: randomUUID(), staffId: '', expires: now + 8 * 60 * 60 * 1000 }
      sessions.set(sessionId, session)
      response.setHeader(
        'Set-Cookie',
        `repairworks=${sessionId}; HttpOnly; SameSite=Strict; Path=/`,
      )
    }
    const redirect = (path: string) => {
      response.writeHead(303, { Location: path })
      response.end()
    }
    const db = repository.read()
    if (request.method === 'POST') {
      if (request.headers.origin !== baseUrl)
        throw new AppError('Form origin does not match this application.', 403)
      const form = await readForm(request)
      if (form.get('csrf') !== session.csrf)
        throw new AppError('This form session expired. Reload the page.', 403)
      if (url.pathname === '/session') {
        const staff = db.staff.find((item) => item.id === form.get('staffId') && item.active)
        if (!staff) throw new AppError('Choose an active demo account.', 403)
        session.staffId = staff.id
        redirect('/')
        return
      }
      if (!session.staffId) throw new AppError('Choose a demo account first.', 401)
      if (!url.pathname.startsWith('/actions/')) throw new AppError('Unknown action.', 404)
      const revision = form.get('revision')
      if (!revision || !/^\d+$/.test(revision))
        throw new AppError('A valid page revision is required.', 428)
      const destination = await repository.update(Number(revision), (draft) =>
        execute(draft, session!.staffId, url.pathname.slice('/actions/'.length), form),
      )
      redirect(`${destination}?saved=1`)
      return
    }
    if (url.pathname === '/session') {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      response.end(loginPage(db, session.csrf))
      return
    }
    const staff = db.staff.find((item) => item.id === session!.staffId && item.active)
    if (!staff) {
      redirect('/session')
      return
    }
    const html = render(db, staff, url, session.csrf)
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    response.end(html)
  }
  await new Promise<void>((done, reject) => {
    server.once('error', reject)
    server.listen(options.port ?? 4330, '127.0.0.1', () => {
      server.off('error', reject)
      done()
    })
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Could not determine local address')
  baseUrl = `http://127.0.0.1:${address.port}`
  let closing: Promise<void> | undefined
  return {
    url: baseUrl,
    close: () =>
      (closing ??= new Promise<void>((done, reject) => {
        server.close((error) => (error ? reject(error) : done()))
        server.closeIdleConnections()
      })),
  }
}
