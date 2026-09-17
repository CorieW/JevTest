// Prepare this checkout's build and browser without changing application files or loading API credentials.
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { nodeDiagnostic } from './doctor.js'

interface SetupServices {
  version: string
  execute: (file: string, args: string[], cwd: string, signal?: AbortSignal) => Promise<void>
  browserAvailable: () => Promise<boolean>
}
const services: SetupServices = {
  version: process.versions.node,
  execute: (file, args, cwd, signal) =>
    new Promise<void>((resolve, reject) => {
      const child = spawn(process.execPath, [file, ...args], {
        cwd,
        windowsHide: true,
        stdio: 'inherit',
        signal,
      })
      child.once('error', reject)
      child.once('close', (code) =>
        code === 0
          ? resolve()
          : reject(
              new Error(
                `Setup command failed (exit ${code ?? 'signal'}). Review the command output above.`,
              ),
            ),
      )
    }),
  browserAvailable: async () => {
    try {
      const browser = await chromium.launch({ headless: true })
      await browser.close()
      return true
    } catch {
      return false
    }
  },
}
export async function setupLocal(
  options: {
    skipBrowser?: boolean
    signal?: AbortSignal
    progress?: (message: string) => void
  } = {},
  dependencies: SetupServices = services,
): Promise<void> {
  options.signal?.throwIfAborted()
  const node = nodeDiagnostic(dependencies.version)
  if (!node.ok) throw new Error(node.message)
  const checkout = fileURLToPath(new URL('../', import.meta.url))
  const compiler = fileURLToPath(import.meta.resolve('typescript/bin/tsc'))
  options.progress?.('Building JevTest…')
  await dependencies.execute(
    compiler,
    ['-p', 'config/tsconfig.build.json'],
    checkout,
    options.signal,
  )
  options.signal?.throwIfAborted()
  if (options.skipBrowser) {
    options.progress?.('Browser installation skipped.')
    return
  }
  if (!(await dependencies.browserAvailable())) {
    options.progress?.('Installing Chromium…')
    await dependencies.execute(
      fileURLToPath(new URL('./cli.js', import.meta.resolve('playwright/package.json'))),
      ['install', 'chromium'],
      checkout,
      options.signal,
    )
    if (!(await dependencies.browserAvailable()))
      throw new Error(
        'Chromium still cannot launch. Check Playwright system dependencies and run setup again.',
      )
  }
  options.progress?.('JevTest and Chromium are ready. Run pnpm demo or pnpm dev init.')
}
