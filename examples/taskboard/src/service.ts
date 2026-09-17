// Task mutations enforce the server's project membership and record actor-attributed activity.
import { boardCommand } from './domain.js'
import type { BoardCommand, BoardData, BoardPolicy, BoardFault } from './domain.js'
export function executeBoard(
  state: BoardData,
  input: BoardCommand,
  policy: BoardPolicy,
  fault?: BoardFault | null,
): BoardData {
  const command = boardCommand.parse(input),
    next = structuredClone(state)
  const task = next.tasks.find((t) => t.id === command.taskId && t.project === policy.project)
  if (!task) return { ...next, result: 'not-found' }
  if (policy.role !== 'editor' && fault !== 'permission-bypass') {
    if (fault === 'denied-write' && command.operation === 'assign') task.assignee = command.assignee
    return { ...next, result: 'denied' }
  }
  if (task.archived) return { ...next, result: 'already-archived' }
  if (command.operation === 'assign') {
    if (!policy.members.includes(command.assignee)) return { ...next, result: 'member-not-found' }
    task.assignee = fault === 'wrong-assignee' ? 'Other' : command.assignee
    if (fault === 'reset-priority') task.priority = 'unset'
    next.result = 'assigned'
  } else if (command.operation === 'complete') {
    if (task.status === 'complete') return { ...next, result: 'completed' }
    task.status = 'complete'
    if (fault !== 'stale-count') next.completedCount++
    next.result = 'completed'
  } else {
    if (fault === 'delete-instead') next.tasks = next.tasks.filter((t) => t.id !== task.id)
    else if (fault === 'archive-other-task')
      next.tasks.find((t) => t.id !== task.id)!.archived = true
    else task.archived = true
    next.result = 'archived'
  }
  const log = () =>
    next.activities.push({
      id: `A-${next.activities.length + 1}`,
      taskId: task.id,
      actor: policy.actor,
      kind: next.result,
    })
  log()
  if (fault === 'duplicate-activity') log()
  return next
}
