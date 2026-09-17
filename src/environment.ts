// Explicit env files share Node's parser and never overwrite process-provided credentials.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'

export async function loadEnvironment(
  file?: string,
  cwd = process.cwd(),
  environment: NodeJS.ProcessEnv = process.env,
): Promise<void> {
  if (!file) return
  let content: string
  try {
    content = await readFile(resolve(cwd, file), 'utf8')
  } catch {
    throw new Error(`Cannot read environment file: ${resolve(cwd, file)}`)
  }
  for (const [key, value] of Object.entries(parseEnv(content)))
    if (environment[key] === undefined) environment[key] = value
}
