// Preserve suite filters and pagination while navigating between overview and recorded runs.
import { useState } from 'react'
import type { ViewerSuite } from '../../../shared/types.js'
import type { Route } from '../../lib/route.js'
import { Overview, type FlowFilter } from './Overview.js'
import { RunDetail } from '../runs/RunDetail.js'
import { ActionGraph } from '../graph/ActionGraph.js'
export function SuiteView({
  suite,
  route,
  refresh,
}: {
  suite: ViewerSuite
  route: Route
  refresh: number
}) {
  const [filter, setFilter] = useState<FlowFilter>('all')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const run =
    route.run !== undefined && Number.isInteger(route.run) ? suite.runs[route.run] : undefined
  if (run)
    return (
      <RunDetail
        key={`${run.id}:${refresh}`}
        suite={suite}
        run={run}
        index={route.run!}
        step={route.step}
      />
    )
  return (
    <>
      <nav className="viewer-tabs" aria-label="Suite views">
        <a
          href={`#suite=${suite.id}`}
          aria-current={
            route.view !== 'graph' && suite.graph.source !== 'discovery' ? 'page' : undefined
          }
        >
          Recorded flows
        </a>
        <a
          href={`#suite=${suite.id}&view=graph`}
          aria-current={
            route.view === 'graph' || suite.graph.source === 'discovery' ? 'page' : undefined
          }
        >
          Action graph
        </a>
      </nav>
      {route.view === 'graph' || suite.graph.source === 'discovery' ? (
        <ActionGraph key={refresh} suite={suite} />
      ) : (
        <Overview
          suite={suite}
          filter={filter}
          query={query}
          page={page}
          onFilter={(value) => {
            setFilter(value)
            setPage(0)
          }}
          onQuery={(value) => {
            setQuery(value)
            setPage(0)
          }}
          onPage={setPage}
        />
      )}
    </>
  )
}
