// Diagnose local setup without model requests, preserving ownership of servers and config resources.
import { chromium } from 'playwright'
import { findConfig, loadProject } from './config.js'
import { reachable, startWebServer } from './server.js'
import { errorMessage } from './util.js'
import type { Project } from './types.js'

export interface Diagnostic {
  name: string
  ok: boolean
  message: string
}
export function nodeDiagnostic(version = process.versions.node): Diagnostic {
  return {
    name: 'Node',
    ok: Number(version.split('.')[0]) === 24,
    message:
      Number(version.split('.')[0]) === 24
        ? 'Node 24 is available.'
        : `Node 24 is required; found ${version}.`,
  }
}
export async function diagnose(
  options: {
    config?: string
    cwd?: string
    policy?: 'jev' | 'baseline'
    environment?: NodeJS.ProcessEnv
    signal?: AbortSignal
  } = {},
): Promise<Diagnostic[]> {
  const results: Diagnostic[] = [nodeDiagnostic()]
  const environment = options.environment ?? process.env
  const live = (options.policy ?? 'jev') === 'jev'
  results.push({
    name: 'Credentials',
    ok: !live || Boolean(environment.TYPESAFE_API_KEY?.trim()),
    message: !live
      ? 'Baseline mode needs no API key.'
      : environment.TYPESAFE_API_KEY?.trim()
        ? 'TYPESAFE_API_KEY is present; authentication was not tested.'
        : 'Set TYPESAFE_API_KEY or use --env-file .env.local. Baseline mode needs no key.',
  })
  try {
    const browser = await chromium.launch({ headless: true })
    await browser.close()
    results.push({ name: 'Chromium', ok: true, message: 'Browser launches successfully.' })
  } catch {
    results.push({
      name: 'Chromium',
      ok: false,
      message:
        'Chromium could not launch. Run pnpm browser:install; check Playwright system dependencies if it still fails.',
    })
  }
  let project: Project | undefined
  let stop: (() => Promise<void>) | undefined
  try {
    const file = await findConfig(options.config, options.cwd)
    project = await loadProject(file)
    results.push({
      name: 'Config',
      ok: true,
      message: `${project.flows.length} flow(s) loaded from ${file}.`,
    })
    for (const issue of project.setupIssues ?? [])
      results.push({ name: 'Unfinished check', ok: false, message: issue })
    stop = await startWebServer(project.webServer, options.signal)
    const targets = new Map(
      project.flows.map((flow) => [new URL(flow.startUrl).origin, flow.startUrl]),
    )
    for (const [origin, target] of targets) {
      options.signal?.throwIfAborted()
      const ok = await reachable(target, 3000, options.signal)
      results.push({
        name: 'Target',
        ok,
        message: ok
          ? `${origin} responds successfully.`
          : `${origin} is unavailable. Start the application or configure webServer.`,
      })
    }
  } catch (error) {
    results.push({ name: 'Project setup', ok: false, message: errorMessage(error) })
  } finally {
    try {
      await stop?.()
    } catch (error) {
      results.push({ name: 'Server cleanup', ok: false, message: errorMessage(error) })
    }
    try {
      await project?.dispose?.()
    } catch (error) {
      results.push({ name: 'Project cleanup', ok: false, message: errorMessage(error) })
    }
  }
  return results
}
