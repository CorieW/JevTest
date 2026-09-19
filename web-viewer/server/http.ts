// Serve the read-only report API, frontend assets, and sandboxed evidence on loopback.
import { createServer } from 'node:http'
import { readFile, realpath } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { readSuite } from './suites.js'
import { readEvidence, evidencePolicy, type EvidenceRegistry } from './evidence.js'
export async function startViewer(options: { directories: string[]; port?: number }) {
  const port = options.port ?? 4310
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('Viewer port must be an integer from 0 to 65535.')
  if (!options.directories.length)
    throw new Error('Viewer requires a report directory containing summary.json.')
  const roots = await Promise.all(
    [...new Set(options.directories.map((path) => resolve(path)))].map((path) => realpath(path)),
  )
  const assets: EvidenceRegistry = new Map()
  const loadSuite = (root: string, id: number) => readSuite(root, id, assets)
  // Validate every requested directory before starting a listener.
  await Promise.all(roots.map(loadSuite))
  const assetRoot = fileURLToPath(
    new URL(
      import.meta.url.endsWith('.ts') ? '../../dist/web-viewer/public/' : './public/',
      import.meta.url,
    ),
  )
  const [viewerHtml, viewerScript, viewerStyles] = await Promise.all([
    readFile(resolve(assetRoot, 'index.html')),
    readFile(resolve(assetRoot, 'viewer.js')),
    readFile(resolve(assetRoot, 'viewer.css')),
  ]).catch(() => {
    throw new Error('Build the web-viewer first: pnpm web-viewer:build')
  })
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'no-store')
    const send = (status: number, type: string, body: string | Buffer) => {
      res.writeHead(status, { 'Content-Type': type }).end(body)
    }
    try {
      if (req.headers.host !== `127.0.0.1:${(server.address() as { port: number }).port}`)
        return send(403, 'text/plain', 'Use the loopback viewer URL.')
      if (req.method !== 'GET') return send(405, 'text/plain', 'This viewer is read-only.')
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/') {
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-src 'self'; base-uri 'none'; frame-ancestors 'none'",
        )
        return send(200, 'text/html; charset=utf-8', viewerHtml)
      }
      if (url.pathname === '/viewer.js')
        return send(200, 'text/javascript; charset=utf-8', viewerScript)
      if (url.pathname === '/viewer.css') return send(200, 'text/css; charset=utf-8', viewerStyles)
      if (url.pathname === '/favicon.ico') return send(204, 'image/x-icon', '')
      if (url.pathname === '/api/suites') {
        const suites = await Promise.all(roots.map(loadSuite))
        return send(
          200,
          'application/json',
          JSON.stringify(
            suites.map(({ runs, graph: _graph, ...suite }) => ({ ...suite, count: runs.length })),
          ),
        )
      }
      const match = /^\/api\/suites\/(\d+)$/.exec(url.pathname)
      if (match && roots[Number(match[1])])
        return send(
          200,
          'application/json',
          JSON.stringify(await loadSuite(roots[Number(match[1])]!, Number(match[1]))),
        )
      const asset = assets.get(url.pathname)
      if (asset) {
        const evidence = await readEvidence(asset)
        if (!evidence) return send(404, 'text/plain', 'Evidence is unavailable.')
        res.setHeader('Content-Security-Policy', evidencePolicy)
        return send(200, evidence.type, evidence.body)
      }
      send(404, 'text/plain', 'Not found')
    } catch {
      send(
        404,
        'text/plain',
        'Saved results or evidence could not be read. Check the report directory and refresh.',
      )
    }
  })
  await new Promise<void>((done, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.removeListener('error', reject)
      done()
    })
  })
  return {
    url: `http://127.0.0.1:${(server.address() as { port: number }).port}`,
    close: () =>
      new Promise<void>((done, reject) => {
        server.close((error) => (error ? reject(error) : done()))
        server.closeIdleConnections()
      }),
  }
}
