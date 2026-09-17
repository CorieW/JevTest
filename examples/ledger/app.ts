// Synthetic wallet service; real money and external financial services are never involved.
import {
  buttons,
  defineBenchmark,
  initialScreen,
  navigate,
  optionsFor,
  screenOnly,
  selectedIndex,
} from '../benchmarks/contracts.js'
import type { Screen, Scenario } from '../benchmarks/contracts.js'
import { ledgerCases } from './cases.js'
import { ledgerOracle } from './oracle.js'

export interface LedgerState extends Screen {
  primary: number
  recipient: number
  other: number
  fees: number
  entries: { account: string; amount: number; kind: string }[]
  paymentStatus: string
  cards: { name: string; frozen: boolean }[]
  result: string
}
function labels(s: Scenario, operation: string): [string, string, string] {
  const i = s.input
  if (operation === 'refund')
    return [
      `Refund ${i.paymentId}: ${i.amount} credits to Primary`,
      `Refund P-999: ${Number(i.amount) + 5} credits to Primary`,
      'Refund P-998: 1 credit to Primary',
    ]
  if (operation === 'freeze')
    return [`Freeze ${i.target} card`, 'Freeze Backup card', 'Freeze Spare card']
  return [
    `Transfer ${i.amount} credits from Primary to ${i.recipient}`,
    `Transfer ${Number(i.amount) + 5} credits from Primary to Other`,
    'Transfer 1 credit from Primary to Other',
  ]
}
const menu = [
  { id: 'open-refund', label: 'Refund a settled payment' },
  { id: 'open-limit', label: 'Submit a transfer under the account limit policy' },
  { id: 'open-freeze', label: 'Manage card freeze status' },
  { id: 'open-transfer', label: 'Transfer credits between accounts' },
]
export const ledger = defineBenchmark<LedgerState>({
  slug: 'ledger',
  title: 'Pocket ledger',
  cases: ledgerCases,
  initial: (s) => ({
    ...initialScreen(),
    primary: Number(s.input.sourceBalance),
    recipient: 100,
    other: 100,
    fees: 0,
    entries: [],
    paymentStatus: 'settled',
    cards: [
      { name: String(s.input.target), frozen: false },
      { name: 'Backup', frozen: false },
      { name: 'Spare', frozen: false },
    ],
    result: 'pending',
  }),
  view: (state, s) => ({
    title: 'Pocket ledger',
    screen: screenOnly(state),
    data: {
      policy: {
        transferLimit: s.input.limit!,
        fee: s.input.fee!,
        paymentId: s.input.paymentId!,
        paymentAmount: s.input.amount!,
      },
      balances: {
        Primary: state.primary,
        [String(s.input.recipient)]: state.recipient,
        Other: state.other,
      },
      collectedFees: state.fees,
      entries: state.entries,
      paymentStatus: state.paymentStatus,
      cards: state.cards,
      result: state.result,
      selection: state.selected ? labels(s, state.operation)[selectedIndex(state, s)]! : null,
    },
    buttons: buttons(state, menu, optionsFor(s, labels(s, state.operation))),
  }),
  reduce(state, action, s) {
    const moved = navigate(state, action)
    if (moved) return { state: moved }
    const next = structuredClone(state)
    next.screen = 'done'
    const choice = selectedIndex(state, s)
    const sameOperation =
      state.operation === s.workflow ||
      (['transfer', 'limit'].includes(state.operation) &&
        ['transfer', 'limit'].includes(s.workflow))
    const fault = choice === 0 && sameOperation ? s.fault : null
    const amount =
      Number(s.input.amount) + (choice === 1 ? 5 : choice === 2 ? 1 - Number(s.input.amount) : 0)
    const fee = Number(s.input.fee)
    if (state.operation === 'transfer' || state.operation === 'limit') {
      const denied = amount > Number(s.input.limit) && fault !== 'limit-bypass'
      next.result = denied ? 'rejected' : 'transferred'
      if (denied) {
        if (fault === 'rejection-fee') {
          next.primary -= 1
          next.fees += 1
        }
      } else {
        next.primary -= amount + fee
        next.fees += fee
        const wrong = fault === 'wrong-recipient' || choice !== 0
        if (wrong) next.other += amount
        else next.recipient += amount
        next.entries.push({
          account: wrong ? 'Other' : String(s.input.recipient),
          amount,
          kind: 'transfer',
        })
        if (fault === 'duplicate-debit') {
          next.primary -= amount
          next.entries.push({ account: 'Primary', amount: -amount, kind: 'debit' })
        }
      }
    } else if (state.operation === 'refund') {
      next.result = 'refunded'
      next.primary += amount * (fault === 'double-refund' ? 2 : 1)
      next.paymentStatus = fault === 'unmarked-refund' ? 'settled' : 'refunded'
      next.entries.push({ account: 'Primary', amount, kind: 'refund' })
    } else if (state.operation === 'freeze') {
      next.result = 'frozen'
      const index = fault === 'wrong-card' ? 1 : choice
      next.cards[index]!.frozen = true
      if (fault === 'freeze-all-cards')
        next.cards.forEach((c) => {
          c.frozen = true
        })
    }
    next.notice = `Request processed: ${next.result}. Inspect balances and the ledger.`
    return { state: next, injected: Boolean(fault) }
  },
  oracle: ledgerOracle,
})
