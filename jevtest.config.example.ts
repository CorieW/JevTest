// Copy to jevtest.config.ts and replace the target, fixture, and assertions for your app.
import { createBrowserAdapter } from './dist/index.js'
import type { Project } from './dist/index.js'

export default {
  flows: [
    {
      id: 'checkout',
      goal: 'Order one available item and verify its confirmation.',
      startUrl: 'http://127.0.0.1:3000',
      fixtures: { email: 'customer@example.test' },
      successCriteria: ['An order confirmation appears and exactly one order exists.'],
    },
  ],
  adapter: createBrowserAdapter({
    inputFixtures: { '#email': ['customer@example.test'] },
    // For asynchronous apps, wait for an app-specific ready indicator after each action.
    ready: async (page) => {
      await page.locator('body').waitFor()
    },
    check: async (page) => {
      const complete = await page.getByTestId('order-confirmation').isVisible()
      return {
        complete,
        assertions: [
          { name: 'Confirmation appears', passed: complete },
          // Replace with an authoritative database/API count scoped to this run's fixture.
          {
            name: 'Exactly one order exists',
            passed: (await page.getByTestId('order-row').count()) === 1,
          },
        ],
      }
    },
  }),
  limits: { concurrency: 2, maxSteps: 20, maxRepetitions: 3, timeoutMs: 120_000 },
} satisfies Project
