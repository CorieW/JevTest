// The runner owns limits, isolated sessions, exact assertions, and durable evidence.
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { ABORT } from './types.js'
import type { Adapter, Check, Flow, Limits, Policy, RunResult, Session } from './types.js'
import { BudgetExceeded } from './jev.js'
import { errorMessage, positiveInteger, safeJson } from './util.js'

export const defaultLimits: Limits = {
  maxSteps: 25,
  timeoutMs: 120_000,
  maxRepetitions: 3,
  concurrency: 2,
}
export function validateLimits(options: Partial<Limits> = {}): Limits {
  const limits = { ...defaultLimits, ...options }
  for (const [name, value] of Object.entries(limits)) positiveInteger(value, name)
  return limits
}
export function checkOutcome(
  check: Check,
): { status: 'passed' | 'failed'; reason: string } | undefined {
  const failed = [...(check.invariants ?? []), ...(check.complete ? check.assertions : [])].filter(
    (a) => !a.passed,
  )
  if (failed.length) return { status: 'failed', reason: failed.map((a) => a.name).join('; ') }
  if (check.complete && check.assertions.length > 0)
    return { status: 'passed', reason: 'All deterministic success assertions passed' }
  if (check.complete)
    throw new Error('Completion requires at least one deterministic success assertion')
  return undefined
}
export async function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error('Operation aborted'))
    signal.addEventListener('abort', abort, { once: true })
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}
export async function saveResult(result: RunResult): Promise<void> {
  await writeFile(
    resolve(result.directory, 'trace.json'),
    JSON.stringify(safeJson(result), null, 2),
  )
}
export async function runFlow(options: {
  flow: Flow
  adapter: Adapter
  policy: Policy
  outputDir?: string
  limits?: Partial<Limits>
  signal?: AbortSignal
}): Promise<RunResult> {
  const limits = validateLimits(options.limits)
  const started = Date.now()
  const id = `${options.flow.id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}-${randomUUID()}`
  const directory = resolve(options.outputDir ?? 'artifacts', id)
  await mkdir(directory, { recursive: true })
  const controller = new AbortController()
  const signal = options.signal
    ? AbortSignal.any([controller.signal, options.signal])
    : controller.signal
  const timer = setTimeout(
    () => controller.abort(new Error('Flow time limit reached')),
    limits.timeoutMs,
  )
  const result: RunResult = {
    version: 1,
    id,
    flow: options.flow,
    status: 'incomplete',
    reason: 'Step limit reached',
    startedAt: new Date(started).toISOString(),
    durationMs: 0,
    steps: [],
    issues: [],
    initialEvidence: [],
    directory,
  }
  let session: Session | undefined
  const finishCheck = (check: Check, step: number) => {
    const outcome = checkOutcome(check)
    if (!outcome) return false
    Object.assign(result, outcome)
    if (outcome.status === 'failed')
      result.issues.push({ source: 'assertion', step, message: outcome.reason })
    return true
  }
  try {
    signal.throwIfAborted()
    const opening = options.adapter.open(options.flow, id)
    // If setup finishes after cancellation, still dispose its browser context.
    opening.then(
      (s) => {
        if (signal.aborted) void s.close().catch(() => {})
      },
      () => {},
    )
    session = await bounded(opening, signal)
    let current = await bounded(session.observe(), signal)
    result.initial = current
    result.initialEvidence = await bounded(session.capture(directory, 'initial'), signal)
    result.initialCheck = await bounded(session.check(), signal)
    if (!finishCheck(result.initialCheck, 0)) {
      const repetitions = new Map<string, number>()
      for (let index = 1; index <= limits.maxSteps; index++) {
        signal.throwIfAborted()
        const ids = current.actions.map((a) => a.id)
        if (new Set(ids).size !== ids.length || ids.includes(ABORT))
          throw new Error('Action IDs must be unique and cannot use __abort__')
        const history = result.steps.map((s) => ({
          action: s.action.id,
          judgment: s.assessment?.choice ?? ('uncertain' as const),
        }))
        const selection = await bounded(
          options.policy.select({ flow: options.flow, current, history }, signal),
          signal,
        )
        if (selection.choice === ABORT) {
          result.stopDecision = selection
          result.reason = 'Policy chose Abort testing'
          break
        }
        const action = current.actions.find((a) => a.id === selection.choice)
        if (!action) throw new Error('Policy selected an unavailable action')
        const repeatKey = `${current.fingerprint}:${action.id}`
        const count = (repetitions.get(repeatKey) ?? 0) + 1
        if (count > limits.maxRepetitions) {
          result.reason = 'State/action repetition limit reached'
          break
        }
        repetitions.set(repeatKey, count)
        const step = {
          index,
          before: current,
          action,
          selection,
          evidence: [],
        } as RunResult['steps'][number]
        result.steps.push(step)
        try {
          await bounded(session.execute(action), signal)
        } catch (error) {
          if (signal.aborted) throw error
          step.error = errorMessage(error)
          step.after = await bounded(session.observe(), signal)
          step.evidence = await bounded(session.capture(directory, `step-${index}`), signal)
          result.issues.push({ source: 'execution', step: index, message: step.error })
          result.status = 'failed'
          result.reason = 'Application action failed'
          break
        }
        step.after = await bounded(session.observe(), signal)
        step.check = await bounded(session.check(), signal)
        step.evidence = await bounded(session.capture(directory, `step-${index}`), signal)
        current = step.after
        // Assertions remain authoritative even when subsequent API assessment fails.
        const terminal = finishCheck(step.check, index)
        try {
          step.assessment = await bounded(
            options.policy.assess(
              { flow: options.flow, current, history },
              action,
              step.before,
              signal,
            ),
            signal,
          )
          if (step.assessment.choice === 'unexpected')
            result.issues.push({
              source: 'model',
              step: index,
              message: `Unexpected result after ${action.label}; candidate requires review`,
            })
        } catch (error) {
          if (!terminal) throw error
          step.error = `Assessment unavailable: ${errorMessage(error)}`
        }
        await saveResult(result)
        if (terminal) break
      }
    }
  } catch (error) {
    result.status = signal.aborted || error instanceof BudgetExceeded ? 'incomplete' : 'error'
    result.reason = errorMessage(signal.aborted ? signal.reason : error)
  } finally {
    clearTimeout(timer)
    if (session) {
      try {
        await bounded(session.close(), AbortSignal.timeout(5000))
      } catch (error) {
        result.reason += `; cleanup: ${errorMessage(error)}`
      }
    }
    result.durationMs = Date.now() - started
    await saveResult(result)
  }
  return safeJson(result)
}
export async function runSuite(options: {
  flows: Flow[]
  adapter: Adapter
  policy: Policy
  outputDir?: string
  limits?: Partial<Limits>
  signal?: AbortSignal
}): Promise<RunResult[]> {
  const limits = validateLimits(options.limits)
  if (!options.flows.length) throw new Error('Provide at least one flow')
  if (new Set(options.flows.map((f) => f.id)).size !== options.flows.length)
    throw new Error('Flow IDs must be unique')
  const results: RunResult[] = new Array(options.flows.length)
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(limits.concurrency, options.flows.length) }, async () => {
      while (cursor < options.flows.length) {
        const index = cursor++
        results[index] = await runFlow({ ...options, flow: options.flows[index]!, limits })
      }
    }),
  )
  return results
}
