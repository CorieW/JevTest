// Setup is repeatable, skips unnecessary installation, and stops immediately on prerequisites or build failure.
import { expect, it, vi } from 'vitest'
import { setupLocal } from '../src/setup.js'
it('builds with an existing browser without downloading it again', async () => {
  const execute = vi.fn(async () => {})
  await setupLocal({}, { version: '24.3.0', execute, browserAvailable: async () => true })
  expect(execute).toHaveBeenCalledTimes(2)
  expect(execute.mock.calls[0]).toEqual([
    expect.stringContaining('typescript'),
    ['-p', 'config/tsconfig.build.json'],
    expect.any(String),
    undefined,
  ])
  expect(execute.mock.calls[1]).toEqual([
    expect.stringMatching(/web-viewer[\\/]build.mjs$/),
    [],
    expect.any(String),
    undefined,
  ])
})
it('installs a missing browser and verifies that it launches afterward', async () => {
  const execute = vi.fn(async () => {})
  const browserAvailable = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  await setupLocal({}, { version: '24.3.0', execute, browserAvailable })
  expect(execute).toHaveBeenCalledTimes(3)
  expect(execute.mock.calls[2]).toEqual([
    expect.stringContaining('playwright'),
    ['install', 'chromium'],
    expect.any(String),
    undefined,
  ])
  expect(browserAvailable).toHaveBeenCalledTimes(2)
})
it('rejects unsupported Node versions and does not continue after build failure', async () => {
  const execute = vi.fn(async () => {
    throw new Error('build failed')
  })
  const browserAvailable = vi.fn(async () => false)
  await expect(setupLocal({}, { version: '22.0.0', execute, browserAvailable })).rejects.toThrow(
    'Node 24',
  )
  expect(execute).not.toHaveBeenCalled()
  await expect(setupLocal({}, { version: '24.3.0', execute, browserAvailable })).rejects.toThrow(
    'build failed',
  )
  expect(browserAvailable).not.toHaveBeenCalled()
})
it('supports build-only setup and rejects cancellation before executing commands', async () => {
  const execute = vi.fn(async () => {})
  const browserAvailable = vi.fn(async () => false)
  const dependencies = { version: '24.3.0', execute, browserAvailable }
  await setupLocal({ skipBrowser: true }, dependencies)
  expect(browserAvailable).not.toHaveBeenCalled()
  const controller = new AbortController()
  controller.abort(new Error('cancelled'))
  await expect(setupLocal({ signal: controller.signal }, dependencies)).rejects.toThrow('cancelled')
  expect(execute).toHaveBeenCalledTimes(2)
})
