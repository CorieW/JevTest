// Web-viewer command lifecycle stays outside the testing engine; the main CLI only delegates here.
import { startViewer } from './http.js'
import { errorMessage } from '../../src/util.js'
export { startViewer } from './http.js'
export async function runViewerCommand(options: { directories: string[]; port?: number }) {
  const viewer = await startViewer(options)
  console.log(`JevTest viewer: ${viewer.url}\nRead-only saved results. Press Ctrl+C to stop.`)
  let closing = false
  const close = () => {
    if (closing) return
    closing = true
    void viewer
      .close()
      .catch((error) => {
        console.error(errorMessage(error))
        process.exitCode = 2
      })
      .finally(() => {
        process.removeListener('SIGINT', close)
        process.removeListener('SIGTERM', close)
      })
  }
  process.on('SIGINT', close)
  process.on('SIGTERM', close)
}
