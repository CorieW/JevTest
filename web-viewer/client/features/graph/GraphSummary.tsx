// Keep map controls compact and discovery details available on demand.
import type { ViewerSuite } from '../../../shared/types.js'
import type { graphCoverage } from './coverage.js'

export function GraphSummary({
  suite,
  coverage,
  showCoverage,
  onCoverage,
  isFlow,
}: {
  suite: ViewerSuite
  coverage: ReturnType<typeof graphCoverage>
  showCoverage: boolean
  onCoverage: (value: boolean) => void
  isFlow: boolean
}) {
  const graph = suite.graph
  const Heading = isFlow ? 'h2' : 'h1'
  return (
    <>
      <div className="heading graph-heading">
        <div>
          <Heading>{isFlow ? 'Flow path in the application' : suite.name}</Heading>
          <p>
            {graph.nodes.length} states · {graph.edges.length} transitions
          </p>
        </div>
        <a href={suite.downloads.graph} download>
          Download graph ↗
        </a>
      </div>
      <div className="graph-toolbar">
        {isFlow ? (
          <span>Highlighted route · edge numbers show step order</span>
        ) : (
          <>
            <label className="coverage-toggle">
              <input
                type="checkbox"
                checked={showCoverage}
                onChange={(event) => onCoverage(event.target.checked)}
              />
              Show flow coverage
            </label>
            {showCoverage && (
              <div className="coverage-stats" aria-label="Application coverage">
                <span>
                  <b>
                    {coverage.visitedStates}/{graph.nodes.length}
                  </b>{' '}
                  states visited
                </span>
                <span>
                  <b>
                    {coverage.traversedTransitions}/{graph.edges.length}
                  </b>{' '}
                  transitions traversed
                </span>
                <span>
                  <b>{coverage.flows}</b> distinct flows
                </span>
              </div>
            )}
          </>
        )}
      </div>
      <div className="graph-context">
        <details className="graph-discovery">
          <summary>
            <span className={`map-status ${graph.complete ? 'complete' : ''}`}>
              {graph.complete ? 'Discovery complete' : 'Partial map'}
            </span>
            {graph.frontier.length > 0 && <span>{graph.frontier.length} untried actions</span>}
            {graph.errors.length > 0 && <span>{graph.errors.length} discovery error(s)</span>}
            <span>Details</span>
          </summary>
          <div className="graph-discovery-details">
            <p>
              {graph.source === 'runs'
                ? 'No application discovery loaded. This map contains recorded states and known untried actions. Run project discovery into this report directory to expand it.'
                : graph.complete
                  ? 'All reachable actions exposed by the configured entry points and fixture inputs were explored. Other inputs, roles, and external states may expose additional paths.'
                  : 'Discovery limits or errors may leave paths unexplored.'}
            </p>
            {graph.entryPoints && (
              <p>
                {graph.entryPoints.opened}/{graph.entryPoints.requested} entry contexts opened.
              </p>
            )}
            {graph.stopped && <p>Discovery stopped: {graph.stopped}</p>}
            {!!graph.unmatchedRunStates && (
              <p>
                {graph.unmatchedRunStates} recorded states were not in the discovery map. They are
                included without guessing connections.
              </p>
            )}
            <p>
              Coverage counts distinct recorded flows on the known map, regardless of outcome.
              Discovery visits and unknown paths are not included.
            </p>
            {graph.errors.length > 0 && (
              <ul>
                {graph.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            )}
          </div>
        </details>
        {!isFlow && showCoverage && (
          <div className="coverage-legend" aria-label="Coverage legend">
            <span>
              <i className="legend-visited" />
              Visited
            </span>
            <span>
              <i className="legend-unvisited" />
              Not visited by flows
            </span>
          </div>
        )}
      </div>
    </>
  )
}
