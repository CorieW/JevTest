// Reproducible end-to-end evaluation: bounded live spend, per-case checkpoints, paired scoring, and README tables.
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { platform, arch } from 'node:os'
import { benchmarks } from './catalog.js'
import { startBenchmark } from './host.js'
import { benchmarkProject, ReferencePolicy } from './adapter.js'
import { asFlow } from './contracts.js'
import type { Benchmark, Scenario } from './contracts.js'
import { scoreCase, summarize } from './score.js'
import type { CaseScore } from './score.js'
import { runFlow } from '../../src/runner.js'
import { replay } from '../../src/replay.js'
import { JevPolicy, TokenBudget } from '../../src/jev.js'
import { writeReport } from '../../src/report.js'
import type { RunResult, Usage } from '../../src/types.js'
import { positiveInteger } from '../../src/util.js'

const { values } = parseArgs({
  options: {
    app: { type: 'string', default: 'all' },
    mode: { type: 'string', default: 'reference' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '3' },
    'max-tokens': { type: 'string', default: '8800000' },
    'max-requests': { type: 'string', default: '6000' },
    'write-results': { type: 'boolean', default: false },
    'render-only': { type: 'boolean', default: false },
  },
})
if (!['reference', 'jev', 'both'].includes(values.mode!))
  throw new Error('Mode must be reference, jev, or both')
const chosen = benchmarks.filter((b) => values.app === 'all' || b.slug === values.app)
if (!chosen.length) throw new Error('App must be all, reservations, ledger, or taskboard')
const concurrency = positiveInteger(Number(values.concurrency), 'concurrency')
const maxTokens = positiveInteger(Number(values['max-tokens']), 'max-tokens')
if (maxTokens > 8_800_000) throw new Error('This evaluation command is capped at 8,800,000 tokens')
const budget = new TokenBudget(
  maxTokens,
  positiveInteger(Number(values['max-requests']), 'max-requests'),
)
const modes =
  values.mode === 'both' ? (['reference', 'jev'] as const) : [values.mode as 'reference' | 'jev']
const controller = new AbortController()
process.once('SIGINT', () => controller.abort(new Error('Evaluation interrupted')))
const startedAt = new Date().toISOString()
const root = resolve('artifacts', `benchmarks-${startedAt.replace(/[:.]/g, '-')}`)
await mkdir(root, { recursive: true })

function subset(cases: Scenario[]): Scenario[] {
  if (!values.limit) return cases
  const limit = positiveInteger(Number(values.limit), 'limit')
  if (limit % 8 !== 0)
    throw new Error('Limit must be divisible by 8 to preserve pairs across all four workflows')
  return [...new Set(cases.map((s) => s.workflow))].flatMap((workflow) =>
    cases.filter((s) => s.workflow === workflow).slice(0, limit / 4),
  )
}
async function digest(benchmark: Benchmark) {
  const hash = createHash('sha256')
  for (const file of [
    `examples/${benchmark.slug}/jevtest/config.ts`,
    `examples/${benchmark.slug}/jevtest/cases.ts`,
    `examples/${benchmark.slug}/jevtest/oracle.ts`,
    `examples/${benchmark.slug}/src/domain.ts`,
    `examples/${benchmark.slug}/src/service.ts`,
    `examples/${benchmark.slug}/src/view.ts`,
    'test/benchmarks/contracts.ts',
    'test/benchmarks/adapter.ts',
    'test/benchmarks/host.ts',
    'test/benchmarks/score.ts',
    'test/benchmarks/forms.ts',
    'test/benchmarks/ui.ts',
    'test/benchmarks/client.ts',
    'test/benchmarks/repository.ts',
    'src/jev.ts',
    'src/evidence.ts',
    'src/types.ts',
    'src/replay.ts',
    'src/runner.ts',
    'src/browser.ts',
  ]) {
    hash.update(file)
    hash.update(await readFile(file))
  }
  return hash.digest('hex')
}
export interface Evaluation {
  version: 1
  app: string
  mode: 'reference' | 'jev'
  startedAt: string
  finishedAt: string
  suiteDigest: string
  environment: { node: string; os: string; architecture: string }
  configuration: {
    maxSteps: number
    concurrency: number
    assessmentConfidence: number
    tokenBudget: number
    requestBudget: number
    cleanupTimeoutMs?: number
  }
  usage: Usage
  summary: ReturnType<typeof summarize>
  models: string[]
  evidence: string
  cases: CaseScore[]
}
async function updateReadme(benchmark: Benchmark) {
  const entries: Partial<Record<'reference' | 'jev', Evaluation>> = {}
  for (const mode of ['reference', 'jev'] as const) {
    try {
      entries[mode] = JSON.parse(
        await readFile(`examples/${benchmark.slug}/results/${mode}.json`, 'utf8'),
      ) as Evaluation
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
  const currentDigest = await digest(benchmark)
  for (const mode of ['reference', 'jev'] as const) {
    if (entries[mode]?.suiteDigest !== currentDigest) delete entries[mode]
  }
  const pct = (n: number | null) => (n === null ? 'N/A' : `${(n * 100).toFixed(1)}%`)
  const field = (mode: 'reference' | 'jev', fn: (e: Evaluation) => string | number) =>
    entries[mode] ? fn(entries[mode]!) : 'Not run for this revision'
  const lines = [
    '## Evaluation results',
    '',
    '| Metric | Reference route | Jev |',
    '| --- | --- | --- |',
    `| Evaluated flows | ${field('reference', (e) => e.summary.flows)} | ${field('jev', (e) => e.summary.flows)} |`,
    ...(
      [
        [
          'Healthy flows passed',
          (e: Evaluation) => `${e.summary.healthyCompleted}/${e.summary.healthy}`,
        ],
        ['Faulty flows exercised', (e: Evaluation) => `${e.summary.exposed}/${e.summary.faulty}`],
        [
          'Combined detected / faulty flows',
          (e: Evaluation) => `${e.summary.combined.truePositives}/${e.summary.faulty}`,
        ],
        ['Combined recall', (e: Evaluation) => pct(e.summary.combined.recall)],
        ['Combined healthy false alarms', (e: Evaluation) => e.summary.combined.falsePositives],
        [
          'Unclassified healthy flows',
          (e: Evaluation) => e.summary.combined.unclassifiedHealthy ?? 'Not recorded',
        ],
        ['Combined precision', (e: Evaluation) => pct(e.summary.combined.precision)],
        [
          'Incomplete / infrastructure errors',
          (e: Evaluation) => `${e.summary.incomplete} / ${e.summary.errors}`,
        ],
        ['Reproduced traces', (e: Evaluation) => `${e.summary.replayed}/${e.summary.flows}`],
        [
          'Replay cleanup failures',
          (e: Evaluation) =>
            e.cases.filter((c) => !c.reproduced && c.replayReason.includes('; cleanup:')).length,
        ],
        [
          'Replay state/action/assertion divergence',
          (e: Evaluation) =>
            e.cases.filter(
              (c) => !c.reproduced && /diverged|Action changed|no longer/.test(c.replayReason),
            ).length,
        ],
        [
          'Other unreplayable traces',
          (e: Evaluation) =>
            e.cases.filter(
              (c) =>
                !c.reproduced &&
                !c.replayReason.includes('; cleanup:') &&
                !/diverged|Action changed|no longer/.test(c.replayReason),
            ).length,
        ],
        ['API requests', (e: Evaluation) => e.usage.requests],
        [
          'Reported input + output tokens',
          (e: Evaluation) =>
            `${e.usage.inputTokens.toLocaleString('en-US')} + ${e.usage.outputTokens.toLocaleString('en-US')}`,
        ],
        ['Budget-charged tokens', (e: Evaluation) => e.usage.chargedTokens.toLocaleString('en-US')],
      ] as const
    ).map(([name, fn]) => `| ${name} | ${field('reference', fn)} | ${field('jev', fn)} |`),
    '',
  ]
  const live = entries.jev
  if (live) {
    const unfinished = new Map<string, CaseScore[]>()
    for (const row of live.cases.filter((c) => c.status === 'error' || c.status === 'incomplete')) {
      const reason = `${row.workflow}: ${row.reason}`
      unfinished.set(reason, [...(unfinished.get(reason) ?? []), row])
    }
    lines.push(
      `Live run: **${live.startedAt}**; resolved model: **${live.models.join(', ') || 'unavailable'}**.`,
      '',
      `Model-only recall: **${pct(live.summary.model.recall)}** (${live.summary.model.truePositives}/${live.summary.faulty}); precision: **${pct(live.summary.model.precision)}**; healthy false alarms: **${live.summary.model.falsePositives}/${live.summary.healthy}**.`,
      '',
      `Recall among exercised faults: **${pct(live.summary.model.exposedRecall)}**. Uncertain assessments: **${live.summary.uncertainAssessments}**. Assessment errors: **${live.summary.assessmentErrors}**. Runs with model warnings before any fault was exercised: **${live.summary.unexposedModelWarnings}** (not credited as detections).`,
      '',
      '| Planted fault | Exercised / cases | Model detections | Combined detections |',
      '| --- | --- | --- | --- |',
      ...live.summary.byFault.map(
        (f) =>
          `| ${f.fault} | ${f.exposed}/${f.total} | ${f.modelDetected}/${f.total} | ${f.combinedDetected}/${f.total} |`,
      ),
      '',
      `Missed by the model: ${live.cases.filter((c) => c.fault && !c.modelDetected).length} cases; inspect the per-case actions, judgments, and failed assertions in [Jev results](results/jev.json).`,
      '',
      ...Array.from(
        unfinished,
        ([reason, cases]) =>
          `- ${cases.length} unfinished case(s), ${reason}. Example: \`${cases[0]!.id}\`.`,
      ),
      '',
      `Replay cleanup failures mean the browser did not close within the configured ${live.configuration.cleanupTimeoutMs ?? 5000} ms allowance; they remain failed replays even when application states and assertions matched. These failures are separate from state divergence and detection misses. Parallel browser startup/shutdown can affect this metric.`,
      '',
      `Source/runner digest: \`${live.suiteDigest}\`. Environment: ${live.environment.os}/${live.environment.architecture}, Node ${live.environment.node}. Full local evidence: \`${live.evidence}\`.`,
      '',
    )
  }
  lines.push(
    'The reference route is an oracle/fixture sanity check with known action sequences, not an autonomous baseline. Jev receives multiple action choices and must select the route and fixture. Combined detection includes deterministic assertions; it must not be presented as model-only accuracy.',
    '',
    'Faulty cases that abort or never exercise the mutation remain misses in end-to-end recall. Reproduction measures the exact observed trace, including incomplete prefixes, and does not establish that model judgments are correct. This is one deterministic, synthetic, parameterized run without statistical confidence intervals; it does not establish real-world bug recall.',
    '',
    '**Reproduction:** `pnpm benchmark --app ' +
      benchmark.slug +
      ' --mode both --write-results`. Requires `TYPESAFE_API_KEY` for the Jev phase. Full runs overwrite only the generated results section and sanitized result JSON; partial pilot runs cannot overwrite published results.',
    '',
  )
  const filename = `examples/${benchmark.slug}/README.md`
  const original = await readFile(filename, 'utf8')
  await writeFile(
    filename,
    original.replace(
      /<!-- evaluation:start -->[\s\S]*?<!-- evaluation:end -->/,
      `<!-- evaluation:start -->\n${lines.join('\n')}<!-- evaluation:end -->`,
    ),
  )
}

for (const benchmark of chosen) {
  if (values['render-only']) {
    await updateReadme(benchmark)
    continue
  }
  if (controller.signal.aborted) break
  const scenarios = subset(benchmark.cases)
  if (values['write-results'] && scenarios.length !== benchmark.cases.length)
    throw new Error('Only complete suites may replace README results')
  const host = await startBenchmark(benchmark)
  try {
    const project = benchmarkProject(benchmark, host)
    for (const mode of modes) {
      const outputDir = resolve(root, benchmark.slug, mode)
      await mkdir(outputDir, { recursive: true })
      const before = { ...budget.usage }
      const policy = mode === 'jev' ? new JevPolicy({ budget }) : new ReferencePolicy(benchmark)
      const records: RunResult[] = new Array(scenarios.length)
      const scores: CaseScore[] = new Array(scenarios.length)
      let cursor = 0
      let done = 0
      const runStartedAt = new Date().toISOString()
      await Promise.all(
        Array.from({ length: Math.min(concurrency, scenarios.length) }, async () => {
          while (cursor < scenarios.length) {
            const index = cursor++
            const scenario = scenarios[index]!
            const result = await runFlow({
              flow: asFlow(scenario, host.url),
              adapter: project.adapter,
              policy,
              limits: { maxSteps: 12, concurrency, maxRepetitions: 2, timeoutMs: 90_000 },
              outputDir,
              signal: controller.signal,
            })
            const reproduction = await replay(result, project.adapter, outputDir, 30_000)
            records[index] = result
            scores[index] = scoreCase(scenario, result, host.audit(result.id), reproduction)
            await appendFile(
              resolve(outputDir, 'cases.jsonl'),
              `${JSON.stringify(scores[index])}\n`,
            )
            done++
            if (done % 20 === 0 || done === scenarios.length)
              console.log(
                `${benchmark.slug}/${mode}: ${done}/${scenarios.length} | ${budget.usage.chargedTokens.toLocaleString('en-US')} tokens charged across this command`,
              )
          }
        }),
      )
      const usage = Object.fromEntries(
        Object.entries(budget.usage).map(([key, value]) => [
          key,
          value - before[key as keyof Usage],
        ]),
      ) as unknown as Usage
      const evaluation: Evaluation = {
        version: 1,
        app: benchmark.slug,
        mode,
        startedAt: runStartedAt,
        finishedAt: new Date().toISOString(),
        suiteDigest: await digest(benchmark),
        environment: { node: process.version, os: platform(), architecture: arch() },
        configuration: {
          maxSteps: 12,
          concurrency,
          assessmentConfidence: 0.6,
          tokenBudget: maxTokens,
          requestBudget: budget.maxRequests,
          cleanupTimeoutMs: 15_000,
        },
        usage,
        summary: summarize(scores),
        models: [
          ...new Set(scores.flatMap((r) => r.models).filter((s): s is string => Boolean(s))),
        ],
        evidence: relative(process.cwd(), outputDir).replace(/\\/g, '/'),
        cases: scores,
      }
      await writeFile(resolve(outputDir, 'evaluation.json'), JSON.stringify(evaluation, null, 2))
      await writeReport(records, outputDir, usage)
      if (values['write-results']) {
        const target = `examples/${benchmark.slug}/results`
        await mkdir(target, { recursive: true })
        await writeFile(`${target}/${mode}.json`, JSON.stringify(evaluation, null, 2) + '\n')
        await updateReadme(benchmark)
      }
      console.log(
        JSON.stringify({ app: benchmark.slug, mode, summary: evaluation.summary, usage }, null, 2),
      )
      // Measured misses/false alarms are results, not harness failures. Incomplete runs and errors remain visible.
      if (
        evaluation.summary.errors ||
        evaluation.summary.replayed < scenarios.length ||
        (mode === 'reference' &&
          (evaluation.summary.combined.falseNegatives ||
            evaluation.summary.combined.falsePositives))
      )
        process.exitCode = 1
    }
  } finally {
    await host.close()
  }
}
await writeFile(
  resolve(root, 'usage.json'),
  JSON.stringify({ startedAt, finishedAt: new Date().toISOString(), usage: budget.usage }, null, 2),
)
console.log(`Evaluation evidence: ${root}`)
