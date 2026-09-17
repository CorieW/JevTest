// Atomic wallet operations with balanced journal entries, balance guards, and refund state checks.
import { ledgerCommand } from './domain.js'
import type { LedgerCommand, LedgerData, LedgerFault, LedgerPolicy } from './domain.js'
export function executeLedger(
  state: LedgerData,
  input: LedgerCommand,
  policy: LedgerPolicy,
  fault?: LedgerFault | null,
): LedgerData {
  const command = ledgerCommand.parse(input)
  const next = structuredClone(state)
  const entry = (account: string, amount: number, kind: string) =>
    next.entries.push({ id: `J-${next.entries.length + 1}`, account, amount, kind })
  if (command.operation === 'transfer') {
    if (![policy.recipient, 'Other'].includes(command.recipient))
      return { ...next, result: 'recipient-not-found' }
    if (
      (command.amount > policy.limit && fault !== 'limit-bypass') ||
      command.amount + policy.fee > next.primary
    ) {
      if (fault === 'rejection-fee') {
        next.primary--
        next.fees++
      }
      return { ...next, result: 'rejected' }
    }
    const recipient = fault === 'wrong-recipient' ? 'Other' : command.recipient
    next.primary -= command.amount + policy.fee
    if (recipient === policy.recipient) next.recipient += command.amount
    else next.other += command.amount
    next.fees += policy.fee
    entry('Primary', -command.amount - policy.fee, 'transfer')
    entry(recipient, command.amount, 'transfer')
    if (policy.fee) entry('Fees', policy.fee, 'fee')
    if (fault === 'duplicate-debit') {
      next.primary -= command.amount
      entry('Primary', -command.amount, 'debit')
    }
    next.result = 'transferred'
  } else if (command.operation === 'refund') {
    if (command.paymentId !== policy.paymentId) return { ...next, result: 'payment-not-found' }
    if (next.paymentStatus !== 'settled') return { ...next, result: 'already-refunded' }
    next.primary += policy.paymentAmount * (fault === 'double-refund' ? 2 : 1)
    if (fault !== 'unmarked-refund') next.paymentStatus = 'refunded'
    entry('Primary', policy.paymentAmount, 'refund')
    entry('Settlement', -policy.paymentAmount, 'refund')
    next.result = 'refunded'
  } else {
    const card = next.cards.find((c) => c.name === command.card)
    if (!card) return { ...next, result: 'card-not-found' }
    if (fault === 'wrong-card') next.cards.find((c) => c.name !== command.card)!.frozen = true
    else card.frozen = true
    if (fault === 'freeze-all-cards')
      next.cards.forEach((c) => {
        c.frozen = true
      })
    next.result = 'frozen'
  }
  return next
}
