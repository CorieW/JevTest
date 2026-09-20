// Domain services are tested independently of the browser, fault selector, and evaluation oracle.
import { expect, it } from 'vitest'
import { executeLedger } from '../examples/ledger/src/service.js'
import type { LedgerData, LedgerPolicy } from '../examples/ledger/src/domain.js'
import { executeReservation } from '../examples/reservations/src/service.js'
import type { ReservationData, ReservationPolicy } from '../examples/reservations/src/domain.js'
import { executeBoard } from '../examples/taskboard/src/service.js'
import type { BoardData, BoardPolicy } from '../examples/taskboard/src/domain.js'
const wallet: LedgerData = {
  primary: 100,
  recipient: 20,
  other: 30,
  fees: 0,
  entries: [],
  paymentStatus: 'settled',
  cards: [
    { name: 'Travel', frozen: false },
    { name: 'Backup', frozen: false },
  ],
  result: 'pending',
}
const walletPolicy: LedgerPolicy = {
  fee: 2,
  limit: 80,
  recipient: 'Aster',
  paymentId: 'P-1',
  paymentAmount: 25,
}
it('posts balanced debit, credit, and fee entries without mutating its input', () => {
  const result = executeLedger(
    wallet,
    { operation: 'transfer', recipient: 'Aster', amount: 40 },
    walletPolicy,
  )
  expect([result.primary, result.recipient, result.fees]).toEqual([58, 60, 2])
  expect(result.entries.map((e) => e.amount)).toEqual([-42, 40, 2])
  expect(wallet.primary).toBe(100)
  expect(wallet.entries).toEqual([])
})
it('rejects insufficient funds and unknown recipients without writes', () => {
  for (const command of [
    { operation: 'transfer' as const, recipient: 'Aster', amount: 99 },
    { operation: 'transfer' as const, recipient: 'Missing', amount: 10 },
  ]) {
    const result = executeLedger(wallet, command, { ...walletPolicy, limit: 200 })
    expect(result.primary).toBe(100)
    expect(result.fees).toBe(0)
    expect(result.entries).toEqual([])
  }
})
it('rejects invalid monetary input and guards repeat refunds', () => {
  expect(() =>
    executeLedger(wallet, { operation: 'transfer', recipient: 'Aster', amount: 1.5 }, walletPolicy),
  ).toThrow()
  const first = executeLedger(wallet, { operation: 'refund', paymentId: 'P-1' }, walletPolicy)
  const repeat = executeLedger(first, { operation: 'refund', paymentId: 'P-1' }, walletPolicy)
  expect(repeat.primary).toBe(125)
  expect(repeat.entries).toHaveLength(2)
  expect(repeat.result).toBe('already-refunded')
})
const booking: ReservationData = { reservations: [], charged: 0, refunded: 0, result: 'pending' }
const bookingPolicy: ReservationPolicy = {
  capacity: 4,
  unitPrice: 20,
  refundPercent: 50,
  newId: 'R-1',
}
it('rejects occupied rooms and refunds a cancellation at most once', () => {
  const command = {
    operation: 'reserve' as const,
    room: 'Cedar' as const,
    guests: 2,
    slot: '2026-11-12 10:00',
  }
  const created = executeReservation(booking, command, bookingPolicy)
  const conflict = executeReservation(created, command, bookingPolicy)
  expect(conflict.result).toBe('rejected')
  expect(conflict.reservations).toHaveLength(1)
  expect(conflict.charged).toBe(40)
  const cancelled = executeReservation(
    created,
    { operation: 'cancel', reservationId: 'R-1' },
    bookingPolicy,
  )
  const repeat = executeReservation(
    cancelled,
    { operation: 'cancel', reservationId: 'R-1' },
    bookingPolicy,
  )
  expect(repeat.refunded).toBe(20)
  expect(repeat.reservations[0]?.status).toBe('cancelled')
})
it('rejects impossible calendar dates before changing bookings', () => {
  expect(() =>
    executeReservation(
      booking,
      { operation: 'reserve', room: 'Cedar', guests: 2, slot: '2026-02-30 10:00' },
      bookingPolicy,
    ),
  ).toThrow()
  expect(booking.reservations).toEqual([])
})
const board: BoardData = {
  tasks: [
    {
      id: 'T-1',
      project: 'Atlas',
      title: 'Release notes',
      assignee: 'Unassigned',
      priority: 'high',
      status: 'open',
      archived: false,
    },
  ],
  activities: [],
  completedCount: 0,
  result: 'pending',
}
const boardPolicy: BoardPolicy = {
  project: 'Atlas',
  role: 'editor',
  actor: 'Morgan',
  members: ['Ada'],
}
it('uses server membership, including project boundaries and member validation', () => {
  const request = { operation: 'assign' as const, taskId: 'T-1', assignee: 'Ada', role: 'editor' }
  const denied = executeBoard(board, request, { ...boardPolicy, role: 'viewer' })
  expect(denied.result).toBe('denied')
  expect(denied.tasks).toEqual(board.tasks)
  expect(denied.activities).toEqual([])
  expect(executeBoard(board, request, { ...boardPolicy, project: 'Other' }).result).toBe(
    'not-found',
  )
  expect(executeBoard(board, { ...request, assignee: 'Unknown' }, boardPolicy).result).toBe(
    'member-not-found',
  )
})
it('makes repeated completion harmless and preserves archived records', () => {
  const first = executeBoard(board, { operation: 'complete', taskId: 'T-1' }, boardPolicy)
  const second = executeBoard(first, { operation: 'complete', taskId: 'T-1' }, boardPolicy)
  expect(second.completedCount).toBe(1)
  expect(second.activities).toHaveLength(1)
  const archived = executeBoard(second, { operation: 'archive', taskId: 'T-1' }, boardPolicy)
  expect(archived.tasks[0]?.archived).toBe(true)
  expect(archived.activities[1]?.actor).toBe('Morgan')
  const edit = executeBoard(
    archived,
    { operation: 'assign', taskId: 'T-1', assignee: 'Ada' },
    boardPolicy,
  )
  expect(edit.result).toBe('already-archived')
  expect(edit.activities).toHaveLength(2)
})
