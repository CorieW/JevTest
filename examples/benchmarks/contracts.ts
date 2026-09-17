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
}
export interface Screen {
  screen: 'home' | 'choose' | 'review' | 'done'
  operation: string
  selected: string
  notice: string
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
  reduce: (state: S, action: string, scenario: Scenario) => Transition<S>
  oracle: (state: S, input: Inputs) => Check
}
export type Benchmark = Definition<Screen>
export function defineBenchmark<S extends Screen>(definition: Definition<S>): Benchmark {
  // Only this host boundary erases the domain state type; a session never changes application.
  return {
    ...definition,
    view: (state, scenario) => definition.view(state as S, scenario),
    reduce: (state, action, scenario) => definition.reduce(state as S, action, scenario),
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
    referenceActions: [`open-${workflow}`, `option-${variant % 3}`, 'confirm'],
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
export const initialScreen = (): Screen => ({
  screen: 'home',
  operation: '',
  selected: '',
  notice: '',
})
export function navigate<S extends Screen>(state: S, action: string): S | undefined {
  if (action === 'back')
    return { ...state, screen: 'home', operation: '', selected: '', notice: '' }
  if (action.startsWith('open-'))
    return { ...state, screen: 'choose', operation: action.slice(5), selected: '' }
  if (action.startsWith('option-'))
    return {
      ...state,
      screen: 'review',
      selected: action,
      notice: 'Review the selected request before confirming.',
    }
  return undefined
}
export function buttons(state: Screen, menu: Button[], options: Button[]): Button[] {
  if (state.screen === 'home') return menu
  if (state.screen === 'choose') return [...options, { id: 'back', label: 'Back to dashboard' }]
  if (state.screen === 'review')
    return [
      { id: 'confirm', label: 'Confirm selected request' },
      { id: 'back', label: 'Discard selection and return to dashboard' },
    ]
  return []
}
export function optionsFor(scenario: Scenario, labels: [string, string, string]): Button[] {
  const offset = scenario.variant % 3
  return Array.from({ length: 3 }, (_, i) => ({
    id: `option-${i}`,
    label: labels[(i - offset + 3) % 3]!,
  }))
}
export function selectedIndex(state: Screen, scenario: Scenario): number {
  return (Number(state.selected.slice(7)) - (scenario.variant % 3) + 3) % 3
}
export function screenOnly(state: Screen): Screen {
  return {
    screen: state.screen,
    operation: state.operation,
    selected: state.selected,
    notice: state.notice,
  }
}
