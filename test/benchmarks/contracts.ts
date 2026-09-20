// Benchmark labels stay on the evaluator/server side, outside the model-visible contracts.
import { createHash } from 'node:crypto'
import type { Check, Flow, Json } from '../../src/types.js'

export type Inputs = Record<string, string | number | boolean>
export interface Scenario {
  id: string
  pairId: string
  workflow: string
  variant: number
  fault: string | null
  input: Inputs
  goal: string
  criteria: string[]
  referenceActions: string[]
  formValues?: Record<string, string>
}
export interface Screen {
  screen: 'home' | 'choose' | 'review' | 'done'
  operation: string
  selected: string
  notice: string
  form?: Record<string, string>
}
export interface Button {
  id: string
  label: string
}
export interface View {
  title: string
  screen: Screen
  data: Json
  buttons: Button[]
  fields?: Field[]
}
export interface Field {
  name: string
  label: string
  type: 'text' | 'number' | 'select'
  fixture: string
  value?: string
  options?: { value: string; label: string }[]
}
export interface Transition<S> {
  state: S
  injected?: boolean
  status?: number
}
export interface Definition<S extends Screen> {
  slug: string
  title: string
  cases: Scenario[]
  initial: (scenario: Scenario) => S
  view: (state: S, scenario: Scenario) => View
  reduce: (
    state: S,
    action: string,
    scenario: Scenario,
    values?: Record<string, string>,
  ) => Transition<S>
  oracle: (state: S, input: Inputs) => Check
  restore: (view: View) => S
  render: (view: View) => string
}
export type Benchmark = Definition<Screen>
export function defineBenchmark<S extends Screen>(definition: Definition<S>): Benchmark {
  // Only this host boundary erases the domain state type; a session never changes application.
  return {
    ...definition,
    view: (state, scenario) => definition.view(state as S, scenario),
    reduce: (state, action, scenario, values) =>
      definition.reduce(state as S, action, scenario, values),
    oracle: (state, input) => definition.oracle(state as S, input),
  }
}
export function opaqueId(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}
export function pairCases(
  slug: string,
  workflow: string,
  variant: number,
  input: Inputs,
  goal: string,
  criteria: string[],
  fault: string,
): Scenario[] {
  const pairId = opaqueId(`${slug}/${workflow}/${variant}`)
  return [null, fault].map((label) => ({
    id: `case-${opaqueId(`${pairId}/${label ?? 'control'}`)}`,
    pairId,
    workflow,
    variant,
    fault: label,
    input,
    goal,
    criteria,
    referenceActions: [],
  }))
}
export function asFlow(scenario: Scenario, baseUrl: string): Flow {
  return {
    id: scenario.id,
    goal: scenario.goal,
    startUrl: `${baseUrl}/case/${scenario.id}`,
    fixtures: scenario.input,
    successCriteria: scenario.criteria,
  }
}
