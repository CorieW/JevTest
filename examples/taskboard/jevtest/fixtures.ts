// Private evaluation setup: public seed records and policy derived from each test fixture.
import type { Scenario } from '../../../test/benchmarks/contracts.js'
import type { BoardData, BoardPolicy } from '../src/domain.js'
const policy = (s: Scenario): BoardPolicy => ({
  project: String(s.input.project),
  role: s.input.role === 'viewer' ? 'viewer' : 'editor',
  actor: 'Morgan',
  members: ['Ada', 'Lin', 'Sam', 'Other'],
})

export const taskboardFixture: {
  policy: (s: Scenario) => BoardPolicy
  initial: (s: Scenario) => BoardData
} = {
  policy,
  initial: (s) => ({
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
}
