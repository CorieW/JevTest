// Declarative browser projects retain exact checks while using bounded DOM action discovery.
import type { Page } from 'playwright'
import { createBrowserAdapter, discoverActions } from './browser.js'
import type { BrowserOptions } from './browser.js'
import type { Assertion, Flow, Json, Project } from './types.js'
import { validateProject } from './config.js'

export interface BrowserCheck {
  name: string
  evaluate: (page: Page, flow: Flow) => Promise<Omit<Assertion, 'name'>>
}
export interface BrowserFlow {
  id: string
  goal: string
  path?: string
  fixtures?: Json
  inputs?: Record<string, string[]>
  completeWhen: string | ((page: Page, flow: Flow) => Promise<boolean>)
  checks: BrowserCheck[]
  invariants?: BrowserCheck[]
}
export interface BrowserProject {
  baseUrl: string
  ready?: string | BrowserOptions['ready']
  flows: BrowserFlow[]
  browser?: Omit<BrowserOptions, 'check' | 'ready'>
  limits?: Project['limits']
  outputDir?: string
}
export const checks = {
  visible: (selector: string, name = `Visible: ${selector}`): BrowserCheck => ({
    name,
    evaluate: async (page) => ({
      passed: await page.locator(selector).isVisible(),
      expected: true,
    }),
  }),
  count: (
    selector: string,
    expected: number,
    name = `Count ${selector} equals ${expected}`,
  ): BrowserCheck => {
    if (!Number.isSafeInteger(expected) || expected < 0)
      throw new Error('Check count must be a non-negative integer')
    return {
      name,
      evaluate: async (page) => {
        const actual = await page.locator(selector).count()
        return { passed: actual === expected, expected, actual }
      },
    }
  },
  text: (
    selector: string,
    expected: string,
    name = `Text ${selector} equals ${expected}`,
  ): BrowserCheck => ({
    name,
    evaluate: async (page) => {
      const element = page.locator(selector)
      const actual = (await element.count()) === 1 ? await element.innerText() : null
      return { passed: actual === expected, expected, actual }
    },
  }),
  pending: (name = 'TODO: define an exact success check'): BrowserCheck => ({
    name,
    evaluate: async () => ({ passed: false, actual: 'Check not implemented' }),
  }),
}

export function defineProject(options: BrowserProject): Project {
  if (!Array.isArray(options.flows) || !options.flows.length)
    throw new Error('Config flows: expected at least one flow')
  const definitions = new Map<string, BrowserFlow>()
  const flows = options.flows.map((definition, index): Flow => {
    const field = `flows[${index}] (${definition.id})`
    if (
      !definition.completeWhen ||
      !['string', 'function'].includes(typeof definition.completeWhen)
    )
      throw new Error(`Config ${field}.completeWhen: provide a selector or predicate`)
    if (!Array.isArray(definition.checks) || !definition.checks.length)
      throw new Error(`Config ${field}.checks: provide at least one exact check`)
    for (const check of [...definition.checks, ...(definition.invariants ?? [])])
      if (!check?.name?.trim() || typeof check.evaluate !== 'function')
        throw new Error(`Config ${field}.checks: invalid named check`)
    for (const [selector, values] of Object.entries(definition.inputs ?? {}))
      if (
        !selector.trim() ||
        !Array.isArray(values) ||
        !values.length ||
        values.some((value) => typeof value !== 'string')
      )
        throw new Error(`Config ${field}.inputs: provide selector-to-string-array mappings`)
    let startUrl: string
    try {
      startUrl = new URL(definition.path ?? '', options.baseUrl).href
    } catch {
      throw new Error(`Config ${field}.path/baseUrl: invalid URL`)
    }
    definitions.set(definition.id, definition)
    return {
      id: definition.id,
      goal: definition.goal,
      startUrl,
      fixtures: definition.fixtures,
      successCriteria: definition.checks.map((check) => check.name),
    }
  })
  const evaluate = (items: BrowserCheck[], page: Page, flow: Flow) =>
    Promise.all(
      items.map(async (check) => ({ ...(await check.evaluate(page, flow)), name: check.name })),
    )
  const project: Project = {
    flows,
    limits: options.limits,
    outputDir: options.outputDir,
    adapter: createBrowserAdapter({
      ...options.browser,
      ready:
        typeof options.ready === 'string'
          ? async (page) => {
              await page.locator(options.ready as string).waitFor({ state: 'visible' })
            }
          : options.ready,
      actions:
        options.browser?.actions ??
        ((page, flow) =>
          discoverActions(
            page,
            definitions.get(flow.id)!.inputs ?? options.browser?.inputFixtures,
            options.browser?.maxActions,
          )),
      check: async (page, flow) => {
        const definition = definitions.get(flow.id)!
        return {
          complete:
            typeof definition.completeWhen === 'string'
              ? await page.locator(definition.completeWhen).isVisible()
              : await definition.completeWhen(page, flow),
          assertions: await evaluate(definition.checks, page, flow),
          invariants: await evaluate(definition.invariants ?? [], page, flow),
        }
      },
    }),
  }
  validateProject(project)
  return project
}
