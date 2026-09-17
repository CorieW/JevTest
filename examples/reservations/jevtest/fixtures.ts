// Private evaluation setup: public seed records and policy derived from each test fixture.
import type { Scenario } from '../../../test/benchmarks/contracts.js'
import type { ReservationData, ReservationPolicy } from '../src/domain.js'
const policy = (s: Scenario): ReservationPolicy => ({
  capacity: Number(s.input.capacity),
  unitPrice: Number(s.input.unitPrice),
  refundPercent: Number(s.input.refundPercent),
  newId: String(s.input.reservationId),
})

export const reservationsFixture: {
  policy: (s: Scenario) => ReservationPolicy
  initial: (s: Scenario) => ReservationData
} = {
  policy,
  initial(s) {
    const existing = ['cancel', 'reschedule'].includes(s.workflow)
    const total = Number(s.input.guests) * Number(s.input.unitPrice)
    return {
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
}
