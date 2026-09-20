// Seed a working repair shop with synthetic customers, open jobs, stock, and receivables.
import type { Database, Status } from './domain.js'
import { quoteTotal } from './domain.js'

export function seed(): Database {
  const db: Database = {
    version: 1,
    revision: 0,
    nextId: 2000,
    staff: [
      { id: 'staff-manager', name: 'Morgan Ellis', role: 'manager', active: true },
      { id: 'staff-advisor', name: 'Alex Rivers', role: 'advisor', active: true },
      { id: 'staff-tech', name: 'Sam Patel', role: 'technician', active: true },
      { id: 'staff-tech-2', name: 'Charlie Moss', role: 'technician', active: true },
      { id: 'staff-inactive', name: 'Robin Gray', role: 'technician', active: false },
    ],
    customers: [
      'Oakfield Studio',
      'Northbank Cycles',
      'Cedar Design',
      'Meadow Library',
      'Juniper Bakery',
      'Harbour Print',
      'Willow Theatre',
      'Aster Workshop',
      'Pinewood Books',
      'Fern Architecture',
      'Maple Community Hall',
      'Birch Music',
    ].map((name, i) => ({
      id: `customer-${i + 1}`,
      name,
      email: `service${i + 1}@example.test`,
      phone: `07700 900${String(i).padStart(3, '0')}`,
      archived: i === 11,
    })),
    parts: [
      ['Laptop battery', 'BAT-410', 7900, 4200],
      ['USB-C charging port', 'USB-220', 3200, 1200],
      ['14-inch display', 'DSP-140', 12900, 7800],
      ['Cooling fan', 'FAN-060', 2800, 1100],
      ['Keyboard assembly', 'KEY-014', 5500, 2600],
      ['512 GB SSD', 'SSD-512', 6800, 3500],
      ['8 GB memory module', 'RAM-008', 3400, 1700],
      ['Display cable', 'CBL-140', 1900, 600],
      ['Power adapter', 'PWR-065', 3900, 1800],
      ['Hinge pair', 'HNG-014', 2400, 900],
      ['Thermal compound', 'THM-005', 800, 200],
      ['Trackpad assembly', 'TRK-014', 4200, 2000],
    ].map(([name, sku, price, cost], i) => ({
      id: `part-${i + 1}`,
      name: String(name),
      sku: String(sku),
      price: Number(price),
      cost: Number(cost),
      stock: {
        central: { onHand: i === 10 ? 3 : 12 + i, reserved: 0, reorderAt: 3 },
        riverside: { onHand: i === 2 ? 2 : 6 + i, reserved: 0, reorderAt: 3 },
      },
    })),
    orders: [],
    invoices: [],
    purchases: [],
    audit: [],
  }
  const statuses: Status[] = ['intake', 'quoted', 'approved', 'repairing', 'completed', 'cancelled']
  const symptoms = [
    'Battery drains within an hour',
    'Charging connector intermittent',
    'Display flickers on opening',
    'Fan rattles under load',
    'Several keys unresponsive',
    'Storage upgrade requested',
  ]
  for (let i = 0; i < 24; i++) {
    const status = statuses[i % statuses.length]!
    const part = db.parts[i % 6]!
    const location = i % 2 ? 'riverside' : 'central'
    const order = {
      id: `WO-${1001 + i}`,
      customerId: db.customers[i % 11]!.id,
      device: ['ThinkPad T14', 'MacBook Air 13', 'Dell Latitude 5420', 'HP EliteBook 840'][i % 4]!,
      serial: `RW-DEMO-${1001 + i}`,
      description: symptoms[i % 6]!,
      location,
      priority: (['normal', 'urgent', 'low'] as const)[i % 3]!,
      status,
      assigneeId: i % 2 ? 'staff-tech' : 'staff-tech-2',
      dueDate: `2026-09-${String(18 + (i % 10)).padStart(2, '0')}`,
      lines: status === 'intake' ? [] : [{ partId: part.id, quantity: 1, unitPrice: part.price }],
      labour: status === 'intake' ? 0 : 4500,
      consumed: status === 'repairing' || status === 'completed',
      notes: [
        {
          text: 'Device checked in; customer requests a quote before repair.',
          staffId: 'staff-advisor',
          at: '2026-09-17T09:00:00.000Z',
        },
      ],
    } satisfies Database['orders'][number]
    if (status === 'approved') part.stock[location].reserved++
    db.orders.push(order)
    if (status === 'completed') {
      const subtotal = quoteTotal(order)
      const total = subtotal + Math.round(subtotal * 0.2)
      db.invoices.push({
        id: `INV-${1001 + i}`,
        workOrderId: order.id,
        subtotal,
        discount: 0,
        tax: total - subtotal,
        total,
        payments:
          i < 12
            ? [{ reference: `CARD-SEED-${i}`, amount: total, at: '2026-09-17T12:00:00.000Z' }]
            : [],
        refunds: [],
      })
    }
  }
  db.purchases = [
    {
      id: 'PO-1001',
      supplier: 'Circuit Supply',
      partId: 'part-3',
      location: 'riverside',
      quantity: 10,
      received: 0,
      receipts: [],
    },
    {
      id: 'PO-1002',
      supplier: 'Bench Parts Co',
      partId: 'part-11',
      location: 'central',
      quantity: 20,
      received: 5,
      receipts: [{ reference: 'DELIVERY-019', quantity: 5, at: '2026-09-17T08:00:00.000Z' }],
    },
  ]
  return db
}
