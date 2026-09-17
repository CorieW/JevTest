// Thirty synthetic account fixtures per operation, paired across healthy and faulty implementations.
import { pairCases } from '../benchmarks/contracts.js'
export const ledgerCases = ['transfer', 'refund', 'freeze', 'limit'].flatMap((workflow) =>
  Array.from({ length: 30 }, (_, variant) => {
    const amount = 10 + variant * 3
    const sourceBalance = 500 + variant * 11
    const recipient = ['Aster', 'Birch', 'Clover'][variant % 3]!
    const limit = workflow === 'limit' ? amount - 1 : amount + 50
    const input = {
      workflow,
      amount,
      sourceBalance,
      recipient,
      limit,
      fee: variant % 3,
      paymentId: `P-${200 + variant}`,
      target: ['Travel', 'Supplies', 'Research'][variant % 3]!,
    }
    const goal = {
      transfer: `Transfer ${amount} credits from Primary to ${recipient}, paying exactly ${input.fee} credits in fees. Debit Primary once and credit the recipient once.`,
      refund: `Refund payment ${input.paymentId} for ${amount} credits to Primary. Preserve its record marked refunded and restore the balance exactly once.`,
      freeze: `Freeze the ${input.target} card. Keep the other card active and leave account balances unchanged.`,
      limit: `Attempt a ${amount}-credit transfer to ${recipient}. The per-transfer limit is ${limit}; verify rejection with no balance change, fee, or ledger entry.`,
    }[workflow]!
    const fault = {
      transfer: variant % 2 ? 'duplicate-debit' : 'wrong-recipient',
      refund: variant % 2 ? 'double-refund' : 'unmarked-refund',
      freeze: variant % 2 ? 'freeze-all-cards' : 'wrong-card',
      limit: variant % 2 ? 'rejection-fee' : 'limit-bypass',
    }[workflow]!
    return pairCases('ledger', workflow, variant, input, goal, [goal], fault)
  }).flat(),
)
