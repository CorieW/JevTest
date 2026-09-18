// Ordinary RepairWorks application checks cover working paths and persistence, without JevTest integration.
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { seed } from '../examples/repairworks/src/seed.js'
import { execute } from '../examples/repairworks/src/service.js'
import { openRepository } from '../examples/repairworks/src/repository.js'
import { startRepairWorks } from '../examples/repairworks/src/server.js'
import { render } from '../examples/repairworks/src/view.js'

const intake = {
  customerId: 'customer-1',
  device: 'Service laptop',
  serial: 'UNIT-NEW-01',
  description: 'Battery replacement requested',
  location: 'central',
  priority: 'normal',
  dueDate: '2026-09-25',
}
describe('RepairWorks application', () => {
  it('supports intake through repair, invoicing, partial payments, and an audit trail', () => {
    const db = seed()
    const run = (action: string, values: Record<string, string>, actor = 'staff-manager') =>
      execute(db, actor, action, new URLSearchParams(values))
    const destination = run('order-create', intake)
    const order = db.orders.find((item) => destination.endsWith(item.id))!
    const id = order.id
    run('assign', { id, assigneeId: 'staff-tech' })
    run('quote-add', { id, partId: 'part-1', quantity: '1' })
    run('quote-send', { id, labour: '45.00' })
    run('quote-approve', { id })
    expect(db.parts[0]!.stock.central).toEqual({ onHand: 12, reserved: 1, reorderAt: 3 })
    run('repair-start', { id }, 'staff-tech')
    expect(db.parts[0]!.stock.central).toEqual({ onHand: 11, reserved: 0, reorderAt: 3 })
    run(
      'repair-complete',
      { id, resolution: 'Battery fitted; charging and runtime checks passed.' },
      'staff-tech',
    )
    run('invoice-issue', { id })
    const invoice = db.invoices.find((item) => item.workOrderId === id)!
    expect(invoice).toMatchObject({ subtotal: 12400, tax: 2480, total: 14880 })
    run('payment', { id: invoice.id, reference: 'CARD-01', amount: '48.80' })
    run('payment', { id: invoice.id, reference: 'BANK-02', amount: '100.00' })
    expect(invoice.payments.map((payment) => payment.amount)).toEqual([4880, 10000])
    expect(order.status).toBe('completed')
    expect(db.audit).toHaveLength(10)
    expect(() => run('invoice-issue', { id })).toThrow('already has an invoice')
  })

  it('rejects malformed inputs and protects unrelated lifecycle and role rules', () => {
    const db = seed()
    for (const values of [
      { ...intake, dueDate: '2026-02-30' },
      { ...intake, priority: 'critical' },
      { ...intake, location: 'unknown' },
      { ...intake, device: '' },
    ])
      expect(() =>
        execute(db, 'staff-manager', 'order-create', new URLSearchParams(values)),
      ).toThrow()
    expect(() => execute(db, 'staff-tech', 'order-create', new URLSearchParams(intake))).toThrow(
      'role',
    )
    expect(() =>
      execute(
        db,
        'staff-manager',
        'repair-complete',
        new URLSearchParams({ id: 'WO-1001', resolution: 'Done' }),
      ),
    ).toThrow('in progress')
    expect(() =>
      execute(
        db,
        'staff-advisor',
        'refund',
        new URLSearchParams({ id: 'INV-1005', amount: '1.00', reference: 'REF-01' }),
      ),
    ).toThrow('role')
    expect(() =>
      execute(db, 'staff-manager', 'customer-archive', new URLSearchParams({ id: 'customer-1' })),
    ).toThrow('open work orders')
    expect(() =>
      execute(
        db,
        'staff-manager',
        'quote-add',
        new URLSearchParams({ id: 'WO-1001', partId: 'part-1', quantity: '1.5' }),
      ),
    ).toThrow('whole number')
  })

  it('serializes concurrent forms, rolls back rejected edits, and persists a restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repairworks-store-'))
    try {
      const file = join(directory, 'database.json')
      const repository = await openRepository(file)
      const edits = await Promise.allSettled(
        ['first', 'second'].map((note) =>
          repository.update(0, (db) =>
            execute(db, 'staff-manager', 'note', new URLSearchParams({ id: 'WO-1001', note })),
          ),
        ),
      )
      expect(edits.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
      expect(repository.read().revision).toBe(1)
      await expect(
        repository.update(1, (db) => {
          db.customers[0]!.name = 'must not persist'
          throw new Error('Rejected')
        }),
      ).rejects.toThrow('Rejected')
      expect((await openRepository(file)).read()).toEqual(repository.read())
      expect(JSON.parse(await readFile(file, 'utf8')).customers[0].name).toBe('Oakfield Studio')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('renders every seeded detail page and escapes customer-controlled content', () => {
    const db = seed()
    db.customers[0]!.name = '<script>alert("x")</script>'
    const pages = [
      '/',
      '/work-orders',
      '/work-orders/new',
      '/customers',
      '/inventory',
      '/purchasing',
      '/invoices',
      '/team',
      '/activity',
      ...db.orders.map((order) => `/work-orders/${order.id}`),
      ...db.invoices.map((invoice) => `/invoices/${invoice.id}`),
    ]
    for (const staff of db.staff.filter((person) => person.active))
      for (const page of pages) {
        const html = render(db, staff, new URL(page, 'http://127.0.0.1:4330'), 'form-token')
        expect(html).toContain('<main')
        expect(html).not.toContain('<script>')
        expect(html).not.toContain('undefined')
      }
    expect(
      render(db, db.staff[0]!, new URL('http://127.0.0.1:4330/customers'), 'form-token'),
    ).toContain('&lt;script&gt;')
    expect(() =>
      render(db, db.staff[0]!, new URL('http://127.0.0.1:4330/missing'), 'form-token'),
    ).toThrow('does not exist')
  })

  it('serves real forms, enforces sessions and CSRF, and rejects stale submissions', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'repairworks-http-'))
    const app = await startRepairWorks({ port: 0, file: join(directory, 'database.json') })
    try {
      const login = await fetch(`${app.url}/session`)
      const cookie = login.headers.get('set-cookie')!.split(';')[0]!
      const html = await login.text()
      const csrf = /name="csrf" value="([^"]+)"/.exec(html)![1]!
      const post = (path: string, values: Record<string, string>, origin = app.url) =>
        fetch(`${app.url}${path}`, {
          method: 'POST',
          redirect: 'manual',
          headers: { cookie, origin },
          body: new URLSearchParams({ csrf, ...values }),
        })
      expect(
        (await post('/session', { staffId: 'staff-manager' }, 'https://other.example')).status,
      ).toBe(403)
      expect((await post('/session', { staffId: 'staff-manager', csrf: 'wrong' })).status).toBe(403)
      expect((await post('/session', { staffId: 'staff-manager' })).status).toBe(303)
      const create = await post('/actions/order-create', { ...intake, revision: '0' })
      expect(create.status).toBe(303)
      const page = await fetch(`${app.url}${create.headers.get('location')}`, {
        headers: { cookie },
      })
      expect(await page.text()).toContain('Changes saved.')
      expect(
        (await post('/actions/order-create', { ...intake, serial: 'SECOND', revision: '0' }))
          .status,
      ).toBe(409)
      expect((await post('/actions/order-create', { ...intake })).status).toBe(428)
      expect((await fetch(`${app.url}/missing`, { headers: { cookie } })).status).toBe(404)
      expect((await fetch(`${app.url}/health`)).status).toBe(200)
    } finally {
      await app.close()
      await rm(directory, { recursive: true, force: true })
    }
  })
})
