// Validate saved reports before exposing them to the viewer.
import { z } from 'zod'
const assertion = z.object({ name: z.string(), passed: z.boolean() }).passthrough()
const check = z
  .object({
    complete: z.boolean(),
    assertions: z.array(assertion),
    invariants: z.array(assertion).optional(),
  })
  .passthrough()
const observation = z
  .object({
    fingerprint: z.string(),
    url: z.string(),
    text: z.string(),
    data: z.unknown(),
    errors: z.array(z.string()),
    network: z.array(z.object({ url: z.string(), status: z.number().nullable() }).passthrough()),
  })
  .passthrough()
const action = z.object({ id: z.string(), label: z.string(), kind: z.string() }).passthrough()
const runSchema = z
  .object({
    version: z.literal(1),
    id: z.string(),
    directory: z.string(),
    flow: z
      .object({
        id: z.string(),
        goal: z.string(),
        startUrl: z.string(),
        successCriteria: z.array(z.string()),
      })
      .passthrough(),
    status: z.enum(['passed', 'failed', 'incomplete', 'error']),
    reason: z.string(),
    durationMs: z.number().nonnegative(),
    startedAt: z.string(),
    initial: observation.optional(),
    initialCheck: check.optional(),
    initialEvidence: z.array(z.string()),
    steps: z.array(
      z
        .object({
          index: z.number().int(),
          action,
          before: observation,
          after: observation.optional(),
          check: check.optional(),
          evidence: z.array(z.string()),
        })
        .passthrough(),
    ),
    issues: z.array(
      z.object({
        source: z.enum(['assertion', 'model', 'execution']),
        step: z.number(),
        message: z.string(),
      }),
    ),
  })
  .passthrough()
export const summarySchema = z.object({
  runs: z.array(runSchema),
  usage: z
    .object({
      requests: z.number().nonnegative(),
      inputTokens: z.number().nonnegative(),
      outputTokens: z.number().nonnegative(),
      chargedTokens: z.number().nonnegative(),
    })
    .passthrough()
    .optional(),
  metadata: z.object({ policy: z.string().optional(), title: z.string().optional() }).optional(),
})
