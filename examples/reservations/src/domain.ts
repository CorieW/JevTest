// Booking records, room policy, and calendar-checked user commands.
import { z } from 'zod'
export interface Reservation {
  id: string
  room: string
  slot: string
  guests: number
  status: string
  paid: number
}
export interface ReservationData {
  reservations: Reservation[]
  charged: number
  refunded: number
  result: string
}
export interface ReservationPolicy {
  capacity: number
  unitPrice: number
  refundPercent: number
  newId: string
}
const text = z.string().trim().min(1).max(120)
const slot = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/)
  .refine((value) => {
    const date = new Date(value.replace(' ', 'T') + ':00Z')
    return (
      Number.isFinite(date.getTime()) && date.toISOString().slice(0, 16).replace('T', ' ') === value
    )
  }, 'Enter a valid date and time (YYYY-MM-DD HH:mm)')
export const reservationCommand = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('reserve'),
    room: z.enum(['Cedar', 'Maple', 'Willow', 'Birch']),
    guests: z.coerce.number().int().positive().max(100),
    slot,
  }),
  z.object({ operation: z.literal('cancel'), reservationId: text }),
  z.object({ operation: z.literal('reschedule'), reservationId: text, slot }),
])
export type ReservationCommand = z.infer<typeof reservationCommand>
export function parseReservationCommand(values: Record<string, string>, operation: string) {
  return reservationCommand.parse({
    ...values,
    operation: operation === 'capacity' ? 'reserve' : operation,
  })
}
export type ReservationFault =
  | 'overbooking'
  | 'charge-on-rejection'
  | 'wrong-price'
  | 'duplicate-reservation'
  | 'uncancelled-record'
  | 'missing-refund'
  | 'wrong-slot'
  | 'extra-charge'
