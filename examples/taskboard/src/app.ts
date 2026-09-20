// Application menus, public state, and form transitions independent of JevTest.
import { initialScreen, screenOnly, formButtons, formTransition, withFormValues } from './ui.js'
import type { Screen, Inputs, View, Transition } from './ui.js'
import { parseBoardCommand } from './domain.js'
import type { BoardData, BoardPolicy, BoardCommand } from './domain.js'
import { executeBoard } from './service.js'
import { taskboardFields, renderTaskboard } from './view.js'
export interface BoardState extends Screen, BoardData {}
export interface BoardContext {
  input: Inputs
  policy: BoardPolicy
}
const menu = [
  { id: 'open-assign', label: 'Assign a task' },
  { id: 'open-complete', label: 'Complete a task' },
  { id: 'open-archive', label: 'Archive a task' },
  { id: 'open-permission', label: 'Request an assignment' },
]

export const taskboardApp = {
  initial: (data: BoardData): BoardState => ({ ...initialScreen(), ...data }),
  view: (state: BoardState, context: BoardContext): View => ({
    title: 'Team Workspace',
    screen: screenOnly(state),
    data: {
      tasks: state.tasks.map((t) => ({ ...t })),
      activities: state.activities.map((a) => ({ ...a })),
      completedCount: state.completedCount,
      result: state.result,
      policy: { ...context.policy },
    },
    buttons: formButtons(state, menu),
    fields: withFormValues(taskboardFields(state.operation, context.input), state),
  }),
  reduce(
    state: BoardState,
    action: string,
    context: BoardContext,
    values?: Record<string, string>,
    execute: (
      state: BoardData,
      command: BoardCommand,
      policy: BoardPolicy,
    ) => BoardData = executeBoard,
  ): Transition<BoardState> {
    const navigation = formTransition(state, action, values, parseBoardCommand)
    if (navigation) return navigation
    const command = parseBoardCommand(state.form ?? {}, state.operation)
    const result = execute(state, command, context.policy)
    return {
      state: {
        ...state,
        ...result,
        screen: 'done',
        notice: `Request ${result.result}. Task records and activity below show the saved outcome.`,
      },
    }
  },
  restore: (view: View): BoardState => ({ ...view.screen, ...(view.data as unknown as BoardData) }),
  render: renderTaskboard,
}
