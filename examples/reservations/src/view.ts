// Booking desk with a room catalogue, editable booking forms, reservations, and payment totals.
import type { Field, Inputs, View } from './ui.js'
import { controls, stats, table } from './ui.js'
import type { ReservationData, ReservationPolicy } from './domain.js'
export function reservationFields(operation: string, input: Inputs): Field[] {
  const time: Field = {
    name: 'slot',
    label: 'Date and time (YYYY-MM-DD HH:mm)',
    type: 'text',
  }
  if (['cancel', 'reschedule'].includes(operation))
    return [
      {
        name: 'reservationId',
        label: 'Reservation',
        type: 'select',
        options: [String(input.reservationId), 'R-OTHER'].map((value) => ({ value, label: value })),
      },
      ...(operation === 'reschedule' ? [time] : []),
    ]
  return [
    {
      name: 'room',
      label: 'Meeting room',
      type: 'select',
      options: ['Cedar', 'Maple', 'Willow', 'Birch'].map((value) => ({ value, label: value })),
    },
    { name: 'guests', label: 'Guests', type: 'number' },
    time,
  ]
}
export function renderReservations(view: View): string {
  const data = view.data as unknown as ReservationData & { policy: ReservationPolicy }
  return (
    stats([
      ['Charged', `${data.charged} credits`],
      ['Refunded', `${data.refunded} credits`],
      ['Cancellation refund', `${data.policy.refundPercent}%`],
    ]) +
    controls(view) +
    table(
      'Room rates',
      ['Room', 'Guest capacity', 'Price per guest'],
      ['Cedar', 'Maple', 'Willow', 'Birch'].map((room) => [
        room,
        data.policy.capacity,
        `${data.policy.unitPrice} credits`,
      ]),
    ) +
    table(
      'Reservation register',
      ['Reference', 'Room', 'Date and time', 'Guests', 'Status', 'Paid'],
      data.reservations.map((r) => [r.id, r.room, r.slot, r.guests, r.status, r.paid]),
    )
  )
}
