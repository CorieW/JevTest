// Escaped, accessible UI primitives shared by the example applications, without business rules.
import type { View } from './contracts.js'
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
