// Composition boundary: seeded identity, form workflow, domain service, and independent evaluation.
import { defineBenchmark, initialScreen, screenOnly } from '../../../test/benchmarks/contracts.js'
import type { Screen, Scenario } from '../../../test/benchmarks/contracts.js'
import { formButtons, formTransition, withFormValues } from '../../../test/benchmarks/forms.js'
import { ledgerCases } from './cases.js'
import { ledgerOracle } from './oracle.js'
import { parseLedgerCommand } from '../src/domain.js'
import type { LedgerData, LedgerFault, LedgerPolicy } from '../src/domain.js'
import { executeLedger } from '../src/service.js'
import { ledgerFields, renderLedger } from '../src/view.js'
export interface LedgerState extends Screen, LedgerData {}
const menu = [
  { id: 'open-transfer', label: 'Send a transfer' },
  { id: 'open-refund', label: 'Refund a payment' },
  { id: 'open-freeze', label: 'Freeze a card' },
  { id: 'open-limit', label: 'Transfer with limit review' },
]
const policy = (s: Scenario): LedgerPolicy => ({
  fee: Number(s.input.fee),
  limit: Number(s.input.limit),
  recipient: String(s.input.recipient),
  paymentId: String(s.input.paymentId),
  paymentAmount: Number(s.input.amount),
})
export const ledger = defineBenchmark<LedgerState>({
  slug: 'ledger',
  title: 'Pocket Ledger',
  cases: ledgerCases,
  initial: (s) => ({
    ...initialScreen(),
    primary: Number(s.input.sourceBalance),
    recipient: 100,
    other: 100,
    fees: 0,
    entries: [],
    paymentStatus: 'settled',
    cards: [String(s.input.target), 'Backup', 'Spare'].map((name) => ({ name, frozen: false })),
    result: 'pending',
  }),
  view: (state, s) => ({
    title: 'Pocket Ledger',
    screen: screenOnly(state),
    data: {
      primary: state.primary,
      recipient: state.recipient,
      other: state.other,
      fees: state.fees,
      entries: state.entries,
      paymentStatus: state.paymentStatus,
      cards: state.cards,
      result: state.result,
      policy: { ...policy(s) },
    },
    buttons: formButtons(state, menu),
    fields: withFormValues(ledgerFields(state.operation, s.input), state),
  }),
  reduce(state, action, s, values) {
    const navigation = formTransition(state, action, values, parseLedgerCommand)
    if (navigation) return navigation
    const command = parseLedgerCommand(state.form ?? {}, state.operation)
    const target =
      command.operation === 'transfer'
        ? command.recipient === s.input.recipient && command.amount === s.input.amount
        : command.operation === 'refund'
          ? command.paymentId === s.input.paymentId
          : command.card === s.input.target
    const expected = s.workflow === 'limit' ? 'transfer' : s.workflow
    const fault = target && command.operation === expected ? (s.fault as LedgerFault | null) : null
    const result = executeLedger(state, command, policy(s), fault)
    return {
      state: {
        ...state,
        ...result,
        screen: 'done',
        notice: `Request ${result.result}. Balances and journal below reflect the saved records.`,
      },
      injected: Boolean(fault),
    }
  },
  restore: (view) => ({ ...view.screen, ...(view.data as unknown as LedgerData) }),
  render: renderLedger,
  oracle: ledgerOracle,
})
