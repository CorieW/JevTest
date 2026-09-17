// Shared entry points keep each domain implementation independently inspectable.
import { reservations } from '../../examples/reservations/jevtest/config.js'
import { ledger } from '../../examples/ledger/jevtest/config.js'
import { taskboard } from '../../examples/taskboard/jevtest/config.js'
export const benchmarks = [reservations, ledger, taskboard]
