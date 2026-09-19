// Application menus, public state, and form transitions independent of JevTest.
import { initialScreen, screenOnly, formButtons, formTransition, withFormValues } from './ui.js'
import type { Screen, Inputs, View, Transition } from './ui.js'
import { parseReservationCommand } from './domain.js'
import type { ReservationData, ReservationPolicy, ReservationCommand } from './domain.js'
import { executeReservation } from './service.js'
import { reservationFields, renderReservations } from './view.js'
export interface ReservationState extends Screen, ReservationData {}
export interface ReservationContext {
  input: Inputs
  policy: ReservationPolicy
}
const menu = [
  { id: 'open-reserve', label: 'Book a room' },
  { id: 'open-reschedule', label: 'Reschedule a booking' },
  { id: 'open-cancel', label: 'Cancel a booking' },
  { id: 'open-capacity', label: 'Check a group booking' },
]

export const reservationsApp = {
  initial: (data: ReservationData): ReservationState => ({ ...initialScreen(), ...data }),
  view: (state: ReservationState, context: ReservationContext): View => ({
    title: 'Reservation Desk',
    screen: screenOnly(state),
    data: {
      reservations: state.reservations.map((r) => ({ ...r })),
      charged: state.charged,
      refunded: state.refunded,
      result: state.result,
      policy: { ...context.policy },
    },
    buttons: formButtons(state, menu),
    fields: withFormValues(reservationFields(state.operation, context.input), state),
  }),
  reduce(
    state: ReservationState,
    action: string,
    context: ReservationContext,
    values?: Record<string, string>,
    execute: (
      state: ReservationData,
      command: ReservationCommand,
      policy: ReservationPolicy,
    ) => ReservationData = executeReservation,
  ): Transition<ReservationState> {
    const navigation = formTransition(state, action, values, parseReservationCommand)
    if (navigation) return navigation
    const command = parseReservationCommand(state.form ?? {}, state.operation)
    const result = execute(state, command, context.policy)
    return {
      state: {
        ...state,
        ...result,
        screen: 'done',
        notice: `Booking ${result.result}. The register and payment totals have been saved.`,
      },
    }
  },
  restore: (view: View): ReservationState => ({
    ...view.screen,
    ...(view.data as unknown as ReservationData),
  }),
  render: renderReservations,
}
