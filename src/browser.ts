// Playwright adapter supports explicit actions or bounded DOM discovery with fixture inputs.
import { chromium } from 'playwright'
import type { BrowserContext, Page } from 'playwright'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Action, Adapter, Check, Flow, Json, Observation, Session } from './types.js'
import { fingerprint, positiveInteger, redact, safeJson } from './util.js'

export interface BrowserOptions {
  headless?: boolean
  actionTimeoutMs?: number
  maxActions?: number
  allowedOrigins?: string[]
  inputFixtures?: Record<string, string[]>
  actions?: (page: Page, flow: Flow) => Promise<Action[]>
  setup?: (page: Page, flow: Flow, runId: string) => Promise<void>
  cleanup?: (flow: Flow, runId: string) => Promise<void>
  ready?: (page: Page) => Promise<void>
  readData?: (page: Page, flow: Flow) => Promise<Json>
  check: (page: Page, flow: Flow) => Promise<Check>
  normalize?: (observation: Omit<Observation, 'fingerprint'>) => Omit<Observation, 'fingerprint'>
  screenshots?: boolean
}

export async function discoverActions(
  page: Page,
  fixtures: Record<string, string[]> = {},
  maxActions = 40,
): Promise<Action[]> {
  positiveInteger(maxActions, 'maxActions')
  const controls = await page
    .locator('button, a[href], input, textarea, select, [role="button"]')
    .evaluateAll((elements) => {
      const selector = (el: Element) => {
        if (el.getAttribute('data-testid'))
          return `[data-testid=${JSON.stringify(el.getAttribute('data-testid'))}]`
        if (el.id) return `#${CSS.escape(el.id)}`
        const parts: string[] = []
        let current: Element | null = el
        while (current && current !== document.body) {
          const parent: Element | null = current.parentElement
          const siblings: Element[] = parent
            ? Array.from(parent.children).filter((e) => e.tagName === current!.tagName)
            : []
          parts.unshift(
            `${current.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(current) + 1})`,
          )
          current = parent
        }
        return `body > ${parts.join(' > ')}`
      }
      return elements
        .filter((el) => {
          const style = getComputedStyle(el)
          return (
            el.getClientRects().length > 0 &&
            style.visibility !== 'hidden' &&
            style.display !== 'none' &&
            !el.matches(':disabled, [aria-disabled="true"]')
          )
        })
        .map((el) => ({
          selector: selector(el),
          tag: el.tagName.toLowerCase(),
          type: el.getAttribute('type') ?? '',
          label: (
            el.getAttribute('aria-label') ??
            el.textContent ??
            el.getAttribute('name') ??
            el.id
          )
            .trim()
            .slice(0, 200),
        }))
    })
  const actions: Action[] = []
  for (const control of controls) {
    const { selector, tag, type, label } = control
    const add = (kind: Action['kind'], value?: string | boolean) =>
      actions.push({
        id: `dom-${fingerprint({ selector, kind, value })}`,
        label: `${kind} ${label || selector}${value === undefined ? '' : `: ${value}`}`,
        kind,
        selector,
        ...(value === undefined ? {} : { value }),
      })
    if (['password', 'hidden', 'file'].includes(type)) continue
    if (type === 'checkbox' || type === 'radio') add('check', true)
    else if (tag === 'select') for (const value of fixtures[selector] ?? []) add('select', value)
    else if (
      tag === 'textarea' ||
      (tag === 'input' && !['button', 'submit', 'reset'].includes(type))
    ) {
      for (const value of fixtures[selector] ?? []) add('fill', value)
    } else add('click')
  }
  return actions.sort((a, b) => a.id.localeCompare(b.id)).slice(0, maxActions)
}

export function createBrowserAdapter(options: BrowserOptions): Adapter {
  const timeout = positiveInteger(options.actionTimeoutMs ?? 5000, 'actionTimeoutMs')
  const maxActions = positiveInteger(options.maxActions ?? 40, 'maxActions')
  return {
    async open(flow, runId): Promise<Session> {
      const origin = new URL(flow.startUrl).origin
      if (!['http:', 'https:'].includes(new URL(flow.startUrl).protocol))
        throw new Error('Flow startUrl must use HTTP or HTTPS')
      const allowed = new Set([origin, ...(options.allowedOrigins ?? [])])
      const browser = await chromium.launch({ headless: options.headless ?? true })
      let context: BrowserContext | undefined
      let closed = false
      const close = async () => {
        if (closed) return
        closed = true
        try {
          await context?.close()
        } finally {
          try {
            await browser.close()
          } finally {
            await options.cleanup?.(flow, runId)
          }
        }
      }
      try {
        context = await browser.newContext({
          viewport: { width: 1280, height: 800 },
          locale: 'en-GB',
          timezoneId: 'UTC',
          serviceWorkers: 'block',
          acceptDownloads: false,
        })
        context.setDefaultTimeout(timeout)
        context.setDefaultNavigationTimeout(timeout)
        await context.route('**/*', async (route) => {
          const url = new URL(route.request().url())
          if (allowed.has(url.origin)) await route.continue()
          else await route.abort('blockedbyclient')
        })
        const page = await context.newPage()
        const errors: string[] = []
        const network: Observation['network'] = []
        const pushError = (message: string) => {
          errors.push(redact(message).slice(0, 1000))
          if (errors.length > 30) errors.shift()
        }
        const pushNetwork = (entry: Observation['network'][number]) => {
          network.push(safeJson(entry))
          if (network.length > 40) network.shift()
        }
        page.on('pageerror', (error) => pushError(error.message))
        page.on('console', (message) => {
          if (message.type() === 'error') pushError(message.text())
        })
        page.on('response', (response) =>
          pushNetwork({
            url: response.url(),
            method: response.request().method(),
            status: response.status(),
          }),
        )
        page.on('requestfailed', (request) =>
          pushNetwork({
            url: request.url(),
            method: request.method(),
            status: null,
            error: request.failure()?.errorText,
          }),
        )
        context.on('page', (popup) => {
          if (popup !== page) void popup.close().catch(() => {})
        })
        await options.setup?.(page, flow, runId)
        await page.goto(flow.startUrl, { waitUntil: 'domcontentloaded' })
        await options.ready?.(page)
        return {
          async observe() {
            if (!allowed.has(new URL(page.url()).origin))
              throw new Error('Browser left the allowed origins')
            const controls = await page.locator('input, select, textarea').evaluateAll((elements) =>
              elements.map((el) => {
                const input = el as HTMLInputElement
                return {
                  id: input.id,
                  name: input.name,
                  type: input.type,
                  value: /password|token|secret/i.test(`${input.type} ${input.name} ${input.id}`)
                    ? '[REDACTED]'
                    : input.value,
                  checked: input.checked ?? false,
                }
              }),
            )
            const actions = options.actions
              ? await options.actions(page, flow)
              : await discoverActions(page, options.inputFixtures, maxActions)
            if (actions.length > maxActions)
              throw new Error(`Action space exceeds maxActions (${maxActions})`)
            const raw: Omit<Observation, 'fingerprint'> = safeJson({
              url: page.url(),
              text: (await page.locator('body').innerText()).slice(0, 8000),
              data: { controls, application: (await options.readData?.(page, flow)) ?? null },
              actions,
              errors: [...errors],
              network: [...network],
            })
            const observed = options.normalize ? options.normalize(raw) : raw
            const stateKey = fingerprint({
              url: observed.url,
              text: observed.text,
              data: observed.data,
              actions: observed.actions,
            })
            return { ...observed, fingerprint: stateKey }
          },
          async execute(action) {
            if (!action.selector) throw new Error('Browser actions require a selector')
            const locator = page.locator(action.selector)
            if ((await locator.count()) !== 1)
              throw new Error(`Action selector must match exactly one element: ${action.selector}`)
            switch (action.kind) {
              case 'click':
                await locator.click()
                break
              case 'fill':
                if (typeof action.value !== 'string')
                  throw new Error('Fill requires a string fixture')
                await locator.fill(action.value)
                break
              case 'select':
                if (typeof action.value !== 'string')
                  throw new Error('Select requires a string fixture')
                await locator.selectOption(action.value)
                break
              case 'check':
                if (typeof action.value !== 'boolean')
                  throw new Error('Check requires a boolean fixture')
                await locator.setChecked(action.value)
                break
              default:
                throw new Error('Custom actions require a custom Adapter implementation')
            }
            await options.ready?.(page)
          },
          check: () => options.check(page, flow),
          async capture(directory, name) {
            const files: string[] = []
            const html = await page.evaluate(() => {
              const root = document.documentElement.cloneNode(true) as HTMLElement
              root.querySelectorAll('script').forEach((el) => el.remove())
              root.querySelectorAll('meta[http-equiv]').forEach((el) => el.remove())
              const policy = document.createElement('meta')
              policy.setAttribute('http-equiv', 'Content-Security-Policy')
              policy.content =
                "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"
              root.querySelector('head')?.prepend(policy)
              root.querySelectorAll('input,textarea').forEach((el) => {
                el.setAttribute('value', '[REDACTED]')
                if (el.tagName === 'TEXTAREA') el.textContent = '[REDACTED]'
              })
              return `<!doctype html>\n${root.outerHTML}`
            })
            const htmlName = `${name}.html`
            await writeFile(join(directory, htmlName), redact(html))
            files.push(htmlName)
            if (options.screenshots !== false) {
              const image = `${name}.png`
              await page.screenshot({
                path: join(directory, image),
                fullPage: true,
                timeout,
                mask: [page.locator('input, textarea, [data-sensitive]')],
              })
              files.push(image)
            }
            return files
          },
          close,
        }
      } catch (error) {
        await close()
        throw error
      }
    },
  }
}
