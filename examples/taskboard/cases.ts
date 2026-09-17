// Paired fixtures vary projects, tasks, assignees, priorities, and authorization boundaries.
import { pairCases } from '../../test/benchmarks/contracts.js'
import { formCases } from '../../test/benchmarks/forms.js'
import { taskboardFields } from './view.js'
const cases = ['assign', 'complete', 'archive', 'permission'].flatMap((workflow) =>
  Array.from({ length: 30 }, (_, variant) => {
    const project = ['Atlas', 'Beacon', 'Cobalt'][variant % 3]!
    const assignee = ['Ada', 'Lin', 'Sam'][Math.floor(variant / 3) % 3]!
    const taskId = `T-${300 + variant}`
    const priority = ['low', 'medium', 'high'][variant % 3]!
    const role = workflow === 'permission' ? 'viewer' : 'editor'
    const input = {
      workflow,
      project,
      assignee,
      taskId,
      priority,
      role,
      title: `Prepare delivery ${variant + 1}`,
    }
    const goal = {
      assign: `Assign task ${taskId} in ${project} to ${assignee}. Preserve its ${priority} priority and title. Record exactly one assignment activity.`,
      complete: `Complete task ${taskId} in ${project}. Preserve its title, assignee and priority. Update the completed-task count and record one activity.`,
      archive: `Archive task ${taskId} in ${project} without deleting it. Hide it from the active list but preserve its audit record and leave the other task unchanged.`,
      permission: `As a viewer, attempt to assign task ${taskId} in ${project} to ${assignee}. Verify permission denial without changing any task or adding a success activity.`,
    }[workflow]!
    const fault = {
      assign: variant % 2 ? 'reset-priority' : 'wrong-assignee',
      complete: variant % 2 ? 'stale-count' : 'duplicate-activity',
      archive: variant % 2 ? 'archive-other-task' : 'delete-instead',
      permission: variant % 2 ? 'denied-write' : 'permission-bypass',
    }[workflow]!
    return pairCases('taskboard', workflow, variant, input, goal, [goal], fault)
  }).flat(),
)
export const taskboardCases = formCases(cases, (s) => taskboardFields(s.workflow, s.input))
