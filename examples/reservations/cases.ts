// Four reservation workflows × thirty fixture combinations × matched control/fault versions.
import { pairCases } from '../../test/benchmarks/contracts.js'
import { formCases } from '../../test/benchmarks/forms.js'
import { reservationFields } from './view.js'
const cases = ['reserve', 'cancel', 'reschedule', 'capacity'].flatMap((workflow) =>
  Array.from({ length: 30 }, (_, variant) => {
    const guests = (variant % 5) + 1
    const unitPrice = 12 + Math.floor(variant / 5) * 3
    const room = ['Cedar', 'Maple', 'Willow'][variant % 3]!
    const slot = `2026-10-${String((variant % 10) + 1).padStart(2, '0')} ${variant % 2 ? '14:00' : '10:00'}`
    const capacity = workflow === 'capacity' ? guests - 1 : guests + 2
    const refundPercent = variant % 2 ? 50 : 100
    const input = {
      workflow,
      guests,
      unitPrice,
      room,
      slot,
      capacity,
      refundPercent,
      reservationId: `R-${100 + variant}`,
    }
    const goal = {
      reserve: `Reserve ${room} for ${guests} guests at ${slot}. The price is ${unitPrice} credits per guest. Create exactly one reservation and charge the correct total.`,
      cancel: `Cancel reservation ${input.reservationId} in ${room}. Refund ${refundPercent}% of its ${guests * unitPrice}-credit payment and preserve the audit record as cancelled.`,
      reschedule: `Move reservation ${input.reservationId} in ${room} to ${slot}. Keep the guest count and payment unchanged; do not create another reservation.`,
      capacity: `Try reserving ${room} for ${guests} guests at ${slot}. Capacity is ${capacity}. Verify the request is rejected without creating a reservation or taking payment.`,
    }[workflow]!
    const fault = {
      reserve: variant % 2 ? 'duplicate-reservation' : 'wrong-price',
      cancel: variant % 2 ? 'missing-refund' : 'uncancelled-record',
      reschedule: variant % 2 ? 'extra-charge' : 'wrong-slot',
      capacity: variant % 2 ? 'charge-on-rejection' : 'overbooking',
    }[workflow]!
    return pairCases('reservations', workflow, variant, input, goal, [goal], fault)
  }).flat(),
)
export const reservationCases = formCases(cases, (s) => reservationFields(s.workflow, s.input))
