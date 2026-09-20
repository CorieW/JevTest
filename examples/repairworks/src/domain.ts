// RepairWorks business records use integer pennies and explicit lifecycle states.
export const locations = ['central', 'riverside'] as const
export type Location = (typeof locations)[number]
export type Role = 'manager' | 'advisor' | 'technician'
export type Status = 'intake' | 'quoted' | 'approved' | 'repairing' | 'completed' | 'cancelled'
export interface Staff {
  id: string
  name: string
  role: Role
  active: boolean
}
export interface Customer {
  id: string
  name: string
  email: string
  phone: string
  archived: boolean
}
export interface Stock {
  onHand: number
  reserved: number
  reorderAt: number
}
export interface Part {
  id: string
  name: string
  sku: string
  price: number
  cost: number
  stock: Record<Location, Stock>
}
export interface QuoteLine {
  partId: string
  quantity: number
  unitPrice: number
}
export interface WorkOrder {
  id: string
  customerId: string
  device: string
  serial: string
  description: string
  location: Location
  priority: 'low' | 'normal' | 'urgent'
  status: Status
  assigneeId: string
  dueDate: string
  lines: QuoteLine[]
  labour: number
  consumed: boolean
  notes: { text: string; staffId: string; at: string }[]
}
export interface Invoice {
  id: string
  workOrderId: string
  subtotal: number
  discount: number
  tax: number
  total: number
  payments: { reference: string; amount: number; at: string }[]
  refunds: { reference: string; amount: number; at: string }[]
}
export interface Purchase {
  id: string
  supplier: string
  partId: string
  location: Location
  quantity: number
  received: number
  receipts: { reference: string; quantity: number; at: string }[]
}
export interface Database {
  version: 1
  revision: number
  nextId: number
  customers: Customer[]
  staff: Staff[]
  parts: Part[]
  orders: WorkOrder[]
  invoices: Invoice[]
  purchases: Purchase[]
  audit: { id: string; actor: string; action: string; target: string; at: string }[]
}
export class AppError extends Error {
  constructor(
    message: string,
    public status = 422,
  ) {
    super(message)
  }
}
export const sum = (values: number[]) => values.reduce((total, value) => total + value, 0)
export const quoteTotal = (order: WorkOrder) =>
  order.labour + sum(order.lines.map((line) => line.quantity * line.unitPrice))
export const balance = (invoice: Invoice) =>
  invoice.total -
  sum(invoice.payments.map((payment) => payment.amount)) +
  sum(invoice.refunds.map((refund) => refund.amount))
export function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new AppError(`${label} was not found.`, 404)
  return value
}
