// HTTP regressions cover persistence, duplicate and stale requests, invalid input, and real browser forms.
import { afterAll, beforeAll, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { chromium } from 'playwright'
import { ledger } from '../examples/ledger/app.js'
import { taskboard } from '../examples/taskboard/app.js'
import { startBenchmark } from './benchmarks/host.js'
import type { BenchmarkHost } from './benchmarks/host.js'
import type { Reply } from './benchmarks/repository.js'
let host: BenchmarkHost
beforeAll(async () => {
  host = await startBenchmark(ledger)
})
afterAll(async () => {
  await host.close()
})
async function workspace(
  target = host,
  caseId = ledger.cases.find((c) => !c.fault && c.workflow === 'transfer')!.id,
) {
  const id = randomUUID(),
    cookie = `benchmark-run=${id}`
  await fetch(`${target.url}/case/${caseId}`, { headers: { Cookie: cookie } })
  const state = async () =>
    (await (
      await fetch(`${target.url}/api/state`, { headers: { Cookie: cookie } })
    ).json()) as Reply
  const send = async (
    action: string,
    revision: number,
    values: Record<string, string> = {},
    key = randomUUID(),
  ) => {
    const response = await fetch(`${target.url}/api/commands`, {
      method: 'POST',
      headers: {
        Cookie: cookie,
        'Content-Type': 'application/json',
        'If-Match': String(revision),
        'Idempotency-Key': key,
      },
      body: JSON.stringify({ action, values }),
    })
    return { status: response.status, body: (await response.json()) as Reply }
  }
  return { id, cookie, state, send }
}
it('rejects invalid forms and refuses mutation before review', async () => {
  const w = await workspace()
  await w.send('open-transfer', 0)
  expect((await w.send('review', 1, { recipient: 'Aster', amount: '0' })).status).toBe(422)
  const saved = await w.state()
  expect(saved.view.screen.screen).toBe('choose')
  expect(saved.view.screen.form?.amount).toBe('0')
  expect((await w.send('confirm', saved.revision)).status).toBe(409)
  expect((saved.view.data as { entries: unknown[] }).entries).toEqual([])
})
it('makes retried confirmations idempotent and rejects conflicting reuse', async () => {
  const w = await workspace()
  await w.send('open-transfer', 0)
  await w.send('review', 1, { recipient: 'Aster', amount: '10' })
  const key = randomUUID(),
    first = await w.send('confirm', 2, {}, key),
    repeat = await w.send('confirm', 2, {}, key)
  expect(repeat).toEqual(first)
  expect((await w.state()).revision).toBe(3)
  expect((first.body.view.data as { primary: number }).primary).toBe(490)
  expect((await w.send('back', 3, {}, key)).status).toBe(409)
})
it('rejects stale concurrent writes rather than losing one update', async () => {
  const w = await workspace()
  const results = await Promise.all([w.send('open-transfer', 0), w.send('open-refund', 0)])
  expect(results.map((r) => r.status).sort()).toEqual([200, 409])
  expect((await w.state()).revision).toBe(1)
})
it('persists across reloads and a server restart', async () => {
  let server = await startBenchmark(ledger)
  const w = await workspace(server)
  await w.send('open-transfer', 0)
  await w.send('review', 1, { recipient: 'Aster', amount: '10' })
  await w.send('confirm', 2)
  const expected = await w.state(),
    directory = server.storageDir
  await server.close()
  server = await startBenchmark(ledger, 0, { storageDir: directory })
  try {
    await fetch(`${server.url}/case/${ledger.cases[0]!.id}`, { headers: { Cookie: w.cookie } })
    const actual = await (
      await fetch(`${server.url}/api/state`, { headers: { Cookie: w.cookie } })
    ).json()
    expect(actual).toEqual(expected)
  } finally {
    await server.close()
  }
})
it('rejects malformed bodies, missing preconditions, and foreign origins', async () => {
  const w = await workspace()
  for (const [body, headers, expected] of [
    ['{', {}, 400],
    [JSON.stringify({ action: 'open-transfer' }), {}, 428],
    [JSON.stringify({ action: 'open-transfer' }), { Origin: 'https://outside.invalid' }, 403],
    [
      JSON.stringify({ action: 'open-transfer', values: { role: 'editor' }, fault: 'anything' }),
      {},
      400,
    ],
  ] as [string, Record<string, string>, number][]) {
    const result = await fetch(`${host.url}/api/commands`, {
      method: 'POST',
      headers: { Cookie: w.cookie, 'Content-Type': 'application/json', ...headers },
      body,
    })
    expect(result.status).toBe(expected)
  }
  expect((await w.state()).revision).toBe(0)
})
it('cannot promote a viewer by posting a role field', async () => {
  const server = await startBenchmark(taskboard)
  try {
    const scenario = taskboard.cases.find((c) => !c.fault && c.workflow === 'permission')!
    const w = await workspace(server, scenario.id)
    await w.send('open-assign', 0)
    await w.send('review', 1, { ...scenario.formValues, role: 'editor' })
    const result = await w.send('confirm', 2)
    expect((result.body.view.data as { result: string }).result).toBe('denied')
    expect((result.body.view.data as { activities: unknown[] }).activities).toEqual([])
  } finally {
    await server.close()
  }
})
it('renders usable forms, retains validation errors on reload, and supports editing before save', async () => {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  const ready = () =>
    page.waitForFunction(() => !(window as unknown as { benchmarkBusy: boolean }).benchmarkBusy)
  try {
    await page.goto(host.url)
    await page.getByRole('button', { name: 'Send a transfer', exact: true }).click()
    await ready()
    await page.getByLabel('Recipient account').selectOption('Aster')
    await page.getByLabel('Amount in credits').fill('0')
    await page.getByLabel('Amount in credits').press('Enter')
    await ready()
    expect(await page.getByRole('status').innerText()).toContain('amount')
    await page.reload()
    expect(await page.getByLabel('Amount in credits').inputValue()).toBe('0')
    await page.getByLabel('Amount in credits').fill('20')
    await page.getByRole('button', { name: 'Review changes', exact: true }).click()
    await ready()
    await page.getByRole('button', { name: 'Edit details', exact: true }).click()
    await ready()
    expect(await page.getByLabel('Amount in credits').inputValue()).toBe('20')
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await ready()
    expect(await page.locator('table').first().innerText()).toContain('500')
    expect(await page.locator('pre').count()).toBe(0)
  } finally {
    await browser.close()
  }
})
