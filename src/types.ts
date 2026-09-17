// Public contracts keep model judgments separate from observed application facts.
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export interface Action {
  id: string
  label: string
  kind: 'click' | 'fill' | 'select' | 'check' | 'custom'
  selector?: string
  value?: string | boolean
  expected?: string
}
export interface Observation {
  fingerprint: string
  url: string
  text: string
  data: Json
  actions: Action[]
  errors: string[]
  network: { url: string; method: string; status: number | null; error?: string }[]
}
export interface Assertion {
  name: string
  passed: boolean
  expected?: Json
  actual?: Json
}
export interface Check {
  complete: boolean
  assertions: Assertion[]
  invariants?: Assertion[]
}
export interface Flow {
  id: string
  goal: string
  startUrl: string
  fixtures?: Json
  successCriteria: string[]
}
export interface Session {
  observe(): Promise<Observation>
  execute(action: Action): Promise<void>
  check(): Promise<Check>
  capture(directory: string, name: string): Promise<string[]>
  close(): Promise<void>
}
export interface Adapter {
  open(flow: Flow, runId: string): Promise<Session>
}
export interface Choice {
  choice: string
  confidence: number
  probabilities: Record<string, number>
  model?: string
  usage?: { inputTokens: number; outputTokens: number }
}
export type Judgment = 'expected' | 'unexpected' | 'uncertain'
export interface Assessment extends Choice {
  choice: Judgment
  rawChoice?: Judgment
  checks?: {
    requirement: string
    choice: Judgment
    confidence: number
    probabilities: Record<string, number>
  }[]
  initialChecks?: Assessment['checks']
  verificationChecks?: Assessment['checks']
  reviewError?: string
}
export interface DecisionContext {
  flow: Flow
  current: Observation
  history: {
    action: string
    judgment: Judgment
    label?: string
    beforeState?: string
    afterState?: string
    changed?: boolean
  }[]
}
export interface Policy {
  select(context: DecisionContext, signal: AbortSignal): Promise<Choice>
  assess(
    context: DecisionContext,
    action: Action,
    before: Observation,
    signal: AbortSignal,
  ): Promise<Assessment>
}
export interface Limits {
  maxSteps: number
  timeoutMs: number
  maxRepetitions: number
  concurrency: number
  cleanupTimeoutMs?: number
}
export interface Issue {
  source: 'assertion' | 'model' | 'execution'
  step: number
  message: string
}
export interface TraceStep {
  index: number
  before: Observation
  action: Action
  selection: Choice
  after?: Observation
  assessment?: Assessment
  check?: Check
  evidence: string[]
  error?: string
}
export interface RunResult {
  version: 1
  id: string
  flow: Flow
  status: 'passed' | 'failed' | 'incomplete' | 'error'
  reason: string
  startedAt: string
  durationMs: number
  initial?: Observation
  initialCheck?: Check
  initialEvidence: string[]
  stopDecision?: Choice
  steps: TraceStep[]
  issues: Issue[]
  directory: string
}
export interface Usage {
  requests: number
  inputTokens: number
  outputTokens: number
  chargedTokens: number
  reservedTokens: number
}
export interface Project {
  flows: Flow[]
  adapter: Adapter
  limits?: Partial<Limits>
  outputDir?: string
  webServer?: WebServer
  dispose?: () => Promise<void>
}
export type ProjectConfig = Project | (() => Project | Promise<Project>)
export interface WebServer {
  command: string
  url: string
  cwd?: string
  timeoutMs?: number
  reuseExistingServer?: boolean
}
export const ABORT = '__abort__'
