// Inspect the distinct flows behind a state's or transition's coverage.
import type { ViewerGraph, ViewerSuite } from '../../../shared/types.js'
import { navigate } from '../../lib/route.js'
import { Badge } from '../../components/Badge.js'
import { flowVisits } from './coverage.js'

export function FlowCoverage({
  suite,
  references,
}: {
  suite: ViewerSuite
  references: ViewerGraph['nodes'][number]['references']
}) {
  const flows = flowVisits(references, suite.runs)
  return (
    <section aria-label="Flow coverage">
      <h3>
        {flows.length} {flows.length === 1 ? 'flow' : 'flows'} explored this
      </h3>
      {!flows.length && <p>No recorded flow has visited this part of the map.</p>}
      {flows.map((flow) => (
        <details key={flow.id}>
          <summary>{flow.id}</summary>
          {flow.references.map((reference) => (
            <button
              className="graph-reference"
              key={`${reference.run}-${reference.step}`}
              onClick={() => navigate(suite.id, reference.run, reference.step)}
            >
              <span>
                {flow.id} · step {reference.step}
              </span>
              <Badge status={suite.runs[reference.run]!.status} />
            </button>
          ))}
        </details>
      ))}
    </section>
  )
}
