// Shared entry points keep each domain implementation independently inspectable.
import { reservations } from '../../examples/reservations/app.js'
import { ledger } from '../../examples/ledger/app.js'
import { taskboard } from '../../examples/taskboard/app.js'
export const benchmarks = [reservations, ledger, taskboard]
