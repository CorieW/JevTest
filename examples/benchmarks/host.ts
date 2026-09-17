// Loopback-only app host: fault labels and grader state are never embedded in pages or API responses.
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import type { Benchmark, Scenario, Screen, View } from './contracts.js'

export interface Audit {
  steps: number
  injectedAt: number | null
}
const escape = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
function content(view: View): string {
  return `<h1>${escape(view.title)}</h1><h2>${escape(view.screen.screen)}${view.screen.operation ? ` / ${escape(view.screen.operation)}` : ''}</h2><p role="status">${escape(view.screen.notice)}</p><pre>${escape(JSON.stringify(view.data, null, 2))}</pre><nav>${view.buttons.map((b) => `<button data-action="${escape(b.id)}">${escape(b.label)}</button>`).join('')}</nav>`
}
function page(view: View): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(view.title)}</title><style>
  body{background:#eef3f4;color:#172d35;font:16px system-ui;max-width:1000px;margin:40px auto;padding:20px}main{background:white;border-radius:16px;padding:30px}pre{background:#f1f5f7;border:1px solid #d7e3e9;padding:20px;white-space:pre-wrap}button{background:#165768;color:white;padding:14px;margin:6px;border:0;border-radius:8px;font:inherit;cursor:pointer}h2{text-transform:capitalize;font-size:20px;color:#536e78}button:disabled{opacity:.5}
  </style></head><body><small>JevTest / synthetic application</small><main id="app">${content(view)}</main><script>
  window.benchmarkView=${JSON.stringify(view).replace(/</g, '\\u003c')};window.benchmarkBusy=false;
  document.addEventListener('click',async event=>{const button=event.target.closest('button[data-action]');if(!button||window.benchmarkBusy)return;window.benchmarkBusy=true;button.disabled=true;
  try{const response=await fetch('/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:button.dataset.action})});const result=await response.json();if(!response.ok)throw Error(result.error||'Request failed');window.benchmarkView=result.view;document.getElementById('app').innerHTML=result.html;}
  catch(error){console.error(error.message);document.querySelector('[role=status]').textContent=error.message;}
  finally{window.benchmarkBusy=false;button.disabled=false;}});
  </script></body></html>`
}
export async function startBenchmark(benchmark: Benchmark, port = 0) {
  const cases = new Map(benchmark.cases.map((s) => [s.id, s]))
  const sessions = new Map<string, { scenario: Scenario; state: Screen }>()
  const audits = new Map<string, Audit>()
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const cookie = request.headers.cookie
        ?.split('; ')
        .find((c) => c.startsWith('benchmark-run='))
        ?.slice(14)
      const runId = cookie ?? randomUUID()
      response.setHeader('Cache-Control', 'no-store')
      response.setHeader('X-Content-Type-Options', 'nosniff')
      if (request.method === 'GET' && url.pathname === '/') {
        response.writeHead(200, { 'Content-Type': 'text/html' }).end(
          `<!doctype html><title>${escape(benchmark.title)}</title><h1>${escape(benchmark.title)}</h1><p>Synthetic data only. Choose a case to inspect:</p>${benchmark.cases
            .slice(0, 12)
            .map((s) => `<p><a href="/case/${s.id}">${escape(s.goal)}</a></p>`)
            .join('')}`,
        )
      } else if (request.method === 'GET' && url.pathname.startsWith('/case/')) {
        const scenario = cases.get(url.pathname.slice(6))
        if (!scenario) {
          response.writeHead(404).end('Unknown case')
          return
        }
        const state = benchmark.initial(scenario)
        sessions.set(runId, { scenario, state })
        audits.set(runId, { steps: 0, injectedAt: null })
        response.setHeader(
          'Set-Cookie',
          `benchmark-run=${runId}; HttpOnly; SameSite=Strict; Path=/`,
        )
        response
          .writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          .end(page(benchmark.view(state, scenario)))
      } else if (request.method === 'POST' && url.pathname === '/action') {
        const session = sessions.get(runId)
        if (!session) {
          response.writeHead(404).end('Unknown session')
          return
        }
        let body = ''
        for await (const chunk of request) {
          body += chunk
          if (body.length > 4096) {
            response.writeHead(413).end()
            return
          }
        }
        const { action } = JSON.parse(body) as { action: string }
        if (!benchmark.view(session.state, session.scenario).buttons.some((b) => b.id === action)) {
          response.writeHead(400).end(JSON.stringify({ error: 'Unavailable action' }))
          return
        }
        const transition = benchmark.reduce(session.state, action, session.scenario)
        session.state = transition.state
        const audit = audits.get(runId)!
        audit.steps++
        if (transition.injected && audit.injectedAt === null) audit.injectedAt = audit.steps
        const view = benchmark.view(session.state, session.scenario)
        response
          .writeHead(transition.status ?? 200, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ view, html: content(view) }))
      } else {
        response.writeHead(404).end('Not found')
      }
    } catch {
      response
        .writeHead(500, { 'Content-Type': 'application/json' })
        .end(JSON.stringify({ error: 'Fixture application error' }))
    }
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  return {
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    audit: (runId: string): Audit => audits.get(runId) ?? { steps: 0, injectedAt: null },
    release: (runId: string) => {
      sessions.delete(runId)
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
        server.closeIdleConnections()
      }),
  }
}
export type BenchmarkHost = Awaited<ReturnType<typeof startBenchmark>>
