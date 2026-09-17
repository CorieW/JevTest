// Twelve labeled flows exercise exact order counts, totals, quantities, controls, and network failures.
import { createBrowserAdapter } from '../../src/browser.js'
import type { Flow, Json, Project } from '../../src/types.js'
import type { Page } from 'playwright'

interface ShopState {
  stage: string
  quantity: number
  price: number
  discount: number
  cartCount: number
  displayedTotal: number
  orders: { quantity: number; total: number }[]
  paymentError: boolean
}
const read = (page: Page) =>
  page.evaluate(() => (window as unknown as { shopState: () => ShopState }).shopState())
export const cases = [
  { id: 'single-item', quantity: 1, price: 20, discount: 0, bug: 'none' },
  { id: 'two-items', quantity: 2, price: 20, discount: 0, bug: 'none' },
  { id: 'three-items', quantity: 3, price: 20, discount: 0, bug: 'none' },
  { id: 'ten-percent-discount', quantity: 1, price: 20, discount: 10, bug: 'none' },
  { id: 'bulk-discount', quantity: 3, price: 25, discount: 20, bug: 'none' },
  { id: 'fractional-price', quantity: 2, price: 12.5, discount: 0, bug: 'none' },
  { id: 'wrong-total', quantity: 1, price: 20, discount: 0, bug: 'wrong-total' },
  { id: 'duplicate-order', quantity: 1, price: 20, discount: 0, bug: 'duplicate' },
  { id: 'missing-checkout', quantity: 1, price: 20, discount: 0, bug: 'missing-checkout' },
  { id: 'wrong-cart-count', quantity: 1, price: 20, discount: 0, bug: 'cart-count' },
  { id: 'payment-failure', quantity: 1, price: 20, discount: 0, bug: 'payment-error' },
  { id: 'ignored-discount', quantity: 2, price: 20, discount: 25, bug: 'discount' },
]
export function shopProject(baseUrl: string): Project {
  const flows: Flow[] = cases.map((c) => ({
    id: c.id,
    goal: `Order ${c.quantity} field notebook(s) at £${c.price} each with ${c.discount}% discount. Add to cart, go to checkout, then place exactly one order.`,
    startUrl: `${baseUrl}/?${new URLSearchParams({ quantity: String(c.quantity), price: String(c.price), discount: String(c.discount), bug: c.bug })}`,
    fixtures: { quantity: c.quantity, price: c.price, discount: c.discount },
    successCriteria: [
      'Order confirmation is visible',
      'Exactly one order exists',
      'Order quantity matches requested quantity',
      'Order total matches the displayed checkout total and expected discount',
    ],
  }))
  const adapter = createBrowserAdapter({
    readData: async (page) => (await read(page)) as unknown as Json,
    ready: async (page) => {
      await page.waitForFunction(
        () =>
          Boolean((window as unknown as { shopState?: unknown }).shopState) &&
          !document.querySelector('#place:disabled'),
      )
    },
    actions: async (page) => {
      const state = await read(page)
      const specs =
        state.stage === 'product'
          ? [
              {
                id: 'add',
                label: 'Add the requested items to the cart',
                selector: '#add',
                expected: 'Cart shows the requested quantity and discounted total',
              },
            ]
          : state.stage === 'cart' && (await page.locator('#checkout').count())
            ? [
                {
                  id: 'checkout',
                  label: 'Go to checkout',
                  selector: '#checkout',
                  expected: 'Review screen displays the amount to pay',
                },
              ]
            : state.stage === 'checkout'
              ? [
                  {
                    id: 'place',
                    label: 'Place exactly one order',
                    selector: '#place',
                    expected:
                      'Confirmation shows one order with the requested quantity and displayed total',
                  },
                ]
              : []
      return specs.map((s) => ({ ...s, kind: 'click' as const }))
    },
    check: async (page, flow) => {
      // The payment request is asynchronous; the readiness condition belongs to the fixture.
      if ((await page.locator('#place').count()) && (await page.locator('#place').isDisabled()))
        await page.waitForFunction(
          () =>
            (window as unknown as { shopState: () => ShopState }).shopState().stage !== 'checkout',
        )
      const state = await read(page)
      const fixture = flow.fixtures as { quantity: number; price: number; discount: number }
      const total = fixture.quantity * fixture.price * (1 - fixture.discount / 100)
      return {
        complete: state.stage === 'confirmation' || state.stage === 'error',
        invariants:
          state.stage === 'cart'
            ? [
                {
                  name: 'Cart contains exactly the requested quantity',
                  passed: state.cartCount === fixture.quantity,
                  expected: fixture.quantity,
                  actual: state.cartCount,
                },
                {
                  name: 'A checkout button is available for a populated cart',
                  passed: (await page.locator('#checkout').count()) === 1,
                },
              ]
            : [],
        assertions: [
          {
            name: 'Order confirmation is visible',
            passed: state.stage === 'confirmation',
            actual: state.stage,
          },
          {
            name: 'Exactly one order exists',
            passed: state.orders.length === 1,
            expected: 1,
            actual: state.orders.length,
          },
          {
            name: 'Order quantity matches requested quantity',
            passed: state.orders[0]?.quantity === fixture.quantity,
            expected: fixture.quantity,
            actual: state.orders[0]?.quantity ?? null,
          },
          {
            name: 'Charged total equals checkout total and expected discount',
            passed:
              state.orders[0]?.total === state.displayedTotal && state.orders[0]?.total === total,
            expected: total,
            actual: state.orders[0]?.total ?? null,
          },
        ],
      }
    },
  })
  return { flows, adapter, limits: { maxSteps: 5, concurrency: 2, timeoutMs: 120_000 } }
}
