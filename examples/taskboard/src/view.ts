// Project workspace separates active work, retained archive records, and the activity feed.
import type { Field, Inputs, View } from '../../../test/benchmarks/contracts.js'
import { controls, escape, stats, table } from '../../../test/benchmarks/ui.js'
import type { BoardData, BoardPolicy, Task } from './domain.js'
export function taskboardFields(operation: string, input: Inputs): Field[] {
  const fields: Field[] = [
    {
      name: 'taskId',
      label: 'Task',
      type: 'select',
      fixture: 'taskId',
      options: [String(input.taskId), 'T-OTHER', 'T-ANOTHER'].map((value) => ({
        value,
        label: value === input.taskId ? `${value} · ${input.title}` : value,
      })),
    },
  ]
  if (['assign', 'permission'].includes(operation))
    fields.push({
      name: 'assignee',
      label: 'Assign to',
      type: 'select',
      fixture: 'assignee',
      options: ['Ada', 'Lin', 'Sam', 'Other'].map((value) => ({ value, label: value })),
    })
  return fields
}
export function renderTaskboard(view: View): string {
  const data = view.data as unknown as BoardData & { policy: BoardPolicy }
  const row = (t: Task) => [t.id, t.title, t.assignee, t.priority, t.status]
  return (
    `<p class="identity">${escape(data.policy.project)} / Signed in as ${escape(data.policy.actor)} · ${escape(data.policy.role)}</p>` +
    stats([
      ['Active tasks', data.tasks.filter((t) => !t.archived).length],
      ['Completed', data.completedCount],
      ['Archived', data.tasks.filter((t) => t.archived).length],
    ]) +
    controls(view) +
    table(
      'Active tasks',
      ['Task', 'Title', 'Assignee', 'Priority', 'Status'],
      data.tasks.filter((t) => !t.archived).map(row),
    ) +
    table(
      'Archive register',
      ['Task', 'Title', 'Assignee', 'Priority', 'Status'],
      data.tasks.filter((t) => t.archived).map(row),
    ) +
    table(
      'Activity',
      ['Event', 'Task', 'Actor', 'Change'],
      data.activities.map((a) => [a.id, a.taskId, a.actor, a.kind]),
    )
  )
}
