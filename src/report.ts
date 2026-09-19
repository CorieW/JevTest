// Self-contained reports escape application-controlled content and preserve machine-readable evidence.
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import type { RunResult, Usage } from './types.js'
import { graphFromRuns, toDot } from './graph.js'
import { safeJson } from './util.js'

const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
export async function writeReport(
  results: RunResult[],
  outputDir: string,
  usage?: Usage,
  metadata?: { policy?: string; title?: string },
): Promise<string> {
  const directory = resolve(outputDir)
  await mkdir(directory, { recursive: true })
  const graph = graphFromRuns(results)
  const totals = { passed: 0, failed: 0, incomplete: 0, error: 0 }
  for (const result of results) totals[result.status]++
  await writeFile(
    resolve(directory, 'summary.json'),
    JSON.stringify(safeJson({ totals, usage, metadata, runs: results }), null, 2),
  )
  await writeFile(resolve(directory, 'graph.json'), JSON.stringify(graph, null, 2))
  await writeFile(resolve(directory, 'graph.dot'), toDot(graph))
  const link = (run: RunResult, name: string) =>
    escape(
      relative(directory, resolve(run.directory, name))
        .replace(/\\/g, '/')
        .split('/')
        .map(encodeURIComponent)
        .join('/'),
    )
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:;"><title>JevTest run report</title><style>
  :root{color-scheme:dark;font-family:system-ui,sans-serif;background:#10151a;color:#e8edf0}body{max-width:1100px;margin:48px auto;padding:0 24px}h1{font-size:42px;letter-spacing:-2px;margin-bottom:8px}h2{font-size:22px}p{color:#b0bec8;line-height:1.6}a{color:#76dcc0}header{border-bottom:1px solid #34404b;padding-bottom:24px}.stats{display:flex;flex-wrap:wrap;gap:14px;margin:28px 0}.stat,article{border:1px solid #34404b;background:#172027;border-radius:12px;padding:22px}.stat{flex:1;min-width:110px}.stat b{display:block;font-size:32px}.label{font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#76dcc0}article{margin:16px 0}.passed{color:#76dcc0}.failed,.error{color:#ff9898}.incomplete{color:#efce83}summary{cursor:pointer;padding:12px 0}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#10151a;padding:16px;border-radius:8px}li{margin:8px 0}code{font-size:13px}img{max-width:100%;border-radius:8px}.badge{font-size:13px;text-transform:uppercase;margin-left:12px}footer{margin:40px 0;color:#b0bec8}
  </style></head><body><header><span class="label">Exploratory testing / run evidence</span><h1>JevTest</h1><p>Deterministic outcomes. Reviewable model judgments. Replayable actions.</p></header>
  <div class="stats">${Object.entries(totals)
    .map(([key, value]) => `<div class="stat ${key}"><b>${value}</b>${key}</div>`)
    .join('')}</div>
  <p>${usage ? `${usage.requests} API requests · ${usage.inputTokens + usage.outputTokens} reported tokens · ${usage.chargedTokens} budget-charged tokens` : 'No API usage supplied.'} · ${graph.nodes.length} observed states · ${graph.edges.length} transitions</p>
  <p><a href="summary.json">JSON report</a> · <a href="graph.json">Action graph</a> · <a href="graph.dot">Graphviz graph</a></p>
  ${results
    .map(
      (
        run,
      ) => `<article><h2>${escape(run.flow.id)}<span class="badge ${run.status}">${run.status}</span></h2><p>${escape(run.flow.goal)}</p><p>${escape(run.reason)} · ${run.steps.length} steps · ${(run.durationMs / 1000).toFixed(1)}s</p><a href="${link(run, 'trace.json')}">Replay trace</a>
  ${run.issues.length ? `<ul>${run.issues.map((i) => `<li><b>${escape(i.source)}</b> / step ${i.step}: ${escape(i.message)}</li>`).join('')}</ul>` : ''}
  ${run.steps
    .map(
      (step) =>
        `<details><summary>${step.index}. ${escape(step.action.label)} — ${escape(step.assessment?.choice ?? 'not assessed')}</summary><pre>${escape(JSON.stringify({ action: step.action, selection: step.selection, assessment: step.assessment, check: step.check, errors: step.after?.errors, network: step.after?.network, error: step.error }, null, 2))}</pre>${step.evidence
          .filter((f) => f.endsWith('.png'))
          .map(
            (f) =>
              `<a href="${link(run, f)}"><img loading="lazy" alt="Observed page after step ${step.index}" src="${link(run, f)}"></a>`,
          )
          .join('')}</details>`,
    )
    .join('')}</article>`,
    )
    .join('')}
  <footer>Unexpected model judgments are candidate issues, not confirmed bugs. A pass requires deterministic assertions. Abort and exhausted limits remain incomplete.</footer></body></html>`
  const file = resolve(directory, 'report.html')
  await writeFile(file, html)
  return file
}
