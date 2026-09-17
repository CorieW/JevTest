// Compare measured outcomes with planted faults and replay every run without extra API calls.
import { writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { startShop } from '../src/server.js'
import { cases, shopProject } from './project.js'
import { JevPolicy, TokenBudget, TraversalPolicy } from '../../../src/jev.js'
import { runSuite } from '../../../src/runner.js'
import { replay } from '../../../src/replay.js'
import { writeReport } from '../../../src/report.js'
import { loadEnvironment } from '../../../src/environment.js'

const envIndex = process.argv.indexOf('--env-file')
if (
  envIndex !== -1 &&
  (!process.argv[envIndex + 1] || process.argv[envIndex + 1]!.startsWith('--'))
)
  throw new Error('--env-file requires a path')
await loadEnvironment(envIndex === -1 ? undefined : process.argv[envIndex + 1])
const live = process.argv.includes('--live')
const output = resolve(
  `artifacts/${live ? 'live' : 'baseline'}-${new Date().toISOString().replace(/[:.]/g, '-')}`,
)
const shop = await startShop()
try {
  const project = shopProject(shop.url)
  const budget = new TokenBudget(250_000, 80)
  const policy = live ? new JevPolicy({ budget }) : new TraversalPolicy()
  const results = await runSuite({
    flows: project.flows,
    adapter: project.adapter,
    policy,
    outputDir: output,
    limits: project.limits,
  })
  const replays = []
  for (const trace of results) replays.push(await replay(trace, project.adapter, output))
  const labeled = results.map((run) => ({
    id: run.flow.id,
    plantedBug: cases.find((c) => c.id === run.flow.id)!.bug !== 'none',
    status: run.status,
    candidate: run.issues.some((i) => i.source === 'model'),
    assertionFailure: run.issues.some((i) => i.source === 'assertion'),
  }))
  const healthy = labeled.filter((r) => !r.plantedBug)
  const buggy = labeled.filter((r) => r.plantedBug)
  const metrics = {
    policy: live ? 'jev' : 'baseline',
    flows: labeled.length,
    plantedBugs: buggy.length,
    detectedBugs: buggy.filter((r) => r.assertionFailure || r.candidate).length,
    missedBugs: buggy.filter((r) => !r.assertionFailure && !r.candidate).length,
    falseAlarms: healthy.filter((r) => r.status === 'failed' || r.candidate).length,
    healthyCompletionRate: healthy.filter((r) => r.status === 'passed').length / healthy.length,
    terminalRate:
      labeled.filter((r) => r.status === 'passed' || r.status === 'failed').length / labeled.length,
    reproducibilityRate: replays.filter((r) => r.reproduced).length / replays.length,
    modelCandidateBugs: buggy.filter((r) => r.candidate).length,
    modelFalseAlarms: healthy.filter((r) => r.candidate).length,
    usage: budget.usage,
    labeled,
    replays,
  }
  await mkdir(output, { recursive: true })
  await writeFile(resolve(output, 'metrics.json'), JSON.stringify(metrics, null, 2))
  const report = await writeReport(results, output, budget.usage)
  console.log(
    JSON.stringify({ ...metrics, labeled: undefined, replays: undefined, report }, null, 2),
  )
  // Planted failures are expected; infrastructure errors, misses, false alarms, and replay drift are not.
  process.exitCode =
    metrics.missedBugs ||
    metrics.falseAlarms ||
    metrics.healthyCompletionRate < 1 ||
    metrics.reproducibilityRate < 1 ||
    results.some((r) => r.status === 'error')
      ? 1
      : 0
} finally {
  await shop.close()
}
