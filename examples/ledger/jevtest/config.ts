// JevTest wiring: fixtures, action inputs, deliberate fault selection, and independent grading.
import { defineBenchmark } from '../../../test/benchmarks/contracts.js'
import type { Scenario } from '../../../test/benchmarks/contracts.js'
import { ledgerApp } from '../src/app.js'
import type { LedgerState } from '../src/app.js'
import type { LedgerFault } from '../src/domain.js'
import { executeLedger } from '../src/service.js'
import { ledgerFixture } from './fixtures.js'
import { withFixture } from './fields.js'
import { ledgerCases } from './cases.js'
import { ledgerOracle } from './oracle.js'
const context = (s: Scenario) => ({ input: s.input, policy: ledgerFixture.policy(s) })
export const ledger = defineBenchmark<LedgerState>({
  slug: 'ledger',
  title: 'Pocket Ledger',
  cases: ledgerCases,
  initial: (s) => ledgerApp.initial(ledgerFixture.initial(s)),
  view(state, s) {
    const view = ledgerApp.view(state, context(s))
    return { ...view, fields: view.fields?.map(withFixture) }
  },
  reduce(state, action, s, values) {
    let injected: boolean | undefined
    const result = ledgerApp.reduce(
      state,
      action,
      context(s),
      values,
      (current, command, policy) => {
        const target =
          command.operation === 'transfer'
            ? command.recipient === s.input.recipient && command.amount === s.input.amount
            : command.operation === 'refund'
              ? command.paymentId === s.input.paymentId
              : command.card === s.input.target
        const expected = s.workflow === 'limit' ? 'transfer' : s.workflow
        const fault =
          target && command.operation === expected ? (s.fault as LedgerFault | null) : null
        injected = Boolean(fault)
        return executeLedger(current, command, policy, fault)
      },
    )
    return { ...result, ...(injected === undefined ? {} : { injected }) }
  },
  restore: ledgerApp.restore,
  render: ledgerApp.render,
  oracle: ledgerOracle,
})
