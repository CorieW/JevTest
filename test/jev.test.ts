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
      fetch: async () => {
        calls++
        return new Response('Do not echo secret response', { status: 429 })
      },
    })
    await expect(policy.select(context, signal())).rejects.toThrow('HTTP 429')
    expect(calls).toBe(1)
    expect(policy.budget.usage.chargedTokens).toBeGreaterThan(4096)
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
