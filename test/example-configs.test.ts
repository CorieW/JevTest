// Every example exposes the standard CLI project contract and owns only its created server.
import { expect, it } from 'vitest'
import { resolve } from 'node:path'
import { loadProject } from '../src/config.js'
import { reachable } from '../src/server.js'
it.each(['ledger', 'reservations', 'taskboard', 'shop'])(
  '%s config opens a real browser and releases its local server',
  async (name) => {
    const previous = process.env.JEVTEST_PORT
    const previousShop = process.env.SHOP_URL
    process.env.JEVTEST_PORT = '0'
    delete process.env.SHOP_URL
    try {
      const project = await loadProject(resolve(`examples/${name}/jevtest/config.ts`))
      const flow = project.flows[0]!
      try {
        expect(project.flows).toHaveLength(name === 'shop' ? 12 : 240)
        expect(await reachable(flow.startUrl)).toBe(true)
        const session = await project.adapter.open(flow, `cli-config-${name}`)
        try {
          expect((await session.observe()).actions.length).toBeGreaterThan(0)
          expect((await session.check()).complete).toBe(false)
        } finally {
          await session.close()
        }
      } finally {
        await project.dispose?.()
      }
      expect(await reachable(flow.startUrl)).toBe(false)
    } finally {
      if (previous === undefined) delete process.env.JEVTEST_PORT
      else process.env.JEVTEST_PORT = previous
      if (previousShop === undefined) delete process.env.SHOP_URL
      else process.env.SHOP_URL = previousShop
    }
  },
)
