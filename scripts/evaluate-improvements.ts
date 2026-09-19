// Paired development/validation experiments with a durable, shared token ledger and immutable run evidence.
import { readFile, writeFile, mkdir, readdir, open, unlink } from 'node:fs/promises'
import { writeFileSync, renameSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { parseArgs } from 'node:util'
import { JevPolicy, TokenBudget } from '../src/jev.js'
import { runFlow } from '../src/runner.js'
import { replay } from '../src/replay.js'
import type { Policy, RunResult, Usage } from '../src/types.js'
import { benchmarks } from '../test/benchmarks/catalog.js'
import { startBenchmark } from '../test/benchmarks/host.js'
import { benchmarkProject, ReferencePolicy } from '../test/benchmarks/adapter.js'
import { asFlow } from '../test/benchmarks/contracts.js'
import { scoreCase, summarize } from '../test/benchmarks/score.js'
import { positiveInteger } from '../src/util.js'
import { loadEnvironment } from '../src/environment.js'

const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'assess' },
    'env-file': { type: 'string' },
    variants: { type: 'string', default: '0,1' },
    app: { type: 'string', default: 'all' },
    case: { type: 'string' },
    label: { type: 'string', default: 'development' },
    'max-tokens': { type: 'string', default: '200000' },
    'total-budget': { type: 'string', default: '2341984' },
    ledger: { type: 'string', default: 'artifacts/improvements/budget.json' },
    'policy-module': { type: 'string' },
    'runner-module': { type: 'string' },
    'trace-root': { type: 'string' },
  },
})
await loadEnvironment(values['env-file'])
if (!['assess', 'flows', 'cached', 'reference'].includes(values.mode!))
  throw new Error('Mode must be assess, flows, cached, or reference')
const variants = values.variants!.split(',').map(Number)
if (!variants.length || variants.some((v) => !Number.isInteger(v) || v < 0 || v >= 30))
  throw new Error('Variants must be comma-separated integers from 0 to 29')
const chosen = benchmarks.filter(
  (b) => values.app === 'all' || values.app!.split(',').includes(b.slug),
)
if (
  !chosen.length ||
  (values.app !== 'all' &&
    values.app!.split(',').some((slug) => !chosen.some((b) => b.slug === slug)))
)
  throw new Error('Unknown app')
if (
  values.case &&
  !chosen.some((b) => b.cases.some((c) => c.id === values.case && variants.includes(c.variant)))
)
  throw new Error('Case must belong to the selected apps and variants')
const allowance = positiveInteger(Number(values['max-tokens']), 'max-tokens')
const totalBudget = positiveInteger(Number(values['total-budget']), 'total-budget')
const ledgerPath = resolve(values.ledger!)
await mkdir(resolve(ledgerPath, '..'), { recursive: true })
const lock = await open(`${ledgerPath}.lock`, 'wx')
const controller = new AbortController()
process.once('SIGINT', () => controller.abort(new Error('Experiment interrupted')))
try {
  let previous: { ceiling: number; usage: Usage } | undefined
  try {
    previous = JSON.parse(await readFile(ledgerPath, 'utf8'))
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  if (previous && previous.ceiling !== totalBudget)
    throw new Error('Existing ledger ceiling cannot change')
  const spent = (previous?.usage.chargedTokens ?? 0) + (previous?.usage.reservedTokens ?? 0)
  class DurableBudget extends TokenBudget {
    checkpoint() {
      writeFileSync(
        `${ledgerPath}.tmp`,
        JSON.stringify({ ceiling: totalBudget, usage: this.usage }, null, 2),
      )
      renameSync(`${ledgerPath}.tmp`, ledgerPath)
    }
    override reserve(amount: number) {
      const release = super.reserve(amount)
      this.checkpoint()
      return () => {
        release()
        this.checkpoint()
      }
    }
  }
  const budget = new DurableBudget(Math.min(totalBudget, spent + allowance), 20_000)
  if (previous)
    Object.assign(budget.usage, previous.usage, { chargedTokens: spent, reservedTokens: 0 })
  budget.checkpoint()
  const before = { ...budget.usage }
  const PolicyClass = values['policy-module']
    ? ((await import(pathToFileURL(resolve(values['policy-module'])).href))
        .JevPolicy as typeof JevPolicy)
    : JevPolicy
  const policy: Policy | undefined = ['cached', 'reference'].includes(values.mode!)
    ? undefined
    : new PolicyClass({ budget })
  const executeFlow: typeof runFlow = values['runner-module']
    ? (await import(pathToFileURL(resolve(values['runner-module'])).href)).runFlow
    : runFlow
  const startedAt = new Date().toISOString()
  const root = resolve(
    'artifacts/improvements',
    `${values.label!.replace(/[^a-zA-Z0-9_-]/g, '_')}-${startedAt.replace(/[:.]/g, '-')}`,
  )
  await mkdir(root, { recursive: true })
  const hash = createHash('sha256')
  const sourceFiles = [
    ...['jev', 'evidence', 'runner', 'types', 'replay', 'browser'].map((name) => `src/${name}.ts`),
    ...chosen.flatMap((app) =>
      [
        'jevtest/config',
        'jevtest/fields',
        'jevtest/fixtures',
        'src/app',
        'src/ui',
        'jevtest/cases',
        'jevtest/oracle',
        'src/domain',
        'src/service',
        'src/view',
      ].map((name) => `examples/${app.slug}/${name}.ts`),
    ),
    'test/benchmarks/adapter.ts',
    'test/benchmarks/score.ts',
    ...['contracts', 'forms', 'host', 'ui', 'client', 'repository'].map(
      (name) => `test/benchmarks/${name}.ts`,
    ),
    ...(values['policy-module'] ? [values['policy-module']] : []),
    ...(values['runner-module'] ? [values['runner-module']] : []),
  ]
  for (const file of sourceFiles) {
    const source = await readFile(file, 'utf8')
    hash.update(file).update(source.replace(/\r\n/g, '\n'))
    // Preserve the exact implementation used in each experiment without putting it in Git.
    await writeFile(resolve(root, file.replace(/[\\/:]/g, '_')), source)
  }
  const results: unknown[] = []
  for (const benchmark of chosen) {
    if (controller.signal.aborted) break
    const scenarios = benchmark.cases.filter(
      (c) => variants.includes(c.variant) && (!values.case || c.id === values.case),
    )
    if (!scenarios.length) continue
    const output = resolve(root, benchmark.slug)
    await mkdir(output, { recursive: true })
    if (values.mode === 'cached') {
      const historical = JSON.parse(
        await readFile(`examples/${benchmark.slug}/results/jev.json`, 'utf8'),
      )
      const directories = await readdir(historical.evidence, { withFileTypes: true })
      const rows = []
      let host: Awaited<ReturnType<typeof startBenchmark>> | undefined
      try {
        for (const scenario of scenarios) {
          const directory = directories.find(
            (d) => d.isDirectory() && d.name.startsWith(`${scenario.id}-`),
          )!
          const trace: RunResult = JSON.parse(
            await readFile(resolve(historical.evidence, directory.name, 'trace.json'), 'utf8'),
          )
          host ??= await startBenchmark(benchmark, Number(new URL(trace.flow.startUrl).port))
          if (JSON.stringify(trace.flow) !== JSON.stringify(asFlow(scenario, host.url)))
            throw new Error('Cached flow differs from the current public flow')
          const project = benchmarkProject(benchmark, host)
          const reproduced = await replay(trace, project.adapter, output, 30_000)
          if (!reproduced.reproduced)
            throw new Error(`Cached baseline is not equivalent: ${reproduced.reason}`)
          rows.push(
            scoreCase(scenario, trace, host.audit(basename(reproduced.directory)), reproduced),
          )
        }
      } finally {
        await host?.close()
      }
      const summary = summarize(rows)
      results.push({
        app: benchmark.slug,
        summary,
        cases: rows,
        reusedModelJudgments: true,
        sourceEvaluation: `examples/${benchmark.slug}/results/jev.json`,
        sourceEvidence: historical.evidence,
      })
      console.log(JSON.stringify({ app: benchmark.slug, summary, reusedModelJudgments: true }))
    } else if (values.mode === 'assess') {
      // Rejudge frozen reference-route terminal transitions; this phase does not measure navigation.
      const reference = JSON.parse(
        await readFile(`examples/${benchmark.slug}/results/reference.json`, 'utf8'),
      )
      const referenceRoot = values['trace-root']
        ? resolve(values['trace-root'], benchmark.slug)
        : reference.evidence
      const directories = await readdir(referenceRoot, { withFileTypes: true })
      const rows = []
      for (const scenario of scenarios) {
        controller.signal.throwIfAborted()
        const directory = directories.find(
          (d) => d.isDirectory() && d.name.startsWith(`${scenario.id}-`),
        )!
        const trace: RunResult = JSON.parse(
          await readFile(resolve(referenceRoot, directory.name, 'trace.json'), 'utf8'),
        )
        const step = trace.steps.at(-1)!
        const assessment = await policy!.assess(
          { flow: trace.flow, current: step.after!, history: [] },
          step.action,
          step.before,
          controller.signal,
        )
        rows.push({
          id: scenario.id,
          workflow: scenario.workflow,
          variant: scenario.variant,
          fault: scenario.fault,
          assessment,
        })
        await writeFile(resolve(output, 'cases.json'), JSON.stringify(rows, null, 2))
      }
      const summary = {
        flows: rows.length,
        faulty: rows.filter((r) => r.fault).length,
        detected: rows.filter((r) => r.fault && r.assessment.choice === 'unexpected').length,
        healthyFalseAlarms: rows.filter((r) => !r.fault && r.assessment.choice === 'unexpected')
          .length,
        uncertain: rows.filter((r) => r.assessment.choice === 'uncertain').length,
      }
      results.push({ app: benchmark.slug, summary, cases: rows })
      console.log(JSON.stringify({ app: benchmark.slug, summary }))
    } else {
      const host = await startBenchmark(benchmark)
      try {
        const project = benchmarkProject(benchmark, host)
        const rows: ReturnType<typeof scoreCase>[] = new Array(scenarios.length)
        let cursor = 0
        let done = 0
        await Promise.all(
          Array.from({ length: 2 }, async () => {
            while (cursor < scenarios.length && !controller.signal.aborted) {
              const index = cursor++
              const scenario = scenarios[index]!
              const run = await executeFlow({
                flow: asFlow(scenario, host.url),
                adapter: project.adapter,
                policy: policy ?? new ReferencePolicy(benchmark),
                limits: { maxSteps: 12, maxRepetitions: 2, concurrency: 2, timeoutMs: 90_000 },
                outputDir: output,
                signal: controller.signal,
              })
              const reproduced = await replay(run, project.adapter, output, 30_000)
              rows[index] = scoreCase(scenario, run, host.audit(run.id), reproduced)
              done++
              await writeFile(
                resolve(output, `${scenario.id}.score.json`),
                JSON.stringify(rows[index], null, 2),
              )
              if (done % 8 === 0)
                console.log(
                  `${benchmark.slug}: ${done}/${scenarios.length}; cumulative experiment tokens ${budget.usage.chargedTokens}`,
                )
            }
          }),
        )
        const summary = summarize(rows.filter(Boolean))
        results.push({ app: benchmark.slug, summary, cases: rows.filter(Boolean) })
        console.log(JSON.stringify({ app: benchmark.slug, summary }))
      } finally {
        await host.close()
      }
    }
  }
  const usage = Object.fromEntries(
    Object.entries(budget.usage).map(([key, value]) => [key, value - before[key as keyof Usage]]),
  )
  await writeFile(
    resolve(root, 'evaluation.json'),
    JSON.stringify(
      {
        startedAt,
        finishedAt: new Date().toISOString(),
        mode: values.mode,
        label: values.label,
        variants,
        case: values.case ?? null,
        model: process.env.TYPESAFE_MODEL ?? 'jev-latest',
        sourceDigest: hash.digest('hex'),
        traceRoot: values['trace-root'] ?? null,
        policy: values['policy-module'] ?? 'src/jev.ts',
        runner: values['runner-module'] ?? 'src/runner.ts',
        configuration: {
          maxSteps: 12,
          maxRepetitions: 2,
          concurrency: 2,
          timeoutMs: 90_000,
          cleanupTimeoutMs: 15_000,
          assessmentConfidence: 0.6,
          tokenBudget: budget.maxTokens,
          requestBudget: budget.maxRequests,
        },
        usage,
        cumulativeUsage: budget.usage,
        results,
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ evidence: root, usage, cumulativeUsage: budget.usage }))
} finally {
  await lock.close()
  await unlink(`${ledgerPath}.lock`)
}
