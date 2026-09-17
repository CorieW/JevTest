// Scaffold a local integration without overwriting application code, existing configs, or scripts.
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exists } from './config.js'

const portable = (from: string, to: string) => {
  const value = relative(from, to).replace(/\\/g, '/')
  return value.startsWith('.') ? value : `./${value}`
}

export async function initialize(cwd = process.cwd()): Promise<string[]> {
  const directory = resolve(cwd, 'jevtest')
  const files = ['jevtest/config.ts', 'jevtest/flows.ts', 'jevtest.config.ts']
  for (const file of files)
    if (await exists(resolve(cwd, file))) throw new Error(`Refusing to overwrite ${file}.`)
  const packageFile = resolve(cwd, 'package.json')
  const pkg = (await exists(packageFile))
    ? JSON.parse(await readFile(packageFile, 'utf8'))
    : { private: true, type: 'module' }
  if (pkg.scripts && (typeof pkg.scripts !== 'object' || Array.isArray(pkg.scripts)))
    throw new Error('package.json scripts must be an object.')
  const entry = portable(directory, fileURLToPath(new URL('../dist/index.js', import.meta.url)))
  const cli = portable(cwd, fileURLToPath(new URL('../dist/cli.js', import.meta.url)))
  const config = `// JevTest integration; replace the unfinished check with your application's requirements.
import { createBrowserAdapter } from ${JSON.stringify(entry)}
import type { Project } from ${JSON.stringify(entry)}
import { flows } from './flows.ts'

export default {
  flows,
  adapter: createBrowserAdapter({
    check: async () => ({
      complete: false,
      assertions: [{ name: 'TODO: define an exact success check', passed: false }],
    }),
  }),
  limits: { concurrency: 1, maxSteps: 10 },
} satisfies Project
`
  const flows = `// Replace this goal and URL with one task in your application.
import type { Flow } from ${JSON.stringify(entry)}
export const flows: Flow[] = [{
  id: 'smoke',
  goal: 'TODO: describe the user task to exercise.',
  startUrl: 'http://127.0.0.1:3000',
  successCriteria: ['TODO: describe the exact expected outcome.'],
}]
`
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, 'config.ts'), config, { flag: 'wx' })
  await writeFile(resolve(directory, 'flows.ts'), flows, { flag: 'wx' })
  pkg.scripts = {
    'jevtest:run': `node ${JSON.stringify(cli)} run`,
    'jevtest:baseline': `node ${JSON.stringify(cli)} run --policy baseline`,
    ...pkg.scripts,
  }
  await writeFile(packageFile, JSON.stringify(pkg, null, 2) + '\n')
  return ['jevtest/config.ts', 'jevtest/flows.ts', 'package.json']
}
