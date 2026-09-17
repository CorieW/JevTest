// Keep the controlled fixture available for CLI discovery and manual inspection.
import { startShop } from './server.js'
const shop = await startShop(4317)
console.log(`Fixture shop: ${shop.url}`)
process.once('SIGINT', () => {
  void shop.close()
})
process.once('SIGTERM', () => {
  void shop.close()
})
