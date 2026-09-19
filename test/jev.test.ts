// Mocked HTTP tests enforce bounded spend, protocol validation, uncertainty, and credential handling.
import { describe, expect, it } from 'vitest'
import { JevPolicy, TokenBudget } from '../src/jev.js'
import { ABORT } from '../src/types.js'
import type { DecisionContext } from '../src/types.js'

const context: DecisionContext = {
  flow: {
    id: 'test',
    goal: 'Checkout',
    startUrl: 'http://localhost',
    successCriteria: ['Confirmed'],
  },
  current: {
    fingerprint: 'a',
    url: 'http://localhost',
    text: 'Cart',
    actions: [{ id: 'checkout', label: 'Checkout', kind: 'click', selector: '#checkout' }],
    data: null,
    errors: [],
    network: [],
  },
  history: [],
}
const signal = () => new AbortController().signal
function response(
  choice = 'checkout',
  confidence = 0.9,
  probabilities: Record<string, number> = { checkout: 0.9, [ABORT]: 0.1 },
) {
  return new Response(
    JSON.stringify({
      model: 'jev-test',
      answers: { decision: { type: 'choice', choice, confidence, probabilities } },
      usage: { input_tokens: 123, output_tokens: 9 },
    }),
  )
}
describe('Jev policy', () => {
  it('uses the official endpoint and keeps credentials out of state', async () => {
    const policy = new JevPolicy({
      apiKey: 'test-secret',
      fetch: async (url, init) => {
        expect(url).toBe('https://api.typesafe.ai/v1/systemone')
        expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer test-secret')
        const body = JSON.parse(init?.body as string)
        expect(body.questions.decision.criteria[ABORT]).toContain('Abort')
        expect(init?.body).not.toContain('test-secret')
        return response()
      },
    })
    expect((await policy.select(context, signal())).choice).toBe('checkout')
    expect(policy.budget.usage.inputTokens).toBe(123)
  })
  it('rejects an invalid model action and still accounts for usage', async () => {
    const policy = new JevPolicy({ apiKey: 'key', fetch: async () => response('invented') })
    await expect(policy.select(context, signal())).rejects.toThrow('invalid choice')
    expect(policy.budget.usage.chargedTokens).toBe(132)
  })
  it('maps a weak assessment to uncertain while retaining probabilities', async () => {
    const policy = new JevPolicy({
      apiKey: 'key',
      fetch: async () =>
        response('unexpected', 0.2, { expected: 0.3, unexpected: 0.4, uncertain: 0.3 }),
    })
    const answer = await policy.assess(
      context,
      context.current.actions[0]!,
      context.current,
      signal(),
    )
    expect(answer.choice).toBe('uncertain')
    expect(answer.rawChoice).toBe('unexpected')
    expect(answer.probabilities.unexpected).toBe(0.4)
  })
  it('reserves shared budget before concurrent requests start', async () => {
    const budget = new TokenBudget(100_000, 1)
    let calls = 0
    const policy = new JevPolicy({
      apiKey: 'key',
      budget,
      fetch: async () => {
        calls++
        await new Promise((r) => setTimeout(r, 10))
        return response()
      },
    })
    const results = await Promise.allSettled([
      policy.select(context, signal()),
      policy.select(context, signal()),
    ])
    expect(calls).toBe(1)
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1)
    expect(budget.usage.reservedTokens).toBe(0)
  })
  it('makes no request when budget is too small', async () => {
    let calls = 0
    const policy = new JevPolicy({
      apiKey: 'key',
      budget: new TokenBudget(1),
      fetch: async () => {
        calls++
        return response()
      },
    })
    await expect(policy.select(context, signal())).rejects.toThrow('budget exhausted')
    expect(calls).toBe(0)
  })
  it('does not retry and charges unknown usage conservatively', async () => {
    let calls = 0
    const policy = new JevPolicy({
      apiKey: 'key',
      retries: 0,
      fetch: async () => {
        calls++
        return new Response('Do not echo secret response', { status: 429 })
      },
    })
    await expect(policy.select(context, signal())).rejects.toThrow('HTTP 429')
    expect(calls).toBe(1)
    expect(policy.budget.usage.chargedTokens).toBeGreaterThan(4096)
  })
  it('bounds transient inference retries and charges every attempt', async () => {
    let calls = 0
    const policy = new JevPolicy({
      apiKey: 'key',
      retryDelayMs: 1,
      fetch: async () => (++calls === 1 ? new Response('', { status: 503 }) : response()),
    })
    expect((await policy.select(context, signal())).choice).toBe('checkout')
    expect(calls).toBe(2)
    expect(policy.budget.usage.requests).toBe(2)
    expect(policy.budget.usage.chargedTokens).toBeGreaterThan(4096 + 132)
    expect(policy.budget.usage.reservedTokens).toBe(0)
  })
  it('never retries authentication errors', async () => {
    let calls = 0
    const policy = new JevPolicy({
      apiKey: 'key',
      retryDelayMs: 1,
      fetch: async () => {
        calls++
        return new Response('', { status: 401 })
      },
    })
    await expect(policy.select(context, signal())).rejects.toThrow('HTTP 401')
    expect(calls).toBe(1)
  })
  it('keeps independent requirement findings even when most checks pass', async () => {
    let calls = 0
    const policy = new JevPolicy({
      apiKey: 'key',
      fetch: async (_url, init) => {
        calls++
        const body = JSON.parse(init!.body as string)
        expect(Object.keys(body.questions)).toEqual(
          calls === 1 ? ['decision', 'requirement_1'] : ['requirement_1'],
        )
        expect(body.state).not.toHaveProperty('initialCheck')
        const result = await response('expected', 0.9, {
          expected: 0.95,
          unexpected: 0.03,
          uncertain: 0.02,
        }).json()
        // The API may return the same keys in a different order.
        result.answers = {
          requirement_1: {
            type: 'choice',
            choice: 'unexpected',
            confidence: 0.8,
            probabilities: { expected: 0.1, unexpected: 0.85, uncertain: 0.05 },
          },
          ...(calls === 1 ? { decision: result.answers.decision } : {}),
        }
        return new Response(JSON.stringify(result))
      },
    })
    const scoped = {
      ...context,
      flow: {
        ...context.flow,
        successCriteria: ['Enable the feature. Preserve the unrelated setting.'],
      },
    }
    const answer = await policy.assess(scoped, scoped.current.actions[0]!, scoped.current, signal())
    expect(answer.choice).toBe('unexpected')
    expect(answer.checks?.find((c) => c.requirement.startsWith('Preserve'))?.choice).toBe(
      'unexpected',
    )
    expect(answer.checks?.find((c) => c.requirement.startsWith('Enable'))?.choice).toBe('expected')
    expect(answer.usage?.inputTokens).toBe(246)
    expect(calls).toBe(2)
  })
  it('does not publish an allegation contradicted by independent evidence review', async () => {
    let calls = 0
    const policy = new JevPolicy({
      apiKey: 'key',
      fetch: async () =>
        ++calls === 1
          ? response('unexpected', 0.9, { unexpected: 0.95, expected: 0.03, uncertain: 0.02 })
          : response('expected', 0.9, { unexpected: 0.03, expected: 0.95, uncertain: 0.02 }),
    })
    const answer = await policy.assess(
      context,
      context.current.actions[0]!,
      context.current,
      signal(),
    )
    expect(answer.choice).toBe('uncertain')
    expect(answer.initialChecks?.[0]?.choice).toBe('unexpected')
    expect(calls).toBe(2)
  })
  it('keeps failed verification uncertain rather than publishing an unverified finding', async () => {
    let calls = 0
    const policy = new JevPolicy({
      apiKey: 'key',
      fetch: async () =>
        ++calls === 1
          ? response('unexpected', 0.9, { unexpected: 0.95, expected: 0.03, uncertain: 0.02 })
          : new Response('Do not expose this body', { status: 401 }),
    })
    const answer = await policy.assess(
      context,
      context.current.actions[0]!,
      context.current,
      signal(),
    )
    expect(answer.choice).toBe('uncertain')
    expect(answer.reviewError).toBe('TypeSafe HTTP 401')
    expect(answer.initialChecks?.[0]?.choice).toBe('unexpected')
  })
  it('accepts a strong finding corroborated by a weaker majority without inventing certainty', async () => {
    let calls = 0
    const policy = new JevPolicy({
      apiKey: 'key',
      fetch: async () =>
        ++calls === 1
          ? response('unexpected', 0.9, { unexpected: 0.95, expected: 0.03, uncertain: 0.02 })
          : response('unexpected', 0.4, { unexpected: 0.6, expected: 0.35, uncertain: 0.05 }),
    })
    const answer = await policy.assess(
      context,
      context.current.actions[0]!,
      context.current,
      signal(),
    )
    expect(answer.choice).toBe('unexpected')
    expect(answer.confidence).toBe(0.9)
    expect(answer.verificationChecks?.[0]?.confidence).toBe(0.4)
    expect(calls).toBe(2)
  })
  it('does not promote two weak majorities to a confident finding', async () => {
    const terminal = { ...context, current: { ...context.current, actions: [] } }
    let calls = 0
    const policy = new JevPolicy({
      apiKey: 'key',
      fetch: async () => {
        calls++
        return response('unexpected', 0.4, { unexpected: 0.6, expected: 0.35, uncertain: 0.05 })
      },
    })
    const answer = await policy.assess(
      terminal,
      context.current.actions[0]!,
      context.current,
      signal(),
    )
    expect(answer.choice).toBe('uncertain')
    expect(calls).toBe(2)
  })
  it('stops shared admission when a provider exceeds the request reservation', async () => {
    const budget = new TokenBudget(1_000_000)
    let calls = 0
    const policy = new JevPolicy({
      apiKey: 'key',
      budget,
      fetch: async () => {
        calls++
        const body = await response().json()
        body.usage.input_tokens = 500_000
        return new Response(JSON.stringify(body))
      },
    })
    await expect(policy.select(context, signal())).rejects.toThrow('reservation')
    await expect(policy.select(context, signal())).rejects.toThrow('budget exhausted')
    expect(calls).toBe(1)
  })
  it('rejects oversized payloads without spending tokens', async () => {
    const policy = new JevPolicy({ apiKey: 'key', maxPayloadBytes: 1 })
    await expect(policy.select(context, signal())).rejects.toThrow('payload exceeds')
    expect(policy.budget.usage.requests).toBe(0)
  })
})
