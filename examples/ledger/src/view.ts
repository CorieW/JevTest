// Wallet screens expose accounts, payment status, card controls, and the persisted journal.
import type { Field, Inputs, View } from '../../../test/benchmarks/contracts.js'
import { controls, stats, table } from '../../../test/benchmarks/ui.js'
import type { LedgerData, LedgerPolicy } from './domain.js'
export function ledgerFields(operation: string, input: Inputs): Field[] {
  if (operation === 'refund')
    return [
      {
        name: 'paymentId',
        label: 'Payment to refund',
        type: 'select',
        fixture: 'paymentId',
        options: [
          { value: String(input.paymentId), label: `${input.paymentId} · ${input.amount} credits` },
        ],
      },
    ]
  if (operation === 'freeze')
    return [
      {
        name: 'card',
        label: 'Card',
        type: 'select',
        fixture: 'target',
        options: [String(input.target), 'Backup', 'Spare'].map((value) => ({
          value,
          label: value,
        })),
      },
    ]
  return [
    {
      name: 'recipient',
      label: 'Recipient account',
      type: 'select',
      fixture: 'recipient',
      options: [String(input.recipient), 'Other'].map((value) => ({ value, label: value })),
    },
    { name: 'amount', label: 'Amount in credits', type: 'number', fixture: 'amount' },
  ]
}
export function renderLedger(view: View): string {
  const data = view.data as unknown as LedgerData & { policy: LedgerPolicy }
  return (
    stats([
      ['Available balance', `${data.primary} credits`],
      ['Transfer limit', `${data.policy.limit} credits`],
      ['Transfer fee', `${data.policy.fee} credits`],
    ]) +
    controls(view) +
    table(
      'Accounts',
      ['Account', 'Balance'],
      [
        ['Primary', data.primary],
        [data.policy.recipient, data.recipient],
        ['Other', data.other],
        ['Collected fees', data.fees],
      ],
    ) +
    table(
      'Settled payment',
      ['Payment', 'Original amount', 'Status'],
      [[data.policy.paymentId, data.policy.paymentAmount, data.paymentStatus]],
    ) +
    table(
      'Cards',
      ['Card', 'Status'],
      data.cards.map((c) => [c.name, c.frozen ? 'Frozen' : 'Active']),
    ) +
    table(
      'Journal',
      ['Entry', 'Account', 'Type', 'Amount'],
      data.entries.map((e) => [e.id, e.account, e.kind, e.amount]),
    )
  )
}
