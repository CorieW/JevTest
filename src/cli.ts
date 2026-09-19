#!/usr/bin/env node
// CLI loads trusted project code and runs, discovers, or replays local test flows.
import { parseArgs } from 'node:util'
import { resolve } from 'node:path'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import type { RunResult } from './types.js'
import { JevPolicy, TokenBudget, TraversalPolicy } from './jev.js'
import { runSuite } from './runner.js'
import { replay } from './replay.js'
import { crawl, toDot } from './graph.js'
import { writeReport } from './report.js'
import { errorMessage, positiveInteger } from './util.js'
import { findConfig, loadProject } from './config.js'
import { initialize } from './init.js'
import { startWebServer } from './server.js'
import { diagnose } from './doctor.js'
import { setupLocal } from './setup.js'
import { loadEnvironment } from './environment.js'

async function main() {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      config: { type: 'string' },
      'env-file': { type: 'string' },
      'skip-browser': { type: 'boolean' },
      output: { type: 'string' },
      port: { type: 'string' },
      title: { type: 'string' },
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
      `JevTest — bounded exploratory testing\n\n  jevtest setup [--skip-browser]\n  jevtest init\n  jevtest doctor [--policy baseline] [--config path]\n  jevtest run --config project.config.ts [--policy jev|baseline] [--flow id]\n  jevtest discover --config project.config.ts --flow id\n  jevtest view [report-directory ...] [--output artifacts/run] [--port 4310]\n  jevtest replay --config project.config.ts --trace path/to/trace.json\n\nOptions: --env-file .env.local --output directory --title "Suite name" --max-tokens 250000 --max-requests 100\nNode 24 loads erasable TypeScript configs. Config files are trusted executable code.\nSet TYPESAFE_API_KEY for Jev. Replay, discovery and baseline do not use the API.`,
    )
    return
  }
  if (command === 'init') {
    console.log(
      `Created integration: ${(await initialize()).join(', ')}\nBuild JevTest, then edit jevtest/flows.ts and the unfinished checks before running.`,
    )
    return
  }
  if (command === 'view') {
    const entry = new URL('../dist/web-viewer/command.js', import.meta.url)
    await access(entry).catch(() => {
      throw new Error('Build the web-viewer first: pnpm web-viewer:build')
    })
    const { runViewerCommand } = await import(entry.href)
    await runViewerCommand({
      directories: positionals.slice(1).length
        ? positionals.slice(1)
        : [values.output ?? 'artifacts/run'],
      port: values.port === undefined ? undefined : Number(values.port),
    })
    return
  }
  if (command === 'setup') {
    const controller = new AbortController()
    const interrupt = () => controller.abort(new Error('Interrupted by user'))
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    try {
      await setupLocal({
        skipBrowser: values['skip-browser'],
        signal: controller.signal,
        progress: console.log,
      })
    } finally {
      process.removeListener('SIGINT', interrupt)
      process.removeListener('SIGTERM', interrupt)
    }
    return
  }
  if (!['run', 'discover', 'replay', 'doctor'].includes(command))
    throw new Error(`Unknown command: ${command}`)
  await loadEnvironment(values['env-file'])
  if (command === 'doctor') {
    if (!['jev', 'baseline'].includes(values.policy!))
      throw new Error('Policy must be jev or baseline')
    const controller = new AbortController()
    const interrupt = () => controller.abort(new Error('Interrupted by user'))
    process.once('SIGINT', interrupt)
    process.once('SIGTERM', interrupt)
    try {
      const results = await diagnose({
        config: values.config,
        policy: values.policy as 'jev' | 'baseline',
        signal: controller.signal,
      })
      console.log(
        results
          .map(
            (result) =>
              `${result.ok ? 'OK' : 'FAIL'} ${result.name}: ${errorMessage(result.message)}`,
          )
          .join('\n'),
      )
      console.log('No model API calls were made. Doctor does not certify application correctness.')
      process.exitCode = results.every((result) => result.ok) ? 0 : 1
    } finally {
      process.removeListener('SIGINT', interrupt)
      process.removeListener('SIGTERM', interrupt)
    }
    return
  }
  const project = await loadProject(await findConfig(values.config))
  const controller = new AbortController()
  const interrupt = () => controller.abort(new Error('Interrupted by user'))
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', interrupt)
  let stop: (() => Promise<void>) | undefined
  try {
    if (command === 'run' && values.policy === 'jev' && project.setupIssues?.length)
      throw new Error(`Finish configuration before a live run: ${project.setupIssues.join('; ')}`)
    stop = await startWebServer(project.webServer, controller.signal)
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
        controller.signal,
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
        signal: controller.signal,
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
      { policy: values.policy, title: values.title },
    )
    console.log(results.map((r) => `${r.status.padEnd(10)} ${r.flow.id}: ${r.reason}`).join('\n'))
    console.log(`Report: ${report}`)
    process.exitCode = results.some((r) => r.status !== 'passed') ? 1 : 0
  } finally {
    try {
      await stop?.()
    } finally {
      try {
        await project.dispose?.()
      } finally {
        process.removeListener('SIGINT', interrupt)
        process.removeListener('SIGTERM', interrupt)
      }
    }
  }
}
main().catch((error) => {
  console.error(errorMessage(error))
  process.exitCode = 2
})
