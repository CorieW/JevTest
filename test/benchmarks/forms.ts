// Shared HTTP form lifecycle; application services own validation and business mutations.
import { z } from 'zod'
import type { Button, Field, Scenario, Screen, Transition } from './contracts.js'

export function formButtons(screen: Screen, menu: Button[]): Button[] {
  if (screen.screen === 'home') return menu
  if (screen.screen === 'choose')
    return [
      { id: 'review', label: 'Review changes' },
      { id: 'back', label: 'Cancel' },
    ]
  if (screen.screen === 'review')
    return [
      { id: 'confirm', label: 'Confirm changes' },
      { id: 'edit', label: 'Edit details' },
      { id: 'back', label: 'Cancel' },
    ]
  return [{ id: 'back', label: 'Return to overview' }]
}
export function formTransition<S extends Screen>(
  state: S,
  action: string,
  values: Record<string, string> | undefined,
  validate: (values: Record<string, string>, operation: string) => unknown,
): Transition<S> | undefined {
  if (action === 'back')
    return {
      state: { ...state, screen: 'home', operation: '', selected: '', form: {}, notice: '' },
    }
  if (action.startsWith('open-'))
    return {
      state: {
        ...state,
        screen: 'choose',
        operation: action.slice(5),
        selected: '',
        form: {},
        notice: '',
      },
    }
  if (action === 'edit') return { state: { ...state, screen: 'choose', notice: '' } }
  if (action === 'review') {
    try {
      validate(values ?? {}, state.operation)
    } catch (error) {
      if (!(error instanceof z.ZodError)) throw error
      return {
        state: {
          ...state,
          form: values ?? {},
          notice: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
        status: 422,
      }
    }
    return {
      state: {
        ...state,
        form: values ?? {},
        screen: 'review',
        notice: 'Check the details below before saving.',
      },
    }
  }
  if (action !== 'confirm' || state.screen !== 'review') throw new Error('Unsupported command')
  return undefined
}
export function withFormValues(fields: Field[], state: Screen): Field[] {
  return fields.map((f) => ({ ...f, value: state.form?.[f.name] ?? '' }))
}
export function formCases(cases: Scenario[], fields: (scenario: Scenario) => Field[]): Scenario[] {
  return cases.map((s) => {
    const inputs = fields(s)
    return {
      ...s,
      formValues: Object.fromEntries(inputs.map((f) => [f.name, String(s.input[f.fixture])])),
      referenceActions: [
        `open-${s.workflow}`,
        ...inputs.map(
          (f) =>
            `${f.type === 'select' ? 'select' : 'fill'}-${f.name}:${String(s.input[f.fixture])}`,
        ),
        'review',
        'confirm',
      ],
    }
  })
}
