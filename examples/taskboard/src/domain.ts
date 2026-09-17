// Task records and commands contain no benchmark routing or private fault labels.
import { z } from 'zod'
export interface Task {
  id: string
  project: string
  title: string
  assignee: string
  priority: string
  status: string
  archived: boolean
}
export interface Activity {
  id: string
  taskId: string
  actor: string
  kind: string
}
export interface BoardData {
  tasks: Task[]
  activities: Activity[]
  completedCount: number
  result: string
}
export interface BoardPolicy {
  project: string
  role: 'viewer' | 'editor'
  actor: string
  members: string[]
}
const text = z.string().trim().min(1).max(120)
export const boardCommand = z.discriminatedUnion('operation', [
  z.object({ operation: z.literal('assign'), taskId: text, assignee: text }),
  z.object({ operation: z.literal('complete'), taskId: text }),
  z.object({ operation: z.literal('archive'), taskId: text }),
])
export type BoardCommand = z.infer<typeof boardCommand>
export const parseBoardCommand = (values: Record<string, string>, operation: string) =>
  boardCommand.parse({ ...values, operation: operation === 'permission' ? 'assign' : operation })
export type BoardFault =
  | 'permission-bypass'
  | 'denied-write'
  | 'wrong-assignee'
  | 'reset-priority'
  | 'stale-count'
  | 'delete-instead'
  | 'archive-other-task'
  | 'duplicate-activity'
