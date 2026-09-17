// Score detection only after a fault is exercised; infrastructure errors and navigation failures stay distinct.
import type { RunResult } from '../../src/types.js'
import type { Scenario } from './contracts.js'
import type { Audit } from './host.js'
import type { ReplayResult } from '../../src/replay.js'

export function scoreCase(
  scenario: Scenario,
  run: RunResult,
  audit: Audit,
  reproduction: ReplayResult,
) {
  const exposed = audit.injectedAt !== null
  const afterExposure = (step: number) => exposed && step >= audit.injectedAt!
  const modelIssues = run.issues.filter((i) => i.source === 'model')
  const assertionIssues = run.issues.filter((i) => i.source === 'assertion')
  const modelDetected = modelIssues.some((i) => afterExposure(i.step))
  const assertionDetected = assertionIssues.some((i) => afterExposure(i.step))
  const misplacedModelWarning = modelIssues.some((i) => !afterExposure(i.step))
  return {
    id: scenario.id,
    pairId: scenario.pairId,
    workflow: scenario.workflow,
    variant: scenario.variant,
    fault: scenario.fault,
    status: run.status,
    reason: run.reason,
    exposed,
    injectedAt: audit.injectedAt,
    modelDetected,
    assertionDetected,
    combinedDetected: modelDetected || assertionDetected,
    misplacedModelWarning,
    modelFlagged: modelIssues.length > 0,
    combinedFlagged: run.issues.length > 0,
    reproduced: reproduction.reproduced,
    replayReason: reproduction.reason,
    steps: run.steps.length,
    durationMs: run.durationMs,
    actions: run.steps.map((s) => s.action.id),
    assessments: run.steps.map((s) => ({
      step: s.index,
      choice: s.assessment?.choice ?? null,
      rawChoice: s.assessment?.rawChoice ?? null,
      confidence: s.assessment?.confidence ?? null,
    })),
    failedAssertions: run.steps.flatMap((s) =>
      (s.check?.complete ? s.check.assertions : [])
        .filter((a) => !a.passed)
        .map((a) => ({ step: s.index, ...a })),
    ),
    models: [
      ...new Set(
        run.steps.flatMap((s) => [s.selection.model, s.assessment?.model]).filter(Boolean),
      ),
    ],
    inputTokens: run.steps.reduce(
      (n, s) => n + (s.selection.usage?.inputTokens ?? 0) + (s.assessment?.usage?.inputTokens ?? 0),
      run.stopDecision?.usage?.inputTokens ?? 0,
    ),
    outputTokens: run.steps.reduce(
      (n, s) =>
        n + (s.selection.usage?.outputTokens ?? 0) + (s.assessment?.usage?.outputTokens ?? 0),
      run.stopDecision?.usage?.outputTokens ?? 0,
    ),
    uncertainAssessments: run.steps.filter((s) => s.assessment?.choice === 'uncertain').length,
    assessmentErrors: run.steps.filter((s) => s.error?.startsWith('Assessment unavailable')).length,
  }
}
export type CaseScore = ReturnType<typeof scoreCase>
const ratio = (n: number, d: number) => (d ? n / d : null)
export function summarize(rows: CaseScore[]) {
  const faulty = rows.filter((r) => r.fault !== null)
  const healthy = rows.filter((r) => r.fault === null)
  const exposed = faulty.filter((r) => r.exposed)
  const modelTP = faulty.filter((r) => r.modelDetected).length
  const combinedTP = faulty.filter((r) => r.combinedDetected).length
  const modelFP = healthy.filter((r) => r.modelFlagged).length
  const combinedFP = healthy.filter((r) => r.combinedFlagged).length
  return {
    flows: rows.length,
    healthy: healthy.length,
    faulty: faulty.length,
    exposed: exposed.length,
    model: {
      truePositives: modelTP,
      falseNegatives: faulty.length - modelTP,
      falsePositives: modelFP,
      trueNegatives: healthy.length - modelFP,
      precision: ratio(modelTP, modelTP + modelFP),
      recall: ratio(modelTP, faulty.length),
      exposedRecall: ratio(modelTP, exposed.length),
      falsePositiveRate: ratio(modelFP, healthy.length),
    },
    combined: {
      truePositives: combinedTP,
      falseNegatives: faulty.length - combinedTP,
      falsePositives: combinedFP,
      trueNegatives: healthy.length - combinedFP,
      precision: ratio(combinedTP, combinedTP + combinedFP),
      recall: ratio(combinedTP, faulty.length),
      falsePositiveRate: ratio(combinedFP, healthy.length),
    },
    healthyCompleted: healthy.filter((r) => r.status === 'passed').length,
    terminal: rows.filter((r) => ['passed', 'failed'].includes(r.status)).length,
    incomplete: rows.filter((r) => r.status === 'incomplete').length,
    errors: rows.filter((r) => r.status === 'error').length,
    replayed: rows.filter((r) => r.reproduced).length,
    unexposedModelWarnings: rows.filter((r) => r.misplacedModelWarning).length,
    uncertainAssessments: rows.reduce((n, r) => n + r.uncertainAssessments, 0),
    assessmentErrors: rows.reduce((n, r) => n + r.assessmentErrors, 0),
    byFault: [...new Set(faulty.map((r) => r.fault!))].sort().map((fault) => {
      const cases = faulty.filter((r) => r.fault === fault)
      return {
        fault,
        total: cases.length,
        exposed: cases.filter((r) => r.exposed).length,
        modelDetected: cases.filter((r) => r.modelDetected).length,
        combinedDetected: cases.filter((r) => r.combinedDetected).length,
      }
    }),
  }
}
