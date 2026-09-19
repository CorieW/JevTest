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
  const files = [
    'jevtest/config.ts',
    'jevtest/flows.ts',
    'jevtest.config.ts',
    'jevtest/tsconfig.json',
  ]
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
  const config = `// JevTest integration; edit the URL, readiness condition, and flow checks.
import { defineProject } from ${JSON.stringify(entry)}
import { flows } from './flows.ts'
export default defineProject({ baseUrl: 'http://127.0.0.1:3000', ready: 'body', flows })
`
  const flows = `// Replace this unfinished task and exact check before running a live evaluation.
import { checks } from ${JSON.stringify(entry)}
import type { BrowserFlow } from ${JSON.stringify(entry)}
export const flows: BrowserFlow[] = [{
  id: 'smoke',
  goal: 'TODO: describe the user task to exercise.',
  completeWhen: '[data-testid="TODO-confirmation"]',
  checks: [checks.pending()],
}]
`
  await mkdir(directory, { recursive: true })
  await writeFile(resolve(directory, 'config.ts'), config, { flag: 'wx' })
  await writeFile(resolve(directory, 'flows.ts'), flows, { flag: 'wx' })
  await writeFile(
    resolve(directory, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
          allowImportingTsExtensions: true,
        },
        include: ['./**/*.ts'],
      },
      null,
      2,
    ) + '\n',
    { flag: 'wx' },
  )
  pkg.scripts = {
    'jevtest:typecheck': 'tsc --noEmit -p jevtest/tsconfig.json',
    'jevtest:run': `node ${JSON.stringify(cli)} run`,
    'jevtest:baseline': `node ${JSON.stringify(cli)} run --policy baseline`,
    ...pkg.scripts,
  }
  await writeFile(packageFile, JSON.stringify(pkg, null, 2) + '\n')
  const ignoreFile = resolve(cwd, '.gitignore')
  const ignore = (await exists(ignoreFile)) ? await readFile(ignoreFile, 'utf8') : ''
  const missing = ['.env.local', 'artifacts/'].filter(
    (line) => !ignore.split(/\r?\n/).includes(line),
  )
  if (missing.length)
    await writeFile(
      ignoreFile,
      ignore + (ignore && !ignore.endsWith('\n') ? '\n' : '') + missing.join('\n') + '\n',
    )
  if (!(await exists(resolve(cwd, '.env.example'))))
    await writeFile(
      resolve(cwd, '.env.example'),
      '# Local credentials; copy to .env.local and never commit values.\nTYPESAFE_API_KEY=\nTYPESAFE_MODEL=jev-latest\n',
      { flag: 'wx' },
    )
  return ['jevtest/config.ts', 'jevtest/flows.ts', 'jevtest/tsconfig.json', 'package.json']
}
