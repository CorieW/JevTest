// Standalone web-viewer entry point opens saved reports without loading the testing CLI.
import { parseArgs } from 'node:util'
import { runViewerCommand } from './server/command.js'
import { errorMessage } from '../src/util.js'
const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: { output: { type: 'string' }, port: { type: 'string' } },
})
runViewerCommand({
  directories: positionals.length ? positionals : [values.output ?? 'artifacts/run'],
  port: values.port === undefined ? undefined : Number(values.port),
}).catch((error) => {
  console.error(errorMessage(error))
  process.exitCode = 2
})
