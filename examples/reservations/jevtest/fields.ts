// Map public form controls to JevTest fixture inputs without adding test metadata to the application.
import { reservationFields as applicationFields } from '../src/view.js'
import type { Field } from '../src/ui.js'
export const withFixture = (field: Field) => ({ ...field, fixture: field.name })
export const reservationFields = (...args: Parameters<typeof applicationFields>) =>
  applicationFields(...args).map(withFixture)
