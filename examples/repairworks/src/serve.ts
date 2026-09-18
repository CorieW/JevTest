// Start the standalone repair shop; keep local business data between restarts.
import { startRepairWorks } from './server.js'
const port = Number(process.env.REPAIRWORKS_PORT ?? 4330)
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('REPAIRWORKS_PORT must be an integer from 1 to 65535.')
const app = await startRepairWorks({ port, file: process.env.REPAIRWORKS_DATA })
console.log(`RepairWorks: ${app.url}`)
process.once('SIGINT', () => {
  void app.close()
})
process.once('SIGTERM', () => {
  void app.close()
})
