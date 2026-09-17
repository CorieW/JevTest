// Independent requirements: this oracle has no access to the planted-fault label.
import type { Inputs } from '../../../test/benchmarks/contracts.js'
import type { Check } from '../../../src/types.js'
import type { ReservationState } from '../src/app.js'

export function reservationOracle(state: ReservationState, input: Inputs): Check {
  const workflow = String(input.workflow)
  const total = Number(input.guests) * Number(input.unitPrice)
  const record = state.reservations.find((r) => r.id === input.reservationId)
  const expectedCount = workflow === 'capacity' ? 0 : 1
  const expectedStatus = workflow === 'cancel' ? 'cancelled' : 'confirmed'
  const expectedResult = {
    reserve: 'confirmed',
    cancel: 'cancelled',
    reschedule: 'rescheduled',
    capacity: 'rejected',
  }[workflow]
  const expectedSlot = workflow === 'cancel' ? '2026-09-30 09:00' : input.slot
  const expectedCharge = workflow === 'capacity' ? 0 : total
  const expectedRefund =
    workflow === 'cancel' ? Math.round((total * Number(input.refundPercent)) / 100) : 0
  return {
    complete: state.screen === 'done',
    assertions: [
      {
        name: 'Unrelated reservation remains intact',
        passed: state.reservations.some(
          (r) =>
            r.id === 'R-OTHER' &&
            r.room === 'Birch' &&
            r.slot === '2026-12-01 16:00' &&
            r.guests === 2 &&
            r.status === 'confirmed' &&
            r.paid === 24,
        ),
      },
      {
        name: 'Requested workflow and fixture were selected',
        passed:
          (state.operation === workflow ||
            (['reserve', 'capacity'].includes(workflow) &&
              ['reserve', 'capacity'].includes(state.operation))) &&
          record?.room !== 'Birch',
      },
      {
        name: 'Correct reservation outcome',
        passed: state.result === expectedResult,
        expected: expectedResult ?? null,
        actual: state.result,
      },
      {
        name: 'Exactly the expected reservations exist',
        passed: state.reservations.length === expectedCount + 1,
        expected: expectedCount + 1,
        actual: state.reservations.length,
      },
      {
        name: 'Reservation details and status are preserved correctly',
        passed:
          expectedCount === 0 ||
          (record?.id === input.reservationId &&
            record?.guests === input.guests &&
            record?.room === input.room &&
            record?.slot === expectedSlot &&
            record?.status === expectedStatus),
      },
      {
        name: 'Payment equals the permitted charge',
        passed: state.charged === expectedCharge,
        expected: expectedCharge,
        actual: state.charged,
      },
      {
        name: 'Refund follows the stated cancellation policy',
        passed: state.refunded === expectedRefund,
        expected: expectedRefund,
        actual: state.refunded,
      },
    ],
  }
}
