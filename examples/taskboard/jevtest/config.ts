// JevTest wiring: fixtures, action inputs, deliberate fault selection, and independent grading.
import { defineBenchmark } from '../../../test/benchmarks/contracts.js'
import type { Scenario } from '../../../test/benchmarks/contracts.js'
import { taskboardApp } from '../src/app.js'
import type { BoardState } from '../src/app.js'
import type { BoardFault } from '../src/domain.js'
import { executeBoard } from '../src/service.js'
import { taskboardFixture } from './fixtures.js'
import { withFixture } from './fields.js'
import { taskboardCases } from './cases.js'
import { taskboardOracle } from './oracle.js'
const context = (s: Scenario) => ({ input: s.input, policy: taskboardFixture.policy(s) })
export const taskboard = defineBenchmark<BoardState>({
  slug: 'taskboard',
  title: 'Team Workspace',
  cases: taskboardCases,
  initial: (s) => taskboardApp.initial(taskboardFixture.initial(s)),
  view(state, s) {
    const view = taskboardApp.view(state, context(s))
    return { ...view, fields: view.fields?.map(withFixture) }
  },
  reduce(state, action, s, values) {
    let injected: boolean | undefined
    const result = taskboardApp.reduce(
      state,
      action,
      context(s),
      values,
      (current, command, policy) => {
        const target =
          command.taskId === s.input.taskId &&
          (command.operation !== 'assign' || command.assignee === s.input.assignee)
        const expected = s.workflow === 'permission' ? 'assign' : s.workflow
        const fault =
          target && command.operation === expected ? (s.fault as BoardFault | null) : null
        injected = Boolean(fault)
        return executeBoard(current, command, policy, fault)
      },
    )
    return { ...result, ...(injected === undefined ? {} : { injected }) }
  },
  restore: taskboardApp.restore,
  render: taskboardApp.render,
  oracle: taskboardOracle,
})
