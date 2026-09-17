// Taskboard service with independent task records, activity, visible counts, and role checks.
import {
  buttons,
  defineBenchmark,
  initialScreen,
  navigate,
  optionsFor,
  screenOnly,
  selectedIndex,
} from '../benchmarks/contracts.js'
import type { Screen, Scenario } from '../benchmarks/contracts.js'
import { taskboardCases } from './cases.js'
import { taskboardOracle } from './oracle.js'

export type Task = {
  id: string
  project: string
  title: string
  assignee: string
  priority: string
  status: string
  archived: boolean
}
export interface BoardState extends Screen {
  tasks: Task[]
  activities: string[]
  completedCount: number
  result: string
}
function labels(s: Scenario): [string, string, string] {
  return [
    `${s.input.taskId} in ${s.input.project}, assign to ${s.input.assignee}`,
    `T-OTHER in ${s.input.project}, assign to Other`,
    `${s.input.taskId} in ${s.input.project}, assign to Other`,
  ]
}
const menu = [
  { id: 'open-archive', label: 'Archive a task' },
  { id: 'open-permission', label: 'Request an assignment with the current role' },
  { id: 'open-assign', label: 'Assign a task to a teammate' },
  { id: 'open-complete', label: 'Mark a task complete' },
]
export const taskboard = defineBenchmark<BoardState>({
  slug: 'taskboard',
  title: 'Team task board',
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
    ],
    activities: [],
    completedCount: 0,
    result: 'pending',
  }),
  view: (state, s) => ({
    title: 'Team task board',
    screen: screenOnly(state),
    data: {
      currentRole: s.input.role!,
      permissionRule:
        'Only editors may change tasks. Viewers may submit requests but must receive a denial.',
      tasks: state.tasks,
      activeTaskIds: state.tasks.filter((t) => !t.archived).map((t) => t.id),
      completedCount: state.completedCount,
      activities: state.activities,
      result: state.result,
      selection: state.selected ? labels(s)[selectedIndex(state, s)]! : null,
    },
    buttons: buttons(state, menu, optionsFor(s, labels(s))),
  }),
  reduce(state, action, s) {
    const moved = navigate(state, action)
    if (moved) return { state: moved }
    const next = structuredClone(state)
    next.screen = 'done'
    const choice = selectedIndex(state, s)
    const fault = choice === 0 && state.operation === s.workflow ? s.fault : null
    const task = next.tasks[choice === 1 ? 1 : 0]!
    if (s.input.role === 'viewer' && fault !== 'permission-bypass') {
      next.result = 'denied'
      if (fault === 'denied-write') task.assignee = String(s.input.assignee)
    } else {
      if (state.operation === 'assign' || state.operation === 'permission') {
        task.assignee =
          fault === 'wrong-assignee' || choice !== 0 ? 'Other' : String(s.input.assignee)
        if (fault === 'reset-priority') task.priority = 'unset'
        next.result = 'assigned'
      } else if (state.operation === 'complete') {
        task.status = 'complete'
        if (fault !== 'stale-count') next.completedCount++
        next.result = 'completed'
      } else if (state.operation === 'archive') {
        if (fault === 'delete-instead') next.tasks = next.tasks.filter((t) => t.id !== task.id)
        else if (fault === 'archive-other-task') next.tasks[1]!.archived = true
        else task.archived = true
        next.result = 'archived'
      }
      next.activities.push(`${next.result}: ${task.id}`)
      if (fault === 'duplicate-activity') next.activities.push(`${next.result}: ${task.id}`)
    }
    next.notice = `Request processed: ${next.result}. Review task records and activity.`
    return { state: next, injected: Boolean(fault) }
  },
  oracle: taskboardOracle,
})
