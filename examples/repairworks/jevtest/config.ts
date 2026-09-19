// Standard JevTest integration owns a fresh application database and server for every run or replay.
import { mkdir, mkdtemp, readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import type { Action, Json, Project } from '../../../src/types.js'
import { createBrowserAdapter } from '../../../src/browser.js'
import { startRepairWorks } from '../src/server.js'
import type { Database } from '../src/domain.js'
import { paymentFlows } from './flows.js'

export default function repairWorksProject(): Project {
  const port = Number(process.env.JEVTEST_PORT ?? 4334)
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('JEVTEST_PORT must be an integer from 1 to 65535.')
  const baseUrl = `http://127.0.0.1:${port}`
  return {
    flows: paymentFlows(baseUrl),
    limits: { concurrency: 1, maxSteps: 9, timeoutMs: 60000 },
    adapter: {
      async open(flow, runId) {
        const root = resolve('artifacts/repairworks-sessions')
        await mkdir(root, { recursive: true })
        const directory = await mkdtemp(join(root, 'run-'))
        const file = join(directory, 'database.json')
        const host = await startRepairWorks({ port, file })
        try {
          const read = async () => JSON.parse(await readFile(file, 'utf8')) as Database
          const initial = await read()
          const original = initial.invoices.find((invoice) => invoice.id === 'INV-1017')!
          const unchanged = (db: Database) => ({
            customers: db.customers,
            staff: db.staff,
            parts: db.parts,
            orders: db.orders,
            purchases: db.purchases,
            invoices: db.invoices.filter((invoice) => invoice.id !== original.id),
          })
          let submissions = 0
          const browser = createBrowserAdapter({
            setup: async (page) => {
              await page.goto(`${host.url}/session`)
              await page.getByRole('button', { name: 'Morgan Ellis manager', exact: true }).click()
            },
            ready: async (page) => {
              await page.locator('main').waitFor({ state: 'visible' })
            },
            readData: async () => {
              const invoice = (await read()).invoices.find((item) => item.id === original.id)!
              return {
                invoiceId: invoice.id,
                total: invoice.total,
                payments: invoice.payments.map(({ reference, amount }) => ({ reference, amount })),
              }
            },
            normalize: (observation) => {
              const data = observation.data as {
                controls: Record<string, Json>[]
                application: Json
              }
              return {
                ...observation,
                data: {
                  ...data,
                  controls: data.controls.map((control) =>
                    control.name === 'csrf' ? { ...control, value: '[REDACTED]' } : control,
                  ),
                },
              }
            },
            actions: async (page, currentFlow) => {
              const fixture = currentFlow.fixtures as { reference: string; amount: string }
              const fields = [
                { name: 'amount', value: fixture.amount },
                { name: 'reference', value: fixture.reference },
              ]
              const actions: Action[] = []
              for (const field of fields) {
                const selector = `#payment-${original.id}-${field.name}`
                if (
                  (await page.locator(selector).count()) &&
                  (await page.locator(selector).inputValue()) !== field.value
                )
                  actions.push({
                    id: `fill-${field.name}`,
                    label: `Enter payment ${field.name}: ${field.value}`,
                    kind: 'fill',
                    selector,
                    value: field.value,
                  })
              }
              // Scope exploration to the payment form; offer submission when its required inputs are filled.
              if (
                !actions.length &&
                (await page.locator('form[action="/actions/payment"]').count())
              )
                actions.push({
                  id: 'record-payment',
                  label: 'Record the payment receipt',
                  kind: 'click',
                  selector: 'form[action="/actions/payment"] button',
                })
              return actions
            },
            check: async (page, currentFlow) => {
              const db = await read()
              const invoice = db.invoices.find((item) => item.id === original.id)!
              const expectedSubmissions = currentFlow.id === 'retry-payment-receipt' ? 2 : 1
              const error = await page
                .getByRole('heading', { name: 'Request could not be completed', exact: true })
                .isVisible()
              const payments = invoice.payments.filter(
                (payment) => payment.reference === 'CARD-DEMO-001',
              )
              const collected = invoice.payments.reduce(
                (total, payment) => total + payment.amount,
                0,
              )
              return {
                complete: submissions >= expectedSubmissions || error,
                assertions: [
                  {
                    name: 'The receipt credits exactly one payment',
                    passed: payments.length === 1 && invoice.payments.length === 1,
                    expected: 1,
                    actual: payments.length,
                  },
                  {
                    name: 'Exactly £10 is credited',
                    passed: collected === 1000 && payments[0]?.amount === 1000,
                    expected: 1000,
                    actual: collected,
                  },
                  {
                    name: 'Outstanding balance decreases by exactly £10',
                    passed: invoice.total - collected === original.total - 1000,
                    expected: original.total - 1000,
                    actual: invoice.total - collected,
                  },
                  {
                    name: 'Invoice prices and refunds remain unchanged',
                    passed:
                      invoice.total === original.total &&
                      invoice.subtotal === original.subtotal &&
                      invoice.discount === original.discount &&
                      invoice.tax === original.tax &&
                      JSON.stringify(invoice.refunds) === JSON.stringify(original.refunds),
                  },
                  {
                    name: 'Unrelated workshop records remain unchanged',
                    passed: JSON.stringify(unchanged(db)) === JSON.stringify(unchanged(initial)),
                  },
                ],
              }
            },
          })
          const session = await browser.open(flow, runId)
          let closing: Promise<void> | undefined
          return {
            ...session,
            execute: async (action) => {
              await session.execute(action)
              if (action.id === 'record-payment') submissions++
            },
            close: () =>
              (closing ??= (async () => {
                try {
                  await session.close()
                } finally {
                  await host.close()
                }
              })()),
          }
        } catch (error) {
          await host.close()
          throw error
        }
      },
    },
  }
}
