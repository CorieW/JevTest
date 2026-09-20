// The web-viewer consumes saved-result DTOs; type-only imports never bundle the testing engine in React.
import type {
  Action,
  Assessment,
  Check,
  Choice,
  Flow,
  Issue,
  RunResult,
  Usage,
} from '../../src/types.js'
import type { observedState, stateChanges } from '../../src/evidence.js'

export type Outcome = RunResult['status']
export interface EvidenceFile {
  name: string
  url: string
  type: 'image' | 'snapshot'
}
export interface CapturedState {
  number: number
  title: string
  action?: Action
  selection?: Choice
  assessment?: Assessment
  check?: Check
  error?: string
  evidence: EvidenceFile[]
  observation?: ReturnType<typeof observedState> & { url: string }
  changes?: ReturnType<typeof stateChanges>
}
export interface ViewerRun {
  id: string
  flow: Flow
  status: Outcome
  reason: string
  startedAt: string
  durationMs: number
  issues: Issue[]
  trace?: string
  states: CapturedState[]
}
export interface ViewerSuite {
  graph: ViewerGraph
  id: number
  name: string
  totals: Record<Outcome, number>
  policy: string
  usage?: Usage
  startedAt?: string
  downloads: { summary?: string; report?: string; graph?: string }
  runs: ViewerRun[]
}
export type SuiteSummary = Omit<ViewerSuite, 'runs' | 'graph'> & { count: number }
export interface ViewerGraph {
  source: 'runs' | 'discovery' | 'application'
  complete?: boolean
  unmatchedRunStates?: number
  entryPoints?: { requested: number; opened: number }
  frontier: { from: string; action: { id: string; label: string; kind: string }; flowId: string }[]
  stopped?: string
  errors: string[]
  nodes: { id: string; url: string; text: string; references: { run: number; step: number }[] }[]
  edges: {
    from: string
    to: string
    action: { id: string; label: string; kind: string }
    references: { run: number; step: number }[]
  }[]
}
