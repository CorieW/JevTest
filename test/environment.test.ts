// Env loading is explicit, preserves process values, and never exposes contents in errors.
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { loadEnvironment } from '../src/environment.js'
it('uses Node env syntax and preserves existing values, including empty strings', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'jevtest-env-'))
  try {
    await writeFile(
      join(cwd, '.env.local'),
      'TOKEN="local value"\nEMPTY=replacement\nNEW="hello # world"\nMULTI="line one\nline two"\n',
    )
    const environment = { TOKEN: 'process value', EMPTY: '' }
    await loadEnvironment('.env.local', cwd, environment)
    expect(environment).toEqual({
      TOKEN: 'process value',
      EMPTY: '',
      NEW: 'hello # world',
      MULTI: 'line one\nline two',
    })
    const untouched = {}
    await loadEnvironment(undefined, cwd, untouched)
    expect(untouched).toEqual({})
    await expect(loadEnvironment('missing', cwd, {})).rejects.toThrow(
      'Cannot read environment file',
    )
  } finally {
    await rm(cwd, { recursive: true })
  }
})
