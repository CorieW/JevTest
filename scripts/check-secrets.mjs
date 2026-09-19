// Scan tracked and non-ignored untracked files without printing credential values.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const patterns = [
  /apikey_[a-zA-Z0-9_]{20,}/,
  /(?:gh[pousr]_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{30,})/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
]
const files = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
  { encoding: 'utf8' },
)
  .split('\0')
  .filter(Boolean)
const failures = []
let scanned = 0
for (const file of files) {
  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') continue
    throw error
  }
  scanned++
  if (patterns.some((pattern) => pattern.test(content))) failures.push(file)
}
if (failures.length) {
  console.error(`Possible credentials in tracked/untracked files:\n${failures.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Secret check passed for ${scanned} tracked/untracked files.`)
}
