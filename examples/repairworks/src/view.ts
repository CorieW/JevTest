// Server-rendered accessible forms expose the shop's ordinary workflows without evaluation metadata.
import { AppError, balance, locations, quoteTotal, required, sum } from './domain.js'
import type { Database, Staff, WorkOrder } from './domain.js'
import { lowStock, searchOrders } from './service.js'
import { styles } from './styles.js'

export const escape = (value: unknown) =>
  String(value).replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!,
  )
const money = (value: number) =>
  new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value / 100)
const badge = (value: string) => `<span class="badge ${escape(value)}">${escape(value)}</span>`
const input = (label: string, name: string, value = '', type = 'text', attributes = '') =>
  `<label>${escape(label)}<input name="${name}" id="${name}" type="${type}" value="${escape(value)}" required ${attributes}></label>`
const textarea = (label: string, name: string, value = '') =>
  `<label>${escape(label)}<textarea name="${name}" id="${name}" required maxlength="2000">${escape(value)}</textarea></label>`
const select = (label: string, name: string, options: [string, string][], current = '') =>
  `<label>${escape(label)}<select name="${name}" id="${name}">${options.map(([value, title]) => `<option value="${escape(value)}" ${value === current ? 'selected' : ''}>${escape(title)}</option>`).join('')}</select></label>`
const table = (headers: string[], rows: string[][]) =>
  `<div class="table-scroll"><table><thead><tr>${headers.map((heading) => `<th scope="col">${heading}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="empty">No records match.</td></tr>`}</tbody></table></div>`
const card = (title: string, body: string) =>
  `<section class="card"><h2>${escape(title)}</h2>${body}</section>`
const document = (title: string, content: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · RepairWorks</title><style>${styles}</style></head><body>${content}</body></html>`
export function loginPage(db: Database, csrf: string) {
  return document(
    'Choose a workspace account',
    `<main class="session"><div class="eyebrow">RepairWorks / local demo</div><h1>The repair desk, organised.</h1><p class="muted">Choose a synthetic staff account to open the workspace. Account switching is a local demonstration feature.</p>${db.staff
      .filter((staff) => staff.active)
      .map(
        (staff) =>
          `<form method="post" action="/session"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="staffId" value="${staff.id}"><button>${escape(staff.name)}<small>${staff.role}</small></button></form>`,
      )
      .join('')}</main>`,
  )
}
export function errorPage(message: string, status: number) {
  return document(
    'Request could not be completed',
    `<main class="session"><div class="eyebrow">RepairWorks / ${status}</div><h1>Request could not be completed</h1><p role="alert" class="notice error">${escape(message)}</p><a class="button" href="/work-orders">Return to work orders</a></main>`,
  )
}
export function render(db: Database, actor: Staff, url: URL, csrf: string): string {
  const path = url.pathname
  const manager = actor.role === 'manager'
  const frontDesk = manager || actor.role === 'advisor'
  const form = (command: string, id: string, fields: string, label: string, className = '') => {
    const controls = fields.replace(
      / id="([^"]+)"/g,
      (_match, name: string) => ` id="${escape(`${command}-${id}-${name}`)}"`,
    )
    return `<form method="post" action="/actions/${command}" aria-label="${escape(`${label} ${id}`)}" class="${className}"><input type="hidden" name="csrf" value="${escape(csrf)}"><input type="hidden" name="revision" value="${db.revision}"><input type="hidden" name="id" value="${escape(id)}">${controls}<button type="submit">${escape(label)}</button></form>`
  }
  const customerName = (id: string) =>
    escape(db.customers.find((item) => item.id === id)?.name ?? id)
  const staffName = (id: string) =>
    escape(db.staff.find((item) => item.id === id)?.name ?? 'Unassigned')
  const partName = (id: string) => escape(db.parts.find((item) => item.id === id)?.name ?? id)
  const placeSelect = (current = '') =>
    select(
      'Location',
      'location',
      locations.map((place) => [
        place,
        place === 'central' ? 'Central workshop' : 'Riverside desk',
      ]),
      current,
    )
  const partSelect = () =>
    select(
      'Part',
      'partId',
      db.parts.map((part) => [part.id, `${part.sku} · ${part.name} · ${money(part.price)}`]),
    )
  const orderRows = (orders: WorkOrder[]) =>
    orders.map((order) => [
      `<a href="/work-orders/${order.id}"><strong>${order.id}</strong></a><small>${escape(order.device)}</small>`,
      customerName(order.customerId),
      badge(order.status),
      badge(order.priority),
      escape(order.location),
      escape(order.dueDate),
      staffName(order.assigneeId),
    ])
  let title = 'Service overview'
  let subtitle = 'A clear view of the work moving through your workshops.'
  let body = ''
  let action = ''
  if (path === '/') {
    const open = db.orders.filter((order) => !['completed', 'cancelled'].includes(order.status))
    const alerts = lowStock(db)
    body = `<div class="metrics">${[
      ['Open work orders', String(open.length)],
      ['Awaiting approval', String(open.filter((order) => order.status === 'quoted').length)],
      ['Outstanding invoices', money(sum(db.invoices.map(balance)))],
      ['Stock alerts', String(alerts.length)],
    ]
      .map(
        ([label, value]) =>
          `<div class="metric"><span>${label}</span><strong>${value}</strong></div>`,
      )
      .join(
        '',
      )}</div><div class="grid">${card('Work coming due', table(['Work order', 'Customer', 'Status', 'Priority', 'Location', 'Due', 'Assigned'], orderRows([...open].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 8))))}<div class="stack">${card(
      'Replenishment',
      table(
        ['Part', 'Location', 'Available'],
        alerts.map(({ part, place, available }) => [
          escape(part.name),
          escape(place),
          String(available),
        ]),
      ),
    )}${card('Workshop rhythm', '<p class="muted">Intake → quote → customer approval → repair → invoice.</p><p>Confirm the customer’s approval before reserving parts. Keep repair notes with the work order.</p><a href="/purchasing">Review purchase orders →</a>')}</div></div>`
    if (frontDesk) action = '<a class="button" href="/work-orders/new">New work order</a>'
  } else if (path === '/work-orders') {
    title = 'Work orders'
    subtitle = 'Track every device from first conversation to collection.'
    if (frontDesk) action = '<a class="button" href="/work-orders/new">New work order</a>'
    const query = url.searchParams
    body = card(
      'Workshop queue',
      `<form class="toolbar" method="get">${input('Search customer, device or reference', 'q', query.get('q') ?? '').replace(' required ', ' ')}${select('Status', 'status', [['', 'All statuses'], ...['intake', 'quoted', 'approved', 'repairing', 'completed', 'cancelled'].map((value): [string, string] => [value, value])], query.get('status') ?? '')}${select('Location', 'location', [['', 'Both locations'], ...locations.map((value): [string, string] => [value, value])], query.get('location') ?? '')}${select(
        'Sort',
        'sort',
        [
          ['due', 'Due date'],
          ['priority', 'Priority'],
        ],
        query.get('sort') ?? '',
      )}<button>Filter</button></form>${table(['Work order', 'Customer', 'Status', 'Priority', 'Location', 'Due', 'Assigned'], orderRows(searchOrders(db, query)))}`,
    )
  } else if (path === '/work-orders/new') {
    title = 'New work order'
    subtitle = 'Record the device and customer’s request before preparing a quote.'
    body = `<div class="grid">${card(
      'Device intake',
      form(
        'order-create',
        '',
        `${select(
          'Customer',
          'customerId',
          db.customers.map((customer) => [
            customer.id,
            `${customer.name}${customer.archived ? ' (archived)' : ''}`,
          ]),
        )}<div class="two">${input('Device model', 'device')}${input('Serial number', 'serial')}</div>${textarea('Reported problem', 'description')}<div class="two">${placeSelect()}${select(
          'Priority',
          'priority',
          [
            ['normal', 'Normal'],
            ['urgent', 'Urgent'],
            ['low', 'Low'],
          ],
        )}</div>${input('Due date', 'dueDate', '2026-09-25', 'date')}`,
        'Create work order',
      ),
    )}${card('At the counter', '<p>Check the serial number, confirm contact details, and describe the symptom in the customer’s words.</p><p class="muted">The quote records parts and labour separately. Parts are reserved only after customer approval.</p>')}</div>`
  } else if (path.startsWith('/work-orders/')) {
    const order = required(
      db.orders.find((item) => item.id === path.split('/')[2]),
      'Work order',
    )
    title = order.id
    subtitle = `${order.device} · ${order.serial}`
    action = badge(order.status)
    const editable = ['intake', 'quoted'].includes(order.status)
    const invoice = db.invoices.find((item) => item.workOrderId === order.id)
    const quote = table(
      ['Part', 'Quantity', 'Unit price', 'Line total', ''],
      order.lines.map((line, index) => [
        partName(line.partId),
        String(line.quantity),
        money(line.unitPrice),
        money(line.unitPrice * line.quantity),
        frontDesk && editable
          ? form(
              'quote-remove',
              order.id,
              `<input type="hidden" name="line" value="${index}">`,
              'Remove',
              'compact',
            )
          : '',
      ]),
    )
    let controls = ''
    if (frontDesk && editable)
      controls += `<div class="section">${form('quote-add', order.id, `${partSelect()}${input('Quantity', 'quantity', '1', 'number', 'min="1" max="50"')}`, 'Add part')}</div><div class="section">${form('quote-send', order.id, input('Labour (£, before VAT)', 'labour', (order.labour / 100).toFixed(2), 'number', 'min="0" step="0.01"'), 'Send quote')}</div>`
    if (frontDesk && order.status === 'quoted')
      controls += `<div class="section">${form('quote-approve', order.id, '<p>Record the customer’s approval and reserve the quoted parts.</p>', 'Record approval')}</div>`
    if ((manager || actor.role === 'technician') && order.status === 'approved')
      controls += `<div class="section">${form('repair-start', order.id, '', 'Start repair')}</div>`
    if ((manager || actor.role === 'technician') && order.status === 'repairing')
      controls += `<div class="section">${form('repair-complete', order.id, textarea('Resolution and quality checks', 'resolution'), 'Complete repair')}</div>`
    if (frontDesk && order.status === 'completed' && !invoice)
      controls += `<div class="section">${form('invoice-issue', order.id, '', 'Issue invoice')}</div>`
    if (invoice)
      controls += `<p class="top-gap"><a class="button" href="/invoices/${invoice.id}">View ${invoice.id}</a></p>`
    const notes = `<ul class="timeline">${order.notes.map((note) => `<li><small>${staffName(note.staffId)} · ${escape(note.at.slice(0, 16).replace('T', ' '))}</small>${escape(note.text)}</li>`).join('')}</ul>${form('note', order.id, textarea('Add a work note', 'note'), 'Save note')}`
    body = `<div class="grid"><div class="stack">${card('Quote & repair', `${quote}<dl class="summary"><dt>Labour</dt><dd>${money(order.labour)}</dd><dt>Subtotal</dt><dd>${money(quoteTotal(order))}</dd><dt>VAT · 20%</dt><dd>${money(Math.round(quoteTotal(order) * 0.2))}</dd><dt>Customer total</dt><dd class="total">${money(Math.round(quoteTotal(order) * 1.2))}</dd></dl>${controls}`)}${card('Activity & notes', notes)}</div><div class="stack">${card('Job details', `<dl class="summary"><dt>Customer</dt><dd>${customerName(order.customerId)}</dd><dt>Location</dt><dd>${order.location}</dd><dt>Priority</dt><dd>${badge(order.priority)}</dd><dt>Due</dt><dd>${order.dueDate}</dd><dt>Technician</dt><dd>${staffName(order.assigneeId)}</dd></dl><p>${escape(order.description)}</p>${frontDesk && editable ? `<div class="section">${form('order-update', order.id, `${textarea('Reported problem', 'description', order.description)}${input('Due date', 'dueDate', order.dueDate, 'date')}${placeSelect(order.location)}`, 'Update details')}</div>` : ''}`)}${
      frontDesk && !['completed', 'cancelled'].includes(order.status)
        ? card(
            'Assignment',
            form(
              'assign',
              order.id,
              select(
                'Technician',
                'assigneeId',
                db.staff
                  .filter((staff) => staff.role === 'technician')
                  .map((staff) => [staff.id, `${staff.name}${staff.active ? '' : ' (inactive)'}`]),
                order.assigneeId,
              ),
              'Assign technician',
            ),
          )
        : ''
    }${frontDesk && !['completed', 'cancelled'].includes(order.status) ? card('Cancel work order', form('order-cancel', order.id, textarea('Cancellation reason', 'reason'), 'Cancel work order')) : ''}</div></div>`
  } else if (path === '/customers') {
    title = 'Customers'
    subtitle = 'Contact records and service relationships.'
    body = `<div class="grid">${card(
      'Customer directory',
      table(
        ['Customer', 'Contact', 'Open jobs', 'Status', ''],
        db.customers.map((customer) => [
          escape(customer.name),
          `${escape(customer.email)}<small>${escape(customer.phone)}</small>`,
          String(
            db.orders.filter(
              (order) =>
                order.customerId === customer.id &&
                !['completed', 'cancelled'].includes(order.status),
            ).length,
          ),
          badge(customer.archived ? 'archived' : 'active'),
          manager && !customer.archived
            ? form('customer-archive', customer.id, '', 'Archive', 'compact')
            : '',
        ]),
      ),
    )}${frontDesk ? card('Add customer', form('customer-create', '', `${input('Customer or business name', 'name')}${input('Email address', 'email', '', 'email')}${input('Phone number', 'phone', '', 'tel')}`, 'Create customer')) : ''}</div>`
  } else if (path === '/inventory') {
    title = 'Inventory'
    subtitle = 'Parts on the shelf, committed to repairs, and ready to reorder.'
    body = card(
      'Stock by location',
      table(
        ['Part / SKU', 'Location', 'On hand', 'Reserved', 'Available', 'Reorder at', 'Retail'],
        db.parts.flatMap((part) =>
          locations.map((place) => [
            `<strong>${escape(part.name)}</strong><small>${escape(part.sku)}</small>`,
            place,
            String(part.stock[place].onHand),
            String(part.stock[place].reserved),
            String(part.stock[place].onHand - part.stock[place].reserved),
            String(part.stock[place].reorderAt),
            money(part.price),
          ]),
        ),
      ),
    )
    action = '<a class="button" href="/purchasing">Purchase orders</a>'
  } else if (path === '/purchasing') {
    title = 'Purchasing'
    subtitle = 'Order replenishments and book supplier deliveries into the right workshop.'
    body = `<div class="grid"><div class="stack">${db.purchases
      .map((purchase) =>
        card(
          `${purchase.id} · ${purchase.supplier}`,
          `<p>${partName(purchase.partId)} · ${purchase.location}</p><dl class="summary"><dt>Ordered</dt><dd>${purchase.quantity}</dd><dt>Received</dt><dd>${purchase.received}</dd><dt>Outstanding</dt><dd>${purchase.quantity - purchase.received}</dd></dl>${table(
            ['Delivery reference', 'Quantity', 'Date'],
            purchase.receipts.map((receipt) => [
              escape(receipt.reference),
              String(receipt.quantity),
              escape(receipt.at.slice(0, 10)),
            ]),
          )}${frontDesk && purchase.received < purchase.quantity ? `<div class="section">${form('purchase-receive', purchase.id, `${input('Delivery reference', 'reference')}${input('Received quantity', 'quantity', '1', 'number', `min="1" max="${purchase.quantity - purchase.received}"`)}`, 'Receive delivery')}</div>` : ''}`,
        ),
      )
      .join(
        '',
      )}</div>${manager ? card('New purchase order', form('purchase-create', '', `${input('Supplier', 'supplier')}${partSelect()}${placeSelect()}${input('Order quantity', 'quantity', '10', 'number', 'min="1" max="1000"')}`, 'Create purchase order')) : ''}</div>`
  } else if (path === '/invoices') {
    title = 'Invoices'
    subtitle = 'Review issued invoices, payments and refunds.'
    body = card(
      'Receivables',
      table(
        ['Invoice', 'Work order', 'Customer', 'Total', 'Balance', 'Status'],
        db.invoices.map((invoice) => [
          `<a href="/invoices/${invoice.id}"><strong>${invoice.id}</strong></a>`,
          `<a href="/work-orders/${invoice.workOrderId}">${invoice.workOrderId}</a>`,
          customerName(db.orders.find((order) => order.id === invoice.workOrderId)!.customerId),
          money(invoice.total),
          money(balance(invoice)),
          badge(balance(invoice) === 0 ? 'paid' : 'outstanding'),
        ]),
      ),
    )
  } else if (path.startsWith('/invoices/')) {
    const invoice = required(
      db.invoices.find((item) => item.id === path.split('/')[2]),
      'Invoice',
    )
    const order = required(
      db.orders.find((item) => item.id === invoice.workOrderId),
      'Work order',
    )
    title = invoice.id
    subtitle = `${order.id} · ${db.customers.find((item) => item.id === order.customerId)!.name}`
    let controls = ''
    if (frontDesk && balance(invoice) > 0)
      controls += card(
        'Record payment',
        form(
          'payment',
          invoice.id,
          `${input('Payment reference', 'reference')}${input('Amount (£)', 'amount', '', 'number', 'min="0.01" step="0.01"')}`,
          'Record payment',
        ),
      )
    if (frontDesk && invoice.payments.length === 0)
      controls += card(
        'Discount',
        form(
          'invoice-discount',
          invoice.id,
          input('Discount (£, before VAT)', 'discount', '0.00', 'number', 'min="0" step="0.01"'),
          'Apply discount',
        ),
      )
    if (manager && invoice.payments.length)
      controls += card(
        'Refund',
        form(
          'refund',
          invoice.id,
          `${input('Refund reference', 'reference')}${input('Refund amount (£)', 'amount', '', 'number', 'min="0.01" step="0.01"')}`,
          'Record refund',
        ),
      )
    body = `<div class="grid"><div class="stack">${card('Invoice summary', `<dl class="summary"><dt>Subtotal</dt><dd>${money(invoice.subtotal)}</dd><dt>Discount</dt><dd>${money(invoice.discount)}</dd><dt>VAT · 20%</dt><dd>${money(invoice.tax)}</dd><dt>Invoice total</dt><dd>${money(invoice.total)}</dd><dt>Outstanding</dt><dd class="total">${money(balance(invoice))}</dd></dl>`)}${card(
      'Payments',
      table(
        ['Reference', 'Amount', 'Date'],
        invoice.payments.map((payment) => [
          escape(payment.reference),
          money(payment.amount),
          escape(payment.at.slice(0, 10)),
        ]),
      ),
    )}${card(
      'Refunds',
      table(
        ['Reference', 'Amount', 'Date'],
        invoice.refunds.map((refund) => [
          escape(refund.reference),
          money(refund.amount),
          escape(refund.at.slice(0, 10)),
        ]),
      ),
    )}</div><div class="stack">${controls}</div></div>`
  } else if (path === '/team') {
    title = 'Team & permissions'
    subtitle = 'Staff availability and workspace responsibilities.'
    body = `<div class="grid">${card(
      'Staff directory',
      table(
        ['Name', 'Role', 'Status', 'Assigned open jobs'],
        db.staff.map((staff) => [
          escape(staff.name),
          escape(staff.role),
          badge(staff.active ? 'active' : 'inactive'),
          String(
            db.orders.filter(
              (order) =>
                order.assigneeId === staff.id && !['completed', 'cancelled'].includes(order.status),
            ).length,
          ),
        ]),
      ),
    )}${card('Role policy', '<p><strong>Manager</strong><br>All workshop actions, discounts, refunds, purchasing, and customer archive.</p><p><strong>Advisor</strong><br>Intake, quotes, assignments, cancellation, invoices, payments, and delivery receipts.</p><p><strong>Technician</strong><br>Start and complete assigned repairs. Add work notes.</p>')}</div>`
  } else if (path === '/activity') {
    title = 'Activity log'
    subtitle = 'Recorded changes across the workspace.'
    body = card(
      'Recent activity',
      table(
        ['When', 'Staff', 'Action', 'Record'],
        db.audit
          .slice(-100)
          .reverse()
          .map((entry) => [
            escape(entry.at.replace('T', ' ').slice(0, 19)),
            staffName(entry.actor),
            escape(entry.action),
            escape(entry.target),
          ]),
      ),
    )
  } else {
    throw new AppError('This page does not exist.', 404)
  }
  const navigation = [
    ['/', 'Overview'],
    ['/work-orders', 'Work orders'],
    ['/customers', 'Customers'],
    ['/inventory', 'Inventory'],
    ['/purchasing', 'Purchasing'],
    ['/invoices', 'Invoices'],
    ['/team', 'Team'],
    ['/activity', 'Activity'],
  ]
  return document(
    title,
    `<aside class="sidebar"><a class="brand" href="/">RepairWorks<small>SERVICE WORKSPACE</small></a><nav aria-label="Main navigation">${navigation.map(([href, label]) => `<a href="${href}" class="${path === href || (href !== '/' && path.startsWith(`${href}/`)) ? 'active' : ''}">${label}</a>`).join('')}</nav><footer>Central + Riverside<br><a href="/session">Switch demo account</a></footer></aside><main class="workspace"><header class="topbar"><span>OPERATIONS / WORKSHOP</span><span><strong>${escape(actor.name)}</strong> · ${actor.role}</span></header>${url.searchParams.has('saved') ? '<p class="notice" role="status">Changes saved.</p>' : ''}<div class="heading"><div><div class="eyebrow">RepairWorks</div><h1>${escape(title)}</h1><p class="muted">${escape(subtitle)}</p></div>${action}</div>${body}</main>`,
  )
}
