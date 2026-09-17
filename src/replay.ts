// Replay reuses recorded typed actions, rejecting changed state without making model calls.
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Adapter, RunResult, Session } from './types.js'
import { bounded, checkOutcome } from './runner.js'
import { errorMessage, stable } from './util.js'

export interface ReplayResult {
  sourceRun: string
  reproduced: boolean
  stepsExecuted: number
  reason: string
  directory: string
}
export async function replay(
  trace: RunResult,
  adapter: Adapter,
  outputDir = 'artifacts',
  timeoutMs = 120_000,
): Promise<ReplayResult> {
  const id = `replay-${randomUUID()}`
  const directory = resolve(outputDir, id)
  await mkdir(directory, { recursive: true })
  const result: ReplayResult = {
    sourceRun: trace.id,
    reproduced: false,
    stepsExecuted: 0,
    reason: '',
    directory,
  }
  const signal = AbortSignal.timeout(timeoutMs)
  let session: Session | undefined
  try {
    const opening = adapter.open(trace.flow, id)
    opening.then(
      (s) => {
        if (signal.aborted) void s.close().catch(() => {})
      },
      () => {},
    )
    session = await bounded(opening, signal)
    const initial = await bounded(session.observe(), signal)
    if (!trace.initial || initial.fingerprint !== trace.initial.fingerprint)
      throw new Error('Initial state diverged')
    const initialCheck = await bounded(session.check(), signal)
    if (stable(initialCheck) !== stable(trace.initialCheck))
      throw new Error('Initial assertions diverged')
    for (const step of trace.steps) {
      const before = await bounded(session.observe(), signal)
      if (before.fingerprint !== step.before.fingerprint)
        throw new Error(`State diverged before step ${step.index}`)
      const action = before.actions.find((a) => a.id === step.action.id)
      if (!action || stable(action) !== stable(step.action))
        throw new Error(`Action changed at step ${step.index}`)
      let executionError: string | undefined
      try {
        await bounded(session.execute(action), signal)
      } catch (error) {
        executionError = errorMessage(error)
      }
      const expectedExecutionFailure = trace.issues.some(
        (i) => i.source === 'execution' && i.step === step.index,
      )
      if (Boolean(executionError) !== expectedExecutionFailure)
        throw new Error(`Execution result diverged at step ${step.index}`)
      const after = await bounded(session.observe(), signal)
      if (!step.after || after.fingerprint !== step.after.fingerprint)
        throw new Error(`State diverged after step ${step.index}`)
      if (step.check && stable(await bounded(session.check(), signal)) !== stable(step.check))
        throw new Error(`Assertions diverged at step ${step.index}`)
      await bounded(session.capture(directory, `step-${step.index}`), signal)
      result.stepsExecuted++
    }
    const last = trace.steps.at(-1)
    const outcome = checkOutcome(await bounded(session.check(), signal))
    if (trace.status === 'passed' && outcome?.status !== 'passed')
      throw new Error('Success criteria no longer pass')
    if (
      trace.status === 'failed' &&
      !trace.issues.some((i) => i.source === 'execution') &&
      outcome?.status !== 'failed'
    )
      throw new Error('Deterministic failure no longer occurs')
    if (trace.status === 'error' || (last && !last.after))
      throw new Error('Source trace ended before an observable result')
    result.reproduced = true
    result.reason =
      'Recorded states, actions, and deterministic assertions reproduced; model judgments were not rerun'
  } catch (error) {
    result.reason = errorMessage(error)
  } finally {
    if (session)
      await bounded(session.close(), AbortSignal.timeout(5000)).catch((error) => {
        result.reproduced = false
        result.reason += `; cleanup: ${errorMessage(error)}`
      })
    await writeFile(resolve(directory, 'replay.json'), JSON.stringify(result, null, 2))
  }
  return result
}
