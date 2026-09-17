// Exact wallet requirements are calculated independently from the service's mutation code.
import type { Inputs } from '../../test/benchmarks/contracts.js'
import type { Check } from '../../src/types.js'
import type { LedgerState } from './app.js'
export function ledgerOracle(state: LedgerState, input: Inputs): Check {
  const workflow = String(input.workflow)
  const amount = Number(input.amount)
  const fee = Number(input.fee)
  const primary =
    Number(input.sourceBalance) +
    (workflow === 'refund' ? amount : workflow === 'transfer' ? -amount - fee : 0)
  const recipient = workflow === 'transfer' ? 100 + amount : 100
  const entries = workflow === 'transfer' ? 2 + Number(fee > 0) : workflow === 'refund' ? 2 : 0
  const result = {
    transfer: 'transferred',
    refund: 'refunded',
    freeze: 'frozen',
    limit: 'rejected',
  }[workflow]
  return {
    complete: state.screen === 'done',
    assertions: [
      {
        name: 'Journal debits and credits balance',
        passed: state.entries.reduce((total, entry) => total + entry.amount, 0) === 0,
      },
      {
        name: 'Requested workflow completed',
        passed:
          (state.operation === workflow ||
            (['transfer', 'limit'].includes(workflow) &&
              ['transfer', 'limit'].includes(state.operation))) &&
          state.result === result,
        expected: result ?? null,
        actual: state.result,
      },
      {
        name: 'Primary balance changed exactly once by the permitted amount',
        passed: state.primary === primary,
        expected: primary,
        actual: state.primary,
      },
      {
        name: 'Only the intended recipient receives credits',
        passed: state.recipient === recipient && state.other === 100,
        expected: recipient,
        actual: state.recipient,
      },
      {
        name: 'Only successful transfers incur the stated fee',
        passed: state.fees === (workflow === 'transfer' ? fee : 0),
        actual: state.fees,
      },
      {
        name: 'Correct number of ledger entries',
        passed: state.entries.length === entries,
        expected: entries,
        actual: state.entries.length,
      },
      {
        name: 'Refund state prevents a second refund',
        passed: state.paymentStatus === (workflow === 'refund' ? 'refunded' : 'settled'),
        actual: state.paymentStatus,
      },
      {
        name: 'Only the requested card is frozen',
        passed:
          state.cards[0]?.frozen === (workflow === 'freeze') &&
          state.cards.slice(1).every((c) => !c.frozen),
      },
    ],
  }
}
