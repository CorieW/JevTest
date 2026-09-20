// Application commands enforce form validation, role rules, and repair lifecycle transitions.
import { AppError, balance, locations, quoteTotal, required, sum } from './domain.js'
import type { Database, Location, Role, Staff, WorkOrder } from './domain.js'

function text(form: URLSearchParams, key: string, max = 200): string {
  const value = form.get(key)?.trim() ?? ''
  if (!value || value.length > max)
    throw new AppError(`${key} is required (maximum ${max} characters).`)
  return value
}
function integer(form: URLSearchParams, key: string, minimum = 1, maximum = 1000): number {
  const raw = text(form, key)
  const value = Number(raw)
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum || value > maximum)
    throw new AppError(`${key} must be a whole number from ${minimum} to ${maximum}.`)
  return value
}
function pennies(form: URLSearchParams, key: string, allowZero = false): number {
  const raw = text(form, key)
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(raw))
    throw new AppError(`${key} must be an amount with at most two decimal places.`)
  const [whole, fraction = ''] = raw.split('.')
  const value = Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
  if (!allowZero && !value) throw new AppError(`${key} must be greater than zero.`)
  return value
}
function allow(actor: Staff, ...roles: Role[]) {
  if (!actor.active || !roles.includes(actor.role))
    throw new AppError('Your role cannot perform this action.', 403)
}
function editable(order: WorkOrder) {
  if (!['intake', 'quoted'].includes(order.status))
    throw new AppError('Only intake and quoted work orders can be edited.')
}
function location(form: URLSearchParams): Location {
  const value = text(form, 'location')
  if (!locations.includes(value as Location)) throw new AppError('Choose a valid location.')
  return value as Location
}
function date(form: URLSearchParams) {
  const value = text(form, 'dueDate')
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    !Number.isFinite(Date.parse(value)) ||
    new Date(value).toISOString().slice(0, 10) !== value
  )
    throw new AppError('Choose a valid due date.')
  return value
}
export function execute(
  db: Database,
  actorId: string,
  command: string,
  form: URLSearchParams,
): string {
  const actor = required(
    db.staff.find((person) => person.id === actorId && person.active),
    'Staff account',
  )
  const id = form.get('id') ?? ''
  const now = new Date().toISOString()
  const nextId = (prefix: string) => `${prefix}-${db.nextId++}`
  let target = id
  let redirect = '/work-orders'
  switch (command) {
    case 'customer-create': {
      allow(actor, 'manager', 'advisor')
      const email = text(form, 'email')
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        throw new AppError('Enter a valid email address.')
      if (db.customers.some((customer) => customer.email.toLowerCase() === email.toLowerCase()))
        throw new AppError('A customer already uses this email address.')
      target = nextId('CUS')
      db.customers.push({
        id: target,
        name: text(form, 'name'),
        email,
        phone: text(form, 'phone', 40),
        archived: false,
      })
      redirect = '/customers'
      break
    }
    case 'customer-archive': {
      allow(actor, 'manager')
      const customer = required(
        db.customers.find((item) => item.id === id),
        'Customer',
      )
      if (
        db.orders.some(
          (order) => order.customerId === id && !['completed', 'cancelled'].includes(order.status),
        )
      )
        throw new AppError('Complete or cancel this customer’s open work orders first.')
      customer.archived = true
      redirect = '/customers'
      break
    }
    case 'order-create': {
      allow(actor, 'manager', 'advisor')
      const customer = required(
        db.customers.find((item) => item.id === text(form, 'customerId')),
        'Customer',
      )
      const priority = text(form, 'priority')
      if (!['low', 'normal', 'urgent'].includes(priority))
        throw new AppError('Choose a valid priority.')
      const serial = text(form, 'serial', 80)
      if (
        db.orders.some(
          (order) => order.serial === serial && !['completed', 'cancelled'].includes(order.status),
        )
      )
        throw new AppError('This serial number already has an open work order.')
      target = nextId('WO')
      db.orders.push({
        id: target,
        customerId: customer.id,
        device: text(form, 'device'),
        serial,
        description: text(form, 'description', 2000),
        location: location(form),
        priority: priority as WorkOrder['priority'],
        status: 'intake',
        assigneeId: '',
        dueDate: date(form),
        lines: [],
        labour: 0,
        consumed: false,
        notes: [],
      })
      redirect = `/work-orders/${target}`
      break
    }
    case 'order-update': {
      allow(actor, 'manager', 'advisor')
      const order = required(
        db.orders.find((item) => item.id === id),
        'Work order',
      )
      editable(order)
      order.description = text(form, 'description', 2000)
      order.dueDate = date(form)
      order.location = location(form)
      redirect = `/work-orders/${id}`
      break
    }
    case 'assign': {
      allow(actor, 'manager', 'advisor')
      const order = required(
        db.orders.find((item) => item.id === id),
        'Work order',
      )
      if (['completed', 'cancelled'].includes(order.status))
        throw new AppError('This work order is closed.')
      const staff = required(
        db.staff.find((item) => item.id === text(form, 'assigneeId') && item.role === 'technician'),
        'Technician',
      )
      order.assigneeId = staff.id
      redirect = `/work-orders/${id}`
      break
    }
    case 'note': {
      allow(actor, 'manager', 'advisor', 'technician')
      const order = required(
        db.orders.find((item) => item.id === id),
        'Work order',
      )
      order.notes.push({ text: text(form, 'note', 2000), staffId: actor.id, at: now })
      redirect = `/work-orders/${id}`
      break
    }
    case 'quote-add': {
      allow(actor, 'manager', 'advisor')
      const order = required(
        db.orders.find((item) => item.id === id),
        'Work order',
      )
      editable(order)
      const part = required(
        db.parts.find((item) => item.id === text(form, 'partId')),
        'Part',
      )
      order.lines.push({
        partId: part.id,
        quantity: integer(form, 'quantity', 1, 50),
        unitPrice: part.price,
      })
      order.status = 'intake'
      redirect = `/work-orders/${id}`
      break
    }
    case 'quote-remove': {
      allow(actor, 'manager', 'advisor')
      const order = required(
        db.orders.find((item) => item.id === id),
        'Work order',
      )
      editable(order)
      const index = integer(form, 'line', 0, 1000)
      if (!order.lines[index]) throw new AppError('Quote line was not found.', 404)
      order.lines.splice(index, 1)
      order.status = 'intake'
      redirect = `/work-orders/${id}`
      break
    }
    case 'quote-send': {
      allow(actor, 'manager', 'advisor')
      const order = required(
        db.orders.find((item) => item.id === id),
        'Work order',
      )
      editable(order)
      order.labour = pennies(form, 'labour', true)
      if (quoteTotal(order) === 0) throw new AppError('A quote must include parts or labour.')
      order.status = 'quoted'
      redirect = `/work-orders/${id}`
      break
    }
    case 'quote-approve': {
      allow(actor, 'manager', 'advisor')
      const order = required(
        db.orders.find((item) => item.id === id),
        'Work order',
      )
      if (order.status !== 'quoted') throw new AppError('Send a quote before recording approval.')
      for (const line of order.lines) {
        const stock = required(
          db.parts.find((part) => part.id === line.partId),
          'Part',
        ).stock[order.location]
        if (stock.onHand - stock.reserved < line.quantity)
          throw new AppError('Insufficient available stock for this quote.')
      }
      for (const line of order.lines)
        required(
          db.parts.find((part) => part.id === line.partId),
          'Part',
        ).stock[order.location].reserved += line.quantity
      order.status = 'approved'
      redirect = `/work-orders/${id}`
      break
    }
    case 'repair-start': {
      allow(actor, 'manager', 'technician')
      const order = required(
        db.orders.find((item) => item.id === id),
        'Work order',
      )
      if (order.status !== 'approved' || !order.assigneeId)
        throw new AppError('An approved quote and assigned technician are required.')
      if (actor.role === 'technician' && order.assigneeId !== actor.id)
        throw new AppError('This repair is assigned to another technician.', 403)
      for (const line of order.lines) {
        const part = required(
          db.parts.find((item) => item.id === line.partId),
          'Part',
        )
        part.stock.central.onHand -= line.quantity
        part.stock[order.location].reserved -= line.quantity
      }
      order.consumed = true
      order.status = 'repairing'
      redirect = `/work-orders/${id}`
      break
    }
    case 'repair-complete': {
      allow(actor, 'manager', 'technician')
      const order = required(
        db.orders.find((item) => item.id === id),
        'Work order',
      )
      if (order.status !== 'repairing')
        throw new AppError('Only a repair in progress can be completed.')
      if (actor.role === 'technician' && order.assigneeId !== actor.id)
        throw new AppError('This repair is assigned to another technician.', 403)
      order.notes.push({ text: text(form, 'resolution', 2000), staffId: actor.id, at: now })
      order.status = 'completed'
      redirect = `/work-orders/${id}`
      break
    }
    case 'order-cancel': {
      allow(actor, 'manager', 'advisor')
      const order = required(
        db.orders.find((item) => item.id === id),
        'Work order',
      )
      if (['completed', 'cancelled'].includes(order.status))
        throw new AppError('This work order is already closed.')
      for (const line of order.lines) {
        const stock = required(
          db.parts.find((item) => item.id === line.partId),
          'Part',
        ).stock[order.location]
        if (order.consumed) stock.onHand += line.quantity
        else if (order.status === 'approved') stock.reserved -= line.quantity
      }
      order.notes.push({
        text: `Cancelled: ${text(form, 'reason', 1000)}`,
        staffId: actor.id,
        at: now,
      })
      order.status = 'cancelled'
      redirect = `/work-orders/${id}`
      break
    }
    case 'invoice-issue': {
      allow(actor, 'manager', 'advisor')
      const order = required(
        db.orders.find((item) => item.id === id),
        'Work order',
      )
      if (order.status !== 'completed') throw new AppError('Complete the repair before invoicing.')
      if (db.invoices.some((invoice) => invoice.workOrderId === id))
        throw new AppError('This work order already has an invoice.')
      const subtotal = quoteTotal(order)
      const tax = Math.round(subtotal * 0.2)
      target = nextId('INV')
      db.invoices.push({
        id: target,
        workOrderId: id,
        subtotal,
        discount: 0,
        tax,
        total: subtotal + tax,
        payments: [],
        refunds: [],
      })
      redirect = `/invoices/${target}`
      break
    }
    case 'invoice-discount': {
      allow(actor, 'manager', 'advisor')
      const invoice = required(
        db.invoices.find((item) => item.id === id),
        'Invoice',
      )
      if (invoice.payments.length)
        throw new AppError('A paid or partially paid invoice cannot be discounted.')
      const discount = pennies(form, 'discount', true)
      if (discount > invoice.subtotal) throw new AppError('Discount cannot exceed the subtotal.')
      invoice.discount = discount
      invoice.tax = Math.round((invoice.subtotal - discount) * 0.2)
      invoice.total = invoice.subtotal - discount + invoice.tax
      redirect = `/invoices/${id}`
      break
    }
    case 'payment': {
      allow(actor, 'manager', 'advisor')
      const invoice = required(
        db.invoices.find((item) => item.id === id),
        'Invoice',
      )
      const amount = pennies(form, 'amount')
      if (amount > balance(invoice))
        throw new AppError('Payment cannot exceed the outstanding balance.')
      invoice.payments.push({ reference: text(form, 'reference', 80), amount, at: now })
      redirect = `/invoices/${id}`
      break
    }
    case 'refund': {
      allow(actor, 'manager')
      const invoice = required(
        db.invoices.find((item) => item.id === id),
        'Invoice',
      )
      const amount = pennies(form, 'amount')
      const reference = text(form, 'reference', 80)
      if (amount > sum(invoice.payments.map((payment) => payment.amount)))
        throw new AppError('Refund cannot exceed collected payments.')
      if (invoice.refunds.some((refund) => refund.reference === reference))
        throw new AppError('This refund reference already exists.')
      invoice.refunds.push({ reference, amount, at: now })
      redirect = `/invoices/${id}`
      break
    }
    case 'purchase-create': {
      allow(actor, 'manager')
      const part = required(
        db.parts.find((item) => item.id === text(form, 'partId')),
        'Part',
      )
      target = nextId('PO')
      db.purchases.push({
        id: target,
        supplier: text(form, 'supplier'),
        partId: part.id,
        location: location(form),
        quantity: integer(form, 'quantity'),
        received: 0,
        receipts: [],
      })
      redirect = '/purchasing'
      break
    }
    case 'purchase-receive': {
      allow(actor, 'manager', 'advisor')
      const purchase = required(
        db.purchases.find((item) => item.id === id),
        'Purchase order',
      )
      const quantity = integer(form, 'quantity')
      if (quantity > purchase.quantity - purchase.received)
        throw new AppError('Receipt exceeds the outstanding quantity.')
      purchase.received += quantity
      purchase.receipts.push({ reference: text(form, 'reference', 80), quantity, at: now })
      required(
        db.parts.find((part) => part.id === purchase.partId),
        'Part',
      ).stock[purchase.location].onHand += quantity
      redirect = '/purchasing'
      break
    }
    default:
      throw new AppError('Unknown action.', 404)
  }
  db.audit.push({ id: nextId('EV'), actor: actor.id, action: command, target, at: now })
  return redirect
}

export function searchOrders(db: Database, query: URLSearchParams): WorkOrder[] {
  let orders = db.orders.filter(
    (order) => !query.get('status') || order.status === query.get('status'),
  )
  if (query.get('location'))
    orders = orders.filter((order) => order.location === query.get('location'))
  if (query.get('q')) {
    const term = query.get('q')!.trim()
    orders = orders.filter((order) =>
      `${order.id} ${order.device} ${order.serial} ${db.customers.find((customer) => customer.id === order.customerId)?.name}`.includes(
        term,
      ),
    )
  }
  if (query.get('sort') === 'priority') orders.sort((a, b) => a.priority.localeCompare(b.priority))
  else orders.sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  return orders
}
export const lowStock = (db: Database) =>
  db.parts.flatMap((part) =>
    locations
      .filter(
        (place) =>
          part.stock[place].onHand - part.stock[place].reserved < part.stock[place].reorderAt,
      )
      .map((place) => ({
        part,
        place,
        available: part.stock[place].onHand - part.stock[place].reserved,
      })),
  )
