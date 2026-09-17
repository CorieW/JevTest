// Task requirements examine persisted records, independent of response messages and fault flags.
import type { Inputs } from '../benchmarks/contracts.js'
import type { Check } from '../../src/types.js'
import type { BoardState } from './app.js'
export function taskboardOracle(state: BoardState, input: Inputs): Check {
  const workflow = String(input.workflow)
  const task = state.tasks.find((t) => t.id === input.taskId)
  const other = state.tasks.find((t) => t.id === 'T-OTHER')
  const result = {
    assign: 'assigned',
    complete: 'completed',
    archive: 'archived',
    permission: 'denied',
  }[workflow]
  return {
    complete: state.screen === 'done',
    assertions: [
      {
        name: 'Requested operation has the correct result',
        passed: state.operation === workflow && state.result === result,
        expected: result ?? null,
        actual: state.result,
      },
      {
        name: 'Task records are retained',
        passed: state.tasks.length === 2 && Boolean(task),
        expected: 2,
        actual: state.tasks.length,
      },
      {
        name: 'Title, priority, and project remain unchanged',
        passed:
          task?.title === input.title &&
          task?.priority === input.priority &&
          task?.project === input.project,
      },
      {
        name: 'Assignment matches the permitted request',
        passed: task?.assignee === (workflow === 'assign' ? input.assignee : 'Unassigned'),
        actual: task?.assignee ?? null,
      },
      {
        name: 'Completion state and visible count agree',
        passed:
          task?.status === (workflow === 'complete' ? 'complete' : 'open') &&
          state.completedCount === (workflow === 'complete' ? 1 : 0),
      },
      {
        name: 'Only the requested task is archived',
        passed: task?.archived === (workflow === 'archive') && other?.archived === false,
      },
      {
        name: 'The unrelated task is untouched',
        passed:
          other?.status === 'open' &&
          other.assignee === 'Other' &&
          other.title === 'Unrelated task' &&
          other.priority === 'medium',
      },
      {
        name: 'One activity per permitted mutation and none for denied requests',
        passed: state.activities.length === (workflow === 'permission' ? 0 : 1),
        actual: state.activities.length,
      },
    ],
  }
}
