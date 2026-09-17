// Fail without printing secret values if tracked files contain common credential formats.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const patterns = [
  /apikey_[a-zA-Z0-9_]{20,}/,
  /(?:gh[pousr]_[a-zA-Z0-9]{30,}|github_pat_[a-zA-Z0-9_]{30,})/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
]
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
const failures = []
for (const file of files) {
  const content = readFileSync(file, 'utf8')
  if (patterns.some((pattern) => pattern.test(content))) failures.push(file)
}
if (failures.length) {
  console.error(`Possible credentials in tracked files:\n${failures.join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`Secret check passed for ${files.length} tracked files.`)
}
