// Managed servers must be ready before use and cannot terminate a reused external server.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { expect, it } from 'vitest'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { resolve } from 'node:path'
import { startWebServer, reachable } from '../src/server.js'

async function port() {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const value = (server.address() as AddressInfo).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return value
}
async function fixture(script: string) {
  const directory = await mkdtemp(join(tmpdir(), 'jevtest-server-'))
  const file = join(directory, 'server.cjs')
  await writeFile(file, script)
  return { directory, command: `"${process.execPath}" "${file}"` }
}
it('starts an owned server, waits for readiness, and closes it idempotently', async () => {
  const address = await port()
  const app = await fixture(
    `require('node:http').createServer((q,s)=>s.end('ready')).listen(${address},'127.0.0.1')`,
  )
  const url = `http://127.0.0.1:${address}`
  let stop: (() => Promise<void>) | undefined
  try {
    stop = await startWebServer({ command: app.command, url, timeoutMs: 5000 })
    expect(await reachable(url)).toBe(true)
    await Promise.all([stop(), stop()])
    expect(await reachable(url)).toBe(false)
  } finally {
    await stop?.()
    await rm(app.directory, { recursive: true })
  }
})
it('requires explicit reuse and never stops an existing server', async () => {
  const server = createServer((q, s) => s.end('ready'))
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  try {
    await expect(startWebServer({ command: 'must-not-start', url })).rejects.toThrow(
      'already available',
    )
    const stop = await startWebServer({ command: 'must-not-start', url, reuseExistingServer: true })
    await stop()
    expect(await reachable(url)).toBe(true)
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()))
  }
})
it('the CLI closes its owned server even when the test adapter fails', async () => {
  const address = await port()
  const app = await fixture(
    `require('node:http').createServer((q,s)=>s.end('ready')).listen(${address},'127.0.0.1')`,
  )
  const url = `http://127.0.0.1:${address}`
  const config = join(app.directory, 'config.mjs')
  await writeFile(
    config,
    `export default {
    webServer: ${JSON.stringify({ command: app.command, url, timeoutMs: 5000 })},
    flows: [{ id: 'failure', goal: 'Test cleanup', startUrl: ${JSON.stringify(url)}, successCriteria: ['Must pass'] }],
    adapter: { open: async () => { throw new Error('expected adapter failure') } }
  }`,
  )
  try {
    await expect(
      promisify(execFile)(
        process.execPath,
        [
          '--import',
          import.meta.resolve('tsx'),
          resolve('src/cli.ts'),
          'run',
          '--config',
          config,
          '--policy',
          'baseline',
          '--output',
          join(app.directory, 'output'),
        ],
        { windowsHide: true },
      ),
    ).rejects.toMatchObject({ code: 1 })
    await expect(fetch(url)).rejects.toThrow()
  } finally {
    await rm(app.directory, { recursive: true })
  }
})
it('cleans up a server that stays unhealthy, exits, or is cancelled during startup', async () => {
  const address = await port()
  const app = await fixture(
    `require('node:http').createServer((q,s)=>{s.writeHead(503);s.end()}).listen(${address},'127.0.0.1')`,
  )
  const url = `http://127.0.0.1:${address}`
  try {
    await expect(startWebServer({ command: app.command, url, timeoutMs: 700 })).rejects.toThrow(
      'did not become ready',
    )
    await expect(fetch(url)).rejects.toThrow()
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('test cancellation')), 300)
    try {
      await expect(
        startWebServer({ command: app.command, url, timeoutMs: 5000 }, controller.signal),
      ).rejects.toThrow()
    } finally {
      clearTimeout(timer)
    }
    await expect(fetch(url)).rejects.toThrow()
    await writeFile(join(app.directory, 'server.cjs'), 'process.exit(7)')
    await expect(startWebServer({ command: app.command, url, timeoutMs: 5000 })).rejects.toThrow(
      'exited before readiness',
    )
  } finally {
    await rm(app.directory, { recursive: true })
  }
})
