// Suite filtering and pagination remain independent of run outcomes and model candidate labels.
import type { Outcome, ViewerSuite } from '../../../shared/types.js'
import { Badge } from '../../components/Badge.js'
import { duration, formatDate, policyLabel, usageLabel } from '../../lib/format.js'
import { navigate } from '../../lib/route.js'
export type FlowFilter = 'all' | Outcome | 'candidates'
const descriptions: Record<Outcome, string> = {
  passed: 'All exact checks satisfied',
  failed: 'Requirement or execution failures',
  incomplete: 'Stopped before completion',
  error: 'Evaluation could not finish',
}
interface Props {
  suite: ViewerSuite
  filter: FlowFilter
  query: string
  page: number
  onFilter: (value: FlowFilter) => void
  onQuery: (value: string) => void
  onPage: (value: number) => void
}
export function Overview({ suite, filter, query, page, onFilter, onQuery, onPage }: Props) {
  const filtered = suite.runs
    .map((run, index) => ({ run, index }))
    .filter(
      ({ run }) =>
        (filter === 'all' ||
          (filter === 'candidates'
            ? run.issues.some((issue) => issue.source === 'model')
            : run.status === filter)) &&
        [run.flow.id, run.flow.goal, run.reason, ...run.issues.map((issue) => issue.message)]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
  const pages = Math.max(1, Math.ceil(filtered.length / 15)),
    currentPage = Math.min(page, pages - 1)
  const rows = filtered.slice(currentPage * 15, (currentPage + 1) * 15)
  return (
    <>
      <section className="heading">
        <div>
          <div className="eyebrow">Run overview</div>
          <h1>{suite.name}</h1>
          <p>Follow the actions. Inspect the evidence. Understand the outcome.</p>
        </div>
        <span className="policy">{policyLabel(suite)}</span>
      </section>
      <div className="stats">
        {(Object.keys(suite.totals) as Outcome[]).map((status) => (
          <button
            key={status}
            className={`stat ${filter === status ? 'active' : ''}`}
            aria-label={`Filter ${status} flows`}
            onClick={() => onFilter(filter === status ? 'all' : status)}
          >
            <Badge status={status} />
            <b>{suite.totals[status]}</b>
            <small>{descriptions[status]}</small>
          </button>
        ))}
      </div>
      <div className="meta">
        <span>{suite.runs.length} recorded flows</span>
        <span>{formatDate(suite.startedAt)}</span>
        <span>{usageLabel(suite)}</span>
      </div>
      <section className="panel">
        <div className="panel-head">
          <h2>
            Recorded flows <span className="count">/ {suite.runs.length}</span>
          </h2>
          <div className="filters">
            <label>
              <span className="sr-only">Search flows</span>
              <input
                id="search"
                type="search"
                placeholder="Search goals, IDs, or findings…"
                value={query}
                onChange={(event) => onQuery(event.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Filter outcomes</span>
              <select
                id="filter"
                aria-label="Filter outcomes"
                value={filter}
                onChange={(event) => onFilter(event.target.value as FlowFilter)}
              >
                {(['all', 'passed', 'failed', 'incomplete', 'error', 'candidates'] as const).map(
                  (value) => (
                    <option key={value} value={value}>
                      {value === 'all'
                        ? 'All outcomes'
                        : value === 'candidates'
                          ? 'Model candidates'
                          : value.charAt(0).toUpperCase() + value.slice(1)}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
        </div>
        <div id="table">
          {rows.length ? (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>User flow</th>
                    <th>Outcome</th>
                    <th>Actions</th>
                    <th>Duration</th>
                    <th>Model findings</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ run, index }) => {
                    const candidates = run.issues.filter((issue) => issue.source === 'model').length
                    return (
                      <tr key={run.id}>
                        <td>
                          <button
                            className="flow-link"
                            data-run={index}
                            onClick={() => navigate(suite.id, index)}
                          >
                            <span className="goal-preview">{run.flow.goal}</span>
                            <span className="flow-id">{run.flow.id}</span>
                          </button>
                        </td>
                        <td>
                          <Badge status={run.status} />
                        </td>
                        <td>{Math.max(0, run.states.length - 1)}</td>
                        <td>{duration(run.durationMs)}</td>
                        <td>
                          {candidates ? (
                            <Badge status="candidate">{candidates} candidate(s)</Badge>
                          ) : (
                            <span className="count">None recorded</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">
              <h3>No matching flows</h3>
              <p>Try another search or outcome filter.</p>
            </div>
          )}
          <div className="table-footer">
            <span>{filtered.length} matching flows</span>
            <div className="downloads">
              <a href={suite.downloads.summary} download>
                Summary JSON ↗
              </a>
              <a href={suite.downloads.report} target="_blank" rel="noopener">
                Static report ↗
              </a>
              <a href={suite.downloads.graph} download>
                Action graph ↗
              </a>
            </div>
            <div className="pagination">
              <button
                disabled={currentPage === 0}
                aria-label="Previous page"
                onClick={() => onPage(currentPage - 1)}
              >
                ←
              </button>
              <span>
                {currentPage + 1} / {pages}
              </span>
              <button
                disabled={currentPage === pages - 1}
                aria-label="Next page"
                onClick={() => onPage(currentPage + 1)}
              >
                →
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
