// Diagnostics use only local probes and distinguish setup readiness from application correctness.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { diagnose, nodeDiagnostic } from '../src/doctor.js'
async function workspace(status = 200, setupIssues: string[] = []) {
  const directory = await mkdtemp(join(tmpdir(), 'jevtest-doctor-'))
  const server = createServer((q, s) => {
    s.writeHead(status)
    s.end('ready')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const config = join(directory, 'config.mjs')
  const marker = join(directory, 'disposed')
  await writeFile(
    config,
    `import { writeFile } from 'node:fs/promises'; export default {
    adapter: { open: async () => { throw new Error('doctor must not execute flows') } },
    flows: [{ id: 'smoke', goal: 'Check', startUrl: ${JSON.stringify(url)}, successCriteria: ['Exact outcome'] }],
    setupIssues: ${JSON.stringify(setupIssues)},
    dispose: async () => writeFile(${JSON.stringify(marker)}, 'closed')
  }`,
  )
  return {
    config,
    marker,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()))
      await rm(directory, { recursive: true })
    },
  }
}
it('checks Node versions and reports a ready baseline without requiring credentials', async () => {
  expect(nodeDiagnostic('24.3.0').ok).toBe(true)
  expect(nodeDiagnostic('22.0.0').ok).toBe(false)
  const app = await workspace()
  try {
    const results = await diagnose({ config: app.config, policy: 'baseline', environment: {} })
    expect(
      results.every((result) => result.ok),
      JSON.stringify(results),
    ).toBe(true)
    expect(await readFile(app.marker, 'utf8')).toBe('closed')
  } finally {
    await app.close()
  }
})
it('identifies missing credentials, unfinished checks, and an unhealthy target', async () => {
  const app = await workspace(503, ['Flow smoke: exact check is unfinished'])
  try {
    const results = await diagnose({ config: app.config, environment: {} })
    expect(results.filter((result) => !result.ok).map((result) => result.name)).toEqual([
      'Credentials',
      'Unfinished check',
      'Target',
    ])
    expect(await readFile(app.marker, 'utf8')).toBe('closed')
    await expect(
      promisify(execFile)(
        process.execPath,
        [
          '--import',
          import.meta.resolve('tsx'),
          resolve('src/cli.ts'),
          'run',
          '--config',
          app.config,
        ],
        { windowsHide: true },
      ),
    ).rejects.toMatchObject({
      code: 2,
      stderr: expect.stringContaining('Finish configuration before a live run'),
    })
  } finally {
    await app.close()
  }
})
it('does not expose credential values or authenticate them', async () => {
  const app = await workspace()
  try {
    const results = await diagnose({
      config: app.config,
      environment: { TYPESAFE_API_KEY: 'synthetic-local-value' },
    })
    expect(results.find((result) => result.name === 'Credentials')).toMatchObject({
      ok: true,
      message: expect.stringContaining('authentication was not tested'),
    })
    expect(JSON.stringify(results)).not.toContain('synthetic-local-value')
    const missing = await diagnose({ config: app.config + '.missing', policy: 'baseline' })
    expect(missing.find((result) => result.name === 'Project setup')).toMatchObject({
      ok: false,
      message: expect.stringContaining('not found'),
    })
  } finally {
    await app.close()
  }
})
