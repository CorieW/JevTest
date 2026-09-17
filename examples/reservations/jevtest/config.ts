// Booking application composition: HTTP forms call domain services; the oracle reads saved records.
import { defineBenchmark, initialScreen, screenOnly } from '../../../test/benchmarks/contracts.js'
import type { Scenario, Screen } from '../../../test/benchmarks/contracts.js'
import { formButtons, formTransition, withFormValues } from '../../../test/benchmarks/forms.js'
import { reservationCases } from './cases.js'
import { reservationOracle } from './oracle.js'
import { parseReservationCommand } from '../src/domain.js'
import type { ReservationData, ReservationPolicy, ReservationFault } from '../src/domain.js'
import { executeReservation } from '../src/service.js'
import { reservationFields, renderReservations } from '../src/view.js'
export interface ReservationState extends Screen, ReservationData {}
const menu = [
  { id: 'open-reserve', label: 'Book a room' },
  { id: 'open-reschedule', label: 'Reschedule a booking' },
  { id: 'open-cancel', label: 'Cancel a booking' },
  { id: 'open-capacity', label: 'Check a group booking' },
]
const policy = (s: Scenario): ReservationPolicy => ({
  capacity: Number(s.input.capacity),
  unitPrice: Number(s.input.unitPrice),
  refundPercent: Number(s.input.refundPercent),
  newId: String(s.input.reservationId),
})
export const reservations = defineBenchmark<ReservationState>({
  slug: 'reservations',
  title: 'Reservation Desk',
  cases: reservationCases,
  initial(s) {
    const existing = ['cancel', 'reschedule'].includes(s.workflow)
    const total = Number(s.input.guests) * Number(s.input.unitPrice)
    return {
      ...initialScreen(),
      reservations: [
        ...(existing
          ? [
              {
                id: String(s.input.reservationId),
                room: String(s.input.room),
                slot: '2026-09-30 09:00',
                guests: Number(s.input.guests),
                status: 'confirmed',
                paid: total,
              },
            ]
          : []),
        {
          id: 'R-OTHER',
          room: 'Birch',
          slot: '2026-12-01 16:00',
          guests: 2,
          status: 'confirmed',
          paid: 24,
        },
      ],
      charged: existing ? total : 0,
      refunded: 0,
      result: 'pending',
    }
  },
  view: (state, s) => ({
    title: 'Reservation Desk',
    screen: screenOnly(state),
    data: {
      reservations: state.reservations.map((r) => ({ ...r })),
      charged: state.charged,
      refunded: state.refunded,
      result: state.result,
      policy: { ...policy(s) },
    },
    buttons: formButtons(state, menu),
    fields: withFormValues(reservationFields(state.operation, s.input), state),
  }),
  reduce(state, action, s, values) {
    const navigation = formTransition(state, action, values, parseReservationCommand)
    if (navigation) return navigation
    const command = parseReservationCommand(state.form ?? {}, state.operation)
    const expected = s.workflow === 'capacity' ? 'reserve' : s.workflow
    const target =
      command.operation === 'reserve'
        ? command.room === s.input.room &&
          command.guests === s.input.guests &&
          command.slot === s.input.slot
        : command.reservationId === s.input.reservationId
    const fault =
      target && command.operation === expected ? (s.fault as ReservationFault | null) : null
    const result = executeReservation(state, command, policy(s), fault)
    return {
      state: {
        ...state,
        ...result,
        screen: 'done',
        notice: `Booking ${result.result}. The register and payment totals have been saved.`,
      },
      injected: Boolean(fault),
    }
  },
  restore: (view) => ({ ...view.screen, ...(view.data as unknown as ReservationData) }),
  render: renderReservations,
  oracle: reservationOracle,
})
