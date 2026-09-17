// Locate explicitly selected or conventional project configurations without silently choosing between them.
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'

export async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return false
  }
}

export async function findConfig(explicit?: string, cwd = process.cwd()): Promise<string> {
  if (explicit) {
    const file = resolve(cwd, explicit)
    if (!(await exists(file))) throw new Error(`Config not found: ${file}`)
    return file
  }
  const candidates = ['jevtest/config.ts', 'jevtest.config.ts']
  const found = []
  for (const candidate of candidates) {
    const file = resolve(cwd, candidate)
    if (await exists(file)) found.push(file)
  }
  if (!found.length) throw new Error('No JevTest config found. Run jevtest init or use --config.')
  if (found.length > 1) throw new Error('Multiple JevTest configs found. Select one with --config.')
  return found[0]!
}
