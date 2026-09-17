// Shared entry points keep each domain implementation independently inspectable.
import { reservations } from '../reservations/app.js'
import { ledger } from '../ledger/app.js'
import { taskboard } from '../taskboard/app.js'
export const benchmarks = [reservations, ledger, taskboard]
