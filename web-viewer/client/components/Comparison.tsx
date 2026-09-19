// Show expected and actual values as escaped React text.
import { json } from '../lib/format.js'
export function Comparison({
  before,
  after,
  labels = ['Expected', 'Actual'],
}: {
  before: unknown
  after: unknown
  labels?: [string, string]
}) {
  if (before === undefined && after === undefined) return null
  return (
    <div className="comparison">
      <div>
        <span>{labels[0]}</span>
        <code>{json(before)}</code>
      </div>
      <div>
        <span>{labels[1]}</span>
        <code>{json(after)}</code>
      </div>
    </div>
  )
}
