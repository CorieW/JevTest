// Application menus, public state, and form transitions independent of JevTest.
import { initialScreen, screenOnly, formButtons, formTransition, withFormValues } from './ui.js'
import type { Screen, Inputs, View, Transition } from './ui.js'
import { parseLedgerCommand } from './domain.js'
import type { LedgerData, LedgerPolicy, LedgerCommand } from './domain.js'
import { executeLedger } from './service.js'
import { ledgerFields, renderLedger } from './view.js'
export interface LedgerState extends Screen, LedgerData {}
export interface LedgerContext {
  input: Inputs
  policy: LedgerPolicy
}
const menu = [
  { id: 'open-transfer', label: 'Send a transfer' },
  { id: 'open-refund', label: 'Refund a payment' },
  { id: 'open-freeze', label: 'Freeze a card' },
  { id: 'open-limit', label: 'Transfer with limit review' },
]

export const ledgerApp = {
  initial: (data: LedgerData): LedgerState => ({ ...initialScreen(), ...data }),
  view: (state: LedgerState, context: LedgerContext): View => ({
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
      policy: { ...context.policy },
    },
    buttons: formButtons(state, menu),
    fields: withFormValues(ledgerFields(state.operation, context.input), state),
  }),
  reduce(
    state: LedgerState,
    action: string,
    context: LedgerContext,
    values?: Record<string, string>,
    execute: (
      state: LedgerData,
      command: LedgerCommand,
      policy: LedgerPolicy,
    ) => LedgerData = executeLedger,
  ): Transition<LedgerState> {
    const navigation = formTransition(state, action, values, parseLedgerCommand)
    if (navigation) return navigation
    const command = parseLedgerCommand(state.form ?? {}, state.operation)
    const result = execute(state, command, context.policy)
    return {
      state: {
        ...state,
        ...result,
        screen: 'done',
        notice: `Request ${result.result}. Balances and journal below reflect the saved records.`,
      },
    }
  },
  restore: (view: View): LedgerState => ({
    ...view.screen,
    ...(view.data as unknown as LedgerData),
  }),
  render: renderLedger,
}
