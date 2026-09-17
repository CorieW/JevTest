// Wallet records and validated commands, independent of browsers and benchmark scenarios.
import { z } from 'zod'
export interface LedgerData {
  primary: number
  recipient: number
  other: number
  fees: number
  entries: { id: string; account: string; amount: number; kind: string }[]
  paymentStatus: string
  cards: { name: string; frozen: boolean }[]
  result: string
}
export interface LedgerPolicy {
  fee: number
  limit: number
  recipient: string
  paymentId: string
  paymentAmount: number
}
const text = z.string().trim().min(1).max(120)
const amount = z.coerce.number().int().positive().max(1_000_000)
export const ledgerCommand = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('transfer'), recipient: text, amount }),
  z.object({ operation: z.literal('refund'), paymentId: text }),
  z.object({ operation: z.literal('freeze'), card: text }),
])
export type LedgerCommand = z.infer<typeof ledgerCommand>
export function parseLedgerCommand(values: Record<string, string>, operation: string) {
  return ledgerCommand.parse({
    ...values,
    operation: operation === 'limit' ? 'transfer' : operation,
  })
}
export type LedgerFault =
  | 'limit-bypass'
  | 'rejection-fee'
  | 'wrong-recipient'
  | 'duplicate-debit'
  | 'double-refund'
  | 'unmarked-refund'
  | 'wrong-card'
  | 'freeze-all-cards'
