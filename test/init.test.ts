// Initialization and discovery preserve user files and leave correctness explicitly unfinished.
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { initialize } from '../src/init.js'
import { findConfig } from '../src/config.js'
const directories: string[] = []
async function workspace() {
  const directory = await mkdtemp(join(tmpdir(), 'jevtest-init-'))
  directories.push(directory)
  return directory
}
afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })))
})
it('creates an isolated integration while preserving existing scripts and package fields', async () => {
  const cwd = await workspace()
  await writeFile(
    join(cwd, 'package.json'),
    JSON.stringify({ name: 'app', scripts: { 'jevtest:run': 'custom', start: 'serve' } }),
  )
  await initialize(cwd)
  const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'))
  expect(pkg).toMatchObject({ name: 'app', scripts: { 'jevtest:run': 'custom', start: 'serve' } })
  expect(pkg.scripts['jevtest:baseline']).toContain('--policy baseline')
  expect(await findConfig(undefined, cwd)).toBe(join(cwd, 'jevtest', 'config.ts'))
  const flows = await readFile(join(cwd, 'jevtest/flows.ts'), 'utf8')
  expect(flows).toContain('checks.pending()')
  expect(pkg.scripts['jevtest:typecheck']).toContain('jevtest/tsconfig.json')
  await expect(initialize(cwd)).rejects.toThrow('Refusing to overwrite')
})
it('refuses partial or legacy configurations without modifying files', async () => {
  const cwd = await workspace()
  await mkdir(join(cwd, 'jevtest'))
  await writeFile(join(cwd, 'jevtest/flows.ts'), 'keep')
  await expect(initialize(cwd)).rejects.toThrow('flows.ts')
  expect(await readFile(join(cwd, 'jevtest/flows.ts'), 'utf8')).toBe('keep')
})
it('requires explicit selection for ambiguous configs and explains missing configs', async () => {
  const cwd = await workspace()
  await expect(findConfig(undefined, cwd)).rejects.toThrow('init')
  await writeFile(join(cwd, 'jevtest.config.ts'), 'export default {}')
  expect(await findConfig(undefined, cwd)).toBe(join(cwd, 'jevtest.config.ts'))
  await mkdir(join(cwd, 'jevtest'))
  await writeFile(join(cwd, 'jevtest/config.ts'), 'export default {}')
  await expect(findConfig(undefined, cwd)).rejects.toThrow('Multiple')
  expect(await findConfig('jevtest/config.ts', cwd)).toBe(join(cwd, 'jevtest/config.ts'))
  await expect(findConfig('missing.ts', cwd)).rejects.toThrow('not found')
})
