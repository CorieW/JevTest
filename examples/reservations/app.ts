// Reservation application: faults live in mutations, while the client receives only observable state.
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
import { reservationCases } from './cases.js'
import { reservationOracle } from './oracle.js'

export interface ReservationState extends Screen {
  reservations: { id: string; room: string; slot: string; guests: number; status: string }[]
  charged: number
  refunded: number
  result: string
}
function labels(s: Scenario): [string, string, string] {
  const i = s.input
  return [
    `${i.reservationId}: ${i.room}, ${i.guests} guests, ${i.slot}`,
    `${i.reservationId}: ${i.room}, ${Number(i.guests) + 1} guests, 2026-11-01 09:00`,
    `Other reservation R-999: Birch, 2 guests, 2026-12-01 16:00`,
  ]
}
const menu = [
  { id: 'open-reschedule', label: 'Change an existing reservation time' },
  { id: 'open-reserve', label: 'Make a reservation' },
  { id: 'open-capacity', label: 'Submit a capacity-limited reservation request' },
  { id: 'open-cancel', label: 'Cancel and refund a reservation' },
]
export const reservations = defineBenchmark<ReservationState>({
  slug: 'reservations',
  title: 'Reservation desk',
  cases: reservationCases,
  initial(s) {
    const existing = ['cancel', 'reschedule'].includes(s.workflow)
    return {
      ...initialScreen(),
      reservations: existing
        ? [
            {
              id: String(s.input.reservationId),
              room: String(s.input.room),
              slot: '2026-09-30 09:00',
              guests: Number(s.input.guests),
              status: 'confirmed',
            },
          ]
        : [],
      charged: existing ? Number(s.input.guests) * Number(s.input.unitPrice) : 0,
      refunded: 0,
      result: 'pending',
    }
  },
  view(state, s) {
    return {
      title: 'Reservation desk',
      screen: screenOnly(state),
      data: {
        rules: {
          capacity: s.input.capacity!,
          pricePerGuest: s.input.unitPrice!,
          refundPercent: s.input.refundPercent!,
        },
        reservations: state.reservations,
        chargedCredits: state.charged,
        refundedCredits: state.refunded,
        result: state.result,
        selection: state.selected ? labels(s)[selectedIndex(state, s)]! : null,
      },
      buttons: buttons(state, menu, optionsFor(s, labels(s))),
    }
  },
  reduce(state, action, s) {
    const moved = navigate(state, action)
    if (moved) return { state: moved }
    const next = structuredClone(state)
    next.screen = 'done'
    const choice = selectedIndex(state, s)
    const matches = choice === 0 && state.operation === s.workflow
    const fault = matches ? s.fault : null
    const guests = Number(s.input.guests) + choice
    const total = guests * Number(s.input.unitPrice)
    if (state.operation === 'reserve' || state.operation === 'capacity') {
      const rejected = guests > Number(s.input.capacity) && fault !== 'overbooking'
      next.result = rejected ? 'rejected' : 'confirmed'
      if (!rejected) {
        next.reservations.push({
          id: String(s.input.reservationId),
          room: choice === 2 ? 'Birch' : String(s.input.room),
          slot: String(s.input.slot),
          guests,
          status: 'confirmed',
        })
        next.charged += total + (fault === 'wrong-price' ? 7 : 0)
        if (fault === 'duplicate-reservation')
          next.reservations.push({ ...next.reservations.at(-1)!, id: 'R-DUPLICATE' })
      } else if (fault === 'charge-on-rejection') next.charged += total
    } else if (state.operation === 'cancel') {
      next.result = 'cancelled'
      if (next.reservations[0] && fault !== 'uncancelled-record')
        next.reservations[0].status = 'cancelled'
      if (fault !== 'missing-refund')
        next.refunded = Math.round((next.charged * Number(s.input.refundPercent)) / 100)
    } else if (state.operation === 'reschedule') {
      next.result = 'rescheduled'
      if (next.reservations[0])
        next.reservations[0].slot =
          fault === 'wrong-slot' || choice !== 0 ? '2026-11-01 09:00' : String(s.input.slot)
      if (fault === 'extra-charge') next.charged += 10
    }
    next.notice = `Request processed: ${next.result}. Review reservation and payment records.`
    return { state: next, injected: Boolean(fault) }
  },
  oracle: reservationOracle,
})
