// Task workspace composition with a server-seeded principal and reusable domain services.
import { defineBenchmark, initialScreen, screenOnly } from '../../../test/benchmarks/contracts.js'
import type { Screen, Scenario } from '../../../test/benchmarks/contracts.js'
import { formButtons, formTransition, withFormValues } from '../../../test/benchmarks/forms.js'
import { taskboardCases } from './cases.js'
import { taskboardOracle } from './oracle.js'
import { parseBoardCommand } from '../src/domain.js'
import type { BoardData, BoardPolicy, BoardFault } from '../src/domain.js'
import { executeBoard } from '../src/service.js'
import { taskboardFields, renderTaskboard } from '../src/view.js'
export type { Task } from '../src/domain.js'
export interface BoardState extends Screen, BoardData {}
const menu = [
  { id: 'open-assign', label: 'Assign a task' },
  { id: 'open-complete', label: 'Complete a task' },
  { id: 'open-archive', label: 'Archive a task' },
  { id: 'open-permission', label: 'Request an assignment' },
]
const policy = (s: Scenario): BoardPolicy => ({
  project: String(s.input.project),
  role: s.input.role === 'viewer' ? 'viewer' : 'editor',
  actor: 'Morgan',
  members: ['Ada', 'Lin', 'Sam', 'Other'],
})
export const taskboard = defineBenchmark<BoardState>({
  slug: 'taskboard',
  title: 'Team Workspace',
  cases: taskboardCases,
  initial: (s) => ({
    ...initialScreen(),
    tasks: [
      {
        id: String(s.input.taskId),
        project: String(s.input.project),
        title: String(s.input.title),
        assignee: 'Unassigned',
        priority: String(s.input.priority),
        status: 'open',
        archived: false,
      },
      {
        id: 'T-OTHER',
        project: String(s.input.project),
        title: 'Unrelated task',
        assignee: 'Other',
        priority: 'medium',
        status: 'open',
        archived: false,
      },
      {
        id: 'T-ANOTHER',
        project: String(s.input.project),
        title: 'Another unrelated task',
        assignee: 'Other',
        priority: 'medium',
        status: 'open',
        archived: false,
      },
    ],
    activities: [],
    completedCount: 0,
    result: 'pending',
  }),
  view: (state, s) => ({
    title: 'Team Workspace',
    screen: screenOnly(state),
    data: {
      tasks: state.tasks.map((t) => ({ ...t })),
      activities: state.activities.map((a) => ({ ...a })),
      completedCount: state.completedCount,
      result: state.result,
      policy: { ...policy(s) },
    },
    buttons: formButtons(state, menu),
    fields: withFormValues(taskboardFields(state.operation, s.input), state),
  }),
  reduce(state, action, s, values) {
    const navigation = formTransition(state, action, values, parseBoardCommand)
    if (navigation) return navigation
    const command = parseBoardCommand(state.form ?? {}, state.operation)
    const target =
      command.taskId === s.input.taskId &&
      (command.operation !== 'assign' || command.assignee === s.input.assignee)
    const expected = s.workflow === 'permission' ? 'assign' : s.workflow
    const fault = target && command.operation === expected ? (s.fault as BoardFault | null) : null
    const result = executeBoard(state, command, policy(s), fault)
    return {
      state: {
        ...state,
        ...result,
        screen: 'done',
        notice: `Request ${result.result}. Task records and activity below show the saved outcome.`,
      },
      injected: Boolean(fault),
    }
  },
  restore: (view) => ({ ...view.screen, ...(view.data as unknown as BoardData) }),
  render: renderTaskboard,
  oracle: taskboardOracle,
})
