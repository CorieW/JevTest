// Read, redact, and normalize saved reports without executing the testing engine.
import { readFile, realpath } from 'node:fs/promises'
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path'
import type { RunResult, Usage } from '../../src/types.js'
import { observedState, stateChanges } from '../../src/evidence.js'
import { safeJson } from '../../src/util.js'
import type { ViewerSuite, EvidenceFile } from '../shared/types.js'
import { summarySchema } from './schema.js'
import { inside } from './paths.js'
import type { EvidenceRegistry } from './evidence.js'
import { observedGraph, readDiscovery } from './graph.js'
export async function readSuite(
  root: string,
  id: number,
  assets: EvidenceRegistry,
): Promise<ViewerSuite> {
  const source = resolve(root, 'summary.json')
  const summaryPath = await realpath(source).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined
    throw error
  })
  if (!summaryPath) return readDiscovery(root, id, assets)
  if (!inside(root, summaryPath)) throw new Error('Summary must stay inside its report directory.')
  const parsed = summarySchema.safeParse(JSON.parse(await readFile(source, 'utf8')))
  if (!parsed.success) throw new Error(`Invalid JevTest summary in ${root}`)
  const summary = parsed.data
  const runs = summary.runs as unknown as RunResult[]
  const expose = (file: string) => {
    if (!inside(root, file) || !['.html', '.png', '.json', '.dot'].includes(extname(file)))
      return undefined
    const url = `/evidence/${id}/${relative(root, file).split(sep).map(encodeURIComponent).join('/')}`
    assets.set(url, { root, file })
    return url
  }
  const fileFor = (run: RunResult, name: string) => {
    if (isAbsolute(name) || name.split(/[\\/]/).includes('..')) return undefined
    const original = resolve(run.directory, name)
    // Standard run folders remain usable after a report is copied to another machine.
    return expose(
      inside(root, original)
        ? original
        : resolve(root, basename(run.directory.replaceAll('\\', '/')), name),
    )
  }
  const totals = { passed: 0, failed: 0, incomplete: 0, error: 0 }
  for (const run of runs) totals[run.status]++
  return safeJson({
    graph: observedGraph(runs),
    id,
    name: summary.metadata?.title ?? `${basename(dirname(root))} / ${basename(root)}`,
    totals,
    policy: summary.metadata?.policy ?? 'not recorded',
    usage: summary.usage as Usage | undefined,
    startedAt: runs.map((run) => run.startedAt).sort()[0],
    downloads: {
      summary: expose(source),
      report: expose(resolve(root, 'report.html')),
      graph: expose(resolve(root, 'graph.json')),
    },
    runs: runs.map((run) => {
      const evidence = (files: string[]): EvidenceFile[] =>
        files.flatMap((name) => {
          const url = fileFor(run, name)
          return url && /\.(png|html)$/.test(name)
            ? [{ name: basename(name), url, type: name.endsWith('.png') ? 'image' : 'snapshot' }]
            : []
        })
      return {
        id: run.id,
        flow: run.flow,
        status: run.status,
        reason: run.reason,
        startedAt: run.startedAt,
        durationMs: run.durationMs,
        issues: run.issues,
        trace: fileFor(run, 'trace.json'),
        states: [
          {
            number: 0,
            title: 'Initial state',
            check: run.initialCheck,
            evidence: evidence(run.initialEvidence),
            observation: run.initial
              ? { url: run.initial.url, ...observedState(run.initial) }
              : undefined,
          },
          ...run.steps.map((step) => ({
            number: step.index,
            title: step.action.label,
            action: step.action,
            selection: step.selection,
            assessment: step.assessment,
            check: step.check,
            error: step.error,
            evidence: evidence(step.evidence),
            observation: step.after
              ? { url: step.after.url, ...observedState(step.after) }
              : undefined,
            changes: step.after ? stateChanges(step.before.data, step.after.data) : undefined,
          })),
        ],
      }
    }),
  })
}
