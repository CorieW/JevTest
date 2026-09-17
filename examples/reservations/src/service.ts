// Booking service keeps cancellation refunds and rescheduling separate from reservation creation.
import { reservationCommand } from './domain.js'
import type {
  ReservationCommand,
  ReservationData,
  ReservationFault,
  ReservationPolicy,
} from './domain.js'
export function executeReservation(
  state: ReservationData,
  input: ReservationCommand,
  policy: ReservationPolicy,
  fault?: ReservationFault | null,
): ReservationData {
  const command = reservationCommand.parse(input),
    next = structuredClone(state)
  if (command.operation === 'reserve') {
    const occupied = next.reservations.some(
      (r) => r.room === command.room && r.slot === command.slot && r.status === 'confirmed',
    )
    if (occupied || (command.guests > policy.capacity && fault !== 'overbooking')) {
      if (fault === 'charge-on-rejection') next.charged += command.guests * policy.unitPrice
      return { ...next, result: 'rejected' }
    }
    const paid = command.guests * policy.unitPrice + (fault === 'wrong-price' ? 7 : 0)
    const id = next.reservations.some((r) => r.id === policy.newId)
      ? `${policy.newId}-${next.reservations.length}`
      : policy.newId
    next.reservations.push({
      id,
      room: command.room,
      slot: command.slot,
      guests: command.guests,
      status: 'confirmed',
      paid,
    })
    next.charged += paid
    if (fault === 'duplicate-reservation')
      next.reservations.push({ ...next.reservations.at(-1)!, id: `${id}-copy` })
    next.result = 'confirmed'
  } else {
    const record = next.reservations.find((r) => r.id === command.reservationId)
    if (!record) return { ...next, result: 'not-found' }
    if (record.status !== 'confirmed') return { ...next, result: 'already-cancelled' }
    if (command.operation === 'cancel') {
      if (fault !== 'uncancelled-record') record.status = 'cancelled'
      if (fault !== 'missing-refund')
        next.refunded += Math.round((record.paid * policy.refundPercent) / 100)
      next.result = 'cancelled'
    } else {
      if (
        next.reservations.some(
          (r) =>
            r.id !== record.id &&
            r.room === record.room &&
            r.slot === command.slot &&
            r.status === 'confirmed',
        )
      )
        return { ...next, result: 'rejected' }
      record.slot = fault === 'wrong-slot' ? '2026-11-01 09:00' : command.slot
      if (fault === 'extra-charge') next.charged += 10
      next.result = 'rescheduled'
    }
  }
  return next
}
