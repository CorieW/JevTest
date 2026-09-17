// Start a trusted application command, wait for readiness, and stop only its owned process tree.
import { spawn, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import type { WebServer } from './types.js'
import { positiveInteger } from './util.js'

export async function reachable(
  url: string,
  timeoutMs = 1000,
  signal?: AbortSignal,
): Promise<boolean> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.any([AbortSignal.timeout(timeoutMs), ...(signal ? [signal] : [])]),
      redirect: 'manual',
    })
    await response.body?.cancel()
    return response.status >= 200 && response.status < 400
  } catch {
    return false
  }
}

export async function startWebServer(
  options?: WebServer,
  signal?: AbortSignal,
): Promise<() => Promise<void>> {
  if (!options) return async () => {}
  signal?.throwIfAborted()
  const timeout = positiveInteger(options.timeoutMs ?? 30_000, 'webServer.timeoutMs')
  if (!options.command?.trim())
    throw new Error('Config webServer.command: expected a start command')
  if (!['http:', 'https:'].includes(new URL(options.url).protocol))
    throw new Error('Config webServer.url: expected an HTTP(S) readiness URL')
  if (await reachable(options.url, Math.min(timeout, 1000), signal)) {
    if (!options.reuseExistingServer)
      throw new Error(
        'Readiness URL is already available. Set webServer.reuseExistingServer to reuse it explicitly.',
      )
    return async () => {}
  }
  signal?.throwIfAborted()
  const child = spawn(options.command, {
    shell: true,
    cwd: resolve(options.cwd ?? '.'),
    windowsHide: true,
    detached: process.platform !== 'win32',
    stdio: 'ignore',
  })
  let launchError: Error | undefined
  child.on('error', (error) => {
    launchError = error
  })
  let stopPromise: Promise<void> | undefined
  const stop = () =>
    (stopPromise ??= (async () => {
      if (!child.pid) return
      if (process.platform === 'win32') {
        try {
          await promisify(execFile)('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
            windowsHide: true,
          })
        } catch (error) {
          if (child.exitCode === null && child.signalCode === null) throw error
        }
      } else {
        const kill = (signal: NodeJS.Signals) => {
          try {
            process.kill(-child.pid!, signal)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error
          }
        }
        kill('SIGTERM')
        await delay(200)
        kill('SIGKILL')
      }
    })())
  const deadline = Date.now() + timeout
  try {
    while (Date.now() < deadline) {
      signal?.throwIfAborted()
      if (launchError) throw new Error(`Application server could not start: ${launchError.message}`)
      if (child.exitCode !== null || child.signalCode !== null)
        throw new Error(
          `Application server exited before readiness (code ${child.exitCode ?? child.signalCode}). Run its start command directly to inspect the error.`,
        )
      if (
        await reachable(options.url, Math.min(1000, Math.max(1, deadline - Date.now())), signal)
      ) {
        signal?.throwIfAborted()
        return stop
      }
      await delay(Math.min(100, Math.max(1, deadline - Date.now())), undefined, { signal })
    }
    throw new Error(
      `Application server did not become ready within ${timeout} ms. Check webServer.command and webServer.url.`,
    )
  } catch (error) {
    await stop()
    throw error
  }
}
