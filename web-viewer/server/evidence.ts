// Resolve only allowlisted evidence and recheck real paths to reject symlink escapes.
import { readFile, realpath, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { inside } from './paths.js'
export type EvidenceRegistry = Map<string, { root: string; file: string }>
export const evidencePolicy =
  "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'"
export async function readEvidence(asset: { root: string; file: string }) {
  const file = await realpath(asset.file)
  if (!inside(asset.root, file) || !(await stat(file)).isFile()) return undefined
  const type = {
    '.html': 'text/html; charset=utf-8',
    '.png': 'image/png',
    '.json': 'application/json',
    '.dot': 'text/plain',
  }[extname(file)]
  if (!type) return undefined
  return { type, body: await readFile(file) }
}
