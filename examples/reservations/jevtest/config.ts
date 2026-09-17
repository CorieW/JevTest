// JevTest wiring: fixtures, action inputs, deliberate fault selection, and independent grading.
import { defineBenchmark } from '../../../test/benchmarks/contracts.js'
import type { Scenario } from '../../../test/benchmarks/contracts.js'
import { reservationsApp } from '../src/app.js'
import type { ReservationState } from '../src/app.js'
import type { ReservationFault } from '../src/domain.js'
import { executeReservation } from '../src/service.js'
import { reservationsFixture } from './fixtures.js'
import { withFixture } from './fields.js'
import { reservationCases } from './cases.js'
import { reservationOracle } from './oracle.js'
const context = (s: Scenario) => ({ input: s.input, policy: reservationsFixture.policy(s) })
export const reservations = defineBenchmark<ReservationState>({
  slug: 'reservations',
  title: 'Reservation Desk',
  cases: reservationCases,
  initial: (s) => reservationsApp.initial(reservationsFixture.initial(s)),
  view(state, s) {
    const view = reservationsApp.view(state, context(s))
    return { ...view, fields: view.fields?.map(withFixture) }
  },
  reduce(state, action, s, values) {
    let injected: boolean | undefined
    const result = reservationsApp.reduce(
      state,
      action,
      context(s),
      values,
      (current, command, policy) => {
        const expected = s.workflow === 'capacity' ? 'reserve' : s.workflow
        const target =
          command.operation === 'reserve'
            ? command.room === s.input.room &&
              command.guests === s.input.guests &&
              command.slot === s.input.slot
            : command.reservationId === s.input.reservationId
        const fault =
          target && command.operation === expected ? (s.fault as ReservationFault | null) : null
        injected = Boolean(fault)
        return executeReservation(current, command, policy, fault)
      },
    )
    return { ...result, ...(injected === undefined ? {} : { injected }) }
  },
  restore: reservationsApp.restore,
  render: reservationsApp.render,
  oracle: reservationOracle,
})
