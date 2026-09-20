// Private evaluation setup: public seed records and policy derived from each test fixture.
import type { Scenario } from '../../../test/benchmarks/contracts.js'
import type { LedgerData, LedgerPolicy } from '../src/domain.js'
const policy = (s: Scenario): LedgerPolicy => ({
  fee: Number(s.input.fee),
  limit: Number(s.input.limit),
  recipient: String(s.input.recipient),
  paymentId: String(s.input.paymentId),
  paymentAmount: Number(s.input.amount),
})

export const ledgerFixture: {
  policy: (s: Scenario) => LedgerPolicy
  initial: (s: Scenario) => LedgerData
} = {
  policy,
  initial: (s) => ({
    primary: Number(s.input.sourceBalance),
    recipient: 100,
    other: 100,
    fees: 0,
    entries: [],
    paymentStatus: 'settled',
    cards: [String(s.input.target), 'Backup', 'Spare'].map((name) => ({ name, frozen: false })),
    result: 'pending',
  }),
}
