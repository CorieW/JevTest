// Serve any benchmark for manual browser use without making model calls.
import { benchmarks } from './catalog.js'
import { startBenchmark } from './host.js'
const benchmark = benchmarks.find((b) => b.slug === process.argv[2])
if (!benchmark) throw new Error('Choose reservations, ledger, or taskboard')
const host = await startBenchmark(benchmark, Number(process.argv[3] ?? 4320), {
  storageDir: `artifacts/example-data/${benchmark.slug}`,
})
console.log(`${benchmark.title}: ${host.url}`)
process.once('SIGINT', () => {
  void host.close()
})
process.once('SIGTERM', () => {
  void host.close()
})
