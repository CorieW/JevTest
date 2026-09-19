// Build reference routes and form values from evaluator-owned fixture mappings.
import type { Field, Scenario } from './contracts.js'
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
