// Standard CLI configuration owns its local shop unless SHOP_URL selects an existing instance.
import { shopProject } from './project.js'
import { startShop } from '../src/server.js'
export default async () => {
  if (process.env.SHOP_URL) return shopProject(process.env.SHOP_URL)
  const shop = await startShop(Number(process.env.JEVTEST_PORT ?? 4317))
  try {
    return { ...shopProject(shop.url), dispose: shop.close }
  } catch (error) {
    await shop.close()
    throw error
  }
}
