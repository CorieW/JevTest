#!/usr/bin/env node
// CLI loads trusted project code and runs, discovers, or replays local test flows.
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import type { Project, RunResult } from './types.js'
import { JevPolicy, TokenBudget, TraversalPolicy } from './jev.js'
import { runSuite } from './runner.js'
import { replay } from './replay.js'
import { crawl, toDot } from './graph.js'
import { writeReport } from './report.js'
import { errorMessage, positiveInteger } from './util.js'
import { findConfig } from './config.js'
import { initialize } from './init.js'

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      output: { type: 'string' },
      policy: { type: 'string', default: 'jev' },
      flow: { type: 'string' },
      trace: { type: 'string' },
      'max-tokens': { type: 'string', default: '250000' },
      'max-requests': { type: 'string', default: '100' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  const command = positionals[0] ?? 'help'
  if (values.help || command === 'help') {
    console.log(
      `JevTest — bounded exploratory testing\n\n  jevtest init\n  jevtest run --config project.config.ts [--policy jev|baseline] [--flow id]\n  jevtest discover --config project.config.ts --flow id\n  jevtest replay --config project.config.ts --trace path/to/trace.json\n\nOptions: --output directory --max-tokens 250000 --max-requests 100\nNode 24 loads erasable TypeScript configs. Config files are trusted executable code.\nSet TYPESAFE_API_KEY for Jev. Replay, discovery and baseline do not use the API.`,
    )
    return
  }
  if (command === 'init') {
    console.log(
      `Created integration: ${(await initialize()).join(', ')}\nBuild JevTest, then edit jevtest/flows.ts and the unfinished checks before running.`,
    )
    return
  }
  if (!['run', 'discover', 'replay'].includes(command))
    throw new Error(`Unknown command: ${command}`)
  const project = (await import(pathToFileURL(await findConfig(values.config)).href))
    .default as Project
  if (!project?.adapter || !Array.isArray(project.flows))
    throw new Error('Config must export default { adapter, flows }')
  const output = resolve(values.output ?? project.outputDir ?? 'artifacts/run')
  if (command === 'replay') {
    if (!values.trace) throw new Error('Replay requires --trace')
    const trace = JSON.parse(await readFile(resolve(values.trace), 'utf8')) as RunResult
    if (trace.version !== 1 || !trace.flow || !Array.isArray(trace.steps))
      throw new Error('Unsupported trace format')
    // Config is the authority for reset data and target URL, not an edited trace file.
    const flow = project.flows.find((f) => f.id === trace.flow.id)
    if (!flow || JSON.stringify(flow) !== JSON.stringify(trace.flow))
      throw new Error('Trace flow does not match this config')
    const result = await replay(
      trace,
      project.adapter,
      output,
      project.limits?.timeoutMs,
      project.limits?.cleanupTimeoutMs,
    )
    console.log(JSON.stringify(result, null, 2))
    process.exitCode = result.reproduced ? 0 : 1
    return
  }
  const flows = values.flow ? project.flows.filter((f) => f.id === values.flow) : project.flows
  if (!flows.length) throw new Error('No matching flows')
  if (command === 'discover') {
    if (flows.length !== 1) throw new Error('Discovery requires exactly one flow; use --flow')
    const graph = await crawl({
      adapter: project.adapter,
      flow: flows[0]!,
      cleanupTimeoutMs: project.limits?.cleanupTimeoutMs,
    })
    await mkdir(output, { recursive: true })
    await writeFile(resolve(output, 'graph.json'), JSON.stringify(graph, null, 2))
    await writeFile(resolve(output, 'graph.dot'), toDot(graph))
    console.log(`${graph.nodes.length} states, ${graph.edges.length} edges. ${graph.stopped}`)
    process.exitCode = graph.errors.length ? 1 : 0
    return
  }
  if (!['jev', 'baseline'].includes(values.policy!))
    throw new Error('Policy must be jev or baseline')
  const budget = new TokenBudget(
    positiveInteger(Number(values['max-tokens']), 'max-tokens'),
    positiveInteger(Number(values['max-requests']), 'max-requests'),
  )
  const policy = values.policy === 'baseline' ? new TraversalPolicy() : new JevPolicy({ budget })
  const controller = new AbortController()
  const interrupt = () => controller.abort(new Error('Interrupted by user'))
  process.once('SIGINT', interrupt)
  try {
    const results = await runSuite({
      flows,
      adapter: project.adapter,
      policy,
      limits: project.limits,
      outputDir: output,
      signal: controller.signal,
    })
    const report = await writeReport(
      results,
      output,
      policy instanceof JevPolicy ? policy.budget.usage : undefined,
    )
    console.log(results.map((r) => `${r.status.padEnd(10)} ${r.flow.id}: ${r.reason}`).join('\n'))
    console.log(`Report: ${report}`)
    process.exitCode = results.some((r) => r.status !== 'passed') ? 1 : 0
  } finally {
    process.removeListener('SIGINT', interrupt)
  }
}
main().catch((error) => {
  console.error(errorMessage(error))
  process.exitCode = 2
})
