// React owns request lifecycles, suite selection, and navigation; cancelled requests cannot replace newer results.
import { useEffect, useState } from 'react'
import type { SuiteSummary, ViewerSuite } from '../shared/types.js'
import { navigate, useRoute } from './lib/route.js'
import { SuiteView } from './features/suites/SuiteView.js'

async function fetchJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal })
  if (!response.ok)
    throw new Error('Saved results could not be loaded. Check the report directory, then refresh.')
  return response.json() as Promise<T>
}
export function App() {
  const route = useRoute()
  const [summaries, setSummaries] = useState<SuiteSummary[]>()
  const [suite, setSuite] = useState<ViewerSuite>()
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const suiteId = summaries?.some((item) => item.id === route.suite)
    ? route.suite
    : summaries?.[0]?.id
  useEffect(() => {
    const controller = new AbortController()
    fetchJson<SuiteSummary[]>('/api/suites', controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSummaries(result)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(String(error.message))
      })
    return () => controller.abort()
  }, [refresh])
  useEffect(() => {
    if (suiteId === undefined) return
    const controller = new AbortController()
    fetchJson<ViewerSuite>('/api/suites/' + suiteId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setSuite(result)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setError(String(error.message))
      })
    return () => controller.abort()
  }, [suiteId, refresh])
  const current = suite?.id === suiteId ? suite : undefined
  useEffect(() => {
    document.title = current ? `${current.name} · JevTest` : 'JevTest · Run viewer'
    document.body.dataset.ready = String(Boolean(current))
  }, [current])
  const reload = () => {
    setError('')
    setRefresh((value) => value + 1)
  }
  return (
    <>
      <aside className="sidebar">
        <a className="brand" href="#">
          <span className="mark">J.</span>
          <span>
            JevTest<small>RUN VIEWER</small>
          </span>
        </a>
        <div className="eyebrow">Saved suites</div>
        <nav id="suites" aria-label="Saved suites">
          {summaries?.map((item) => (
            <button
              key={item.id}
              data-suite={item.id}
              className={current?.id === item.id ? 'active' : ''}
              aria-current={current?.id === item.id ? 'page' : false}
              onClick={() => navigate(item.id)}
            >
              <span>{item.name}</span>
              <small>{item.count}</small>
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="live-dot" />
          Local evidence
          <br />
          <p>Explore what happened, one action at a time.</p>
          <small>Viewing results makes no model calls.</small>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span id="breadcrumb">
            {current
              ? `${current.name} / ${route.run !== undefined ? 'Flow evidence' : route.view === 'graph' || current.graph.source === 'discovery' ? 'Action graph' : 'Overview'}`
              : 'Saved runs'}
          </span>
          <span className="topbar-right">
            <span className="quiet">READ-ONLY VIEWER</span>
            <button id="refresh" onClick={reload}>
              Refresh results ↻
            </button>
          </span>
        </header>
        <main id="main">
          {error ? (
            <div className="error-box">
              <h2>Unable to open saved results</h2>
              <p>{error}</p>
              <button onClick={reload}>Try again</button>
            </div>
          ) : current ? (
            <SuiteView key={current.id} suite={current} route={route} refresh={refresh} />
          ) : (
            <div className="empty">
              {summaries?.length === 0 ? 'No saved suites are available.' : 'Loading saved runs…'}
            </div>
          )}
        </main>
        <footer>
          Exact checks determine outcomes. Model findings are candidates for review. Playing
          captured steps does not execute the application.
        </footer>
      </div>
    </>
  )
}
