// Local form state, input controls, and HTML rendering; no testing framework dependencies.
import { z } from 'zod'
type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
export type Inputs = Record<string, string | number | boolean>
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
  value?: string
  options?: { value: string; label: string }[]
}
export interface Transition<S> {
  state: S
  status?: number
}

export const initialScreen = (): Screen => ({
  screen: 'home',
  operation: '',
  selected: '',
  notice: '',
})
export function screenOnly(state: Screen): Screen {
  return {
    screen: state.screen,
    operation: state.operation,
    selected: state.selected,
    notice: state.notice,
    ...(state.form ? { form: state.form } : {}),
  }
}

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

export const escape = (value: unknown) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  )
export const table = (title: string, columns: string[], rows: unknown[][]) =>
  `<section><h2>${escape(title)}</h2>${rows.length ? `<div class="table-scroll"><table><thead><tr>${columns.map((c) => `<th scope="col">${escape(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p class="empty">No records yet.</p>'}</section>`
export const stats = (items: [string, unknown][]) =>
  `<div class="stats">${items.map(([label, value]) => `<article><span>${escape(label)}</span><strong>${escape(value)}</strong></article>`).join('')}</div>`
export function controls(view: View) {
  const editing = view.screen.screen === 'choose'
  const reviewing = view.screen.screen === 'review'
  const fields = view.fields ?? []
  const input = fields
    .map(
      (f) =>
        `<label for="${escape(f.name)}">${escape(f.label)}${f.type === 'select' ? `<select id="${escape(f.name)}" name="${escape(f.name)}"><option value="">Choose…</option>${(f.options ?? []).map((o) => `<option value="${escape(o.value)}" ${f.value === o.value ? 'selected' : ''}>${escape(o.label)}</option>`).join('')}</select>` : `<input id="${escape(f.name)}" name="${escape(f.name)}" type="${f.type}" value="${escape(f.value)}" ${f.type === 'number' ? 'min="1" step="1"' : ''}>`}</label>`,
    )
    .join('')
  const review = fields
    .map(
      (f) =>
        `<div><dt>${escape(f.label)}</dt><dd>${escape(f.options?.find((o) => o.value === f.value)?.label ?? f.value)}</dd></div>`,
    )
    .join('')
  return `<section class="workspace"><h2>${editing ? 'Enter details' : reviewing ? 'Review changes' : view.screen.screen === 'done' ? 'Request receipt' : 'Actions'}</h2><p role="status" aria-live="polite">${escape(view.screen.notice)}</p>${reviewing ? `<dl class="review">${review}</dl>` : ''}<form id="command-form" novalidate>${editing ? `<div class="fields">${input}</div>` : ''}<div class="actions">${view.buttons.map((b) => `<button type="${['review', 'confirm'].includes(b.id) ? 'submit' : 'button'}" data-action="${escape(b.id)}" class="${['back', 'edit'].includes(b.id) ? 'secondary' : ''}">${escape(b.label)}</button>`).join('')}</div></form></section>`
}
