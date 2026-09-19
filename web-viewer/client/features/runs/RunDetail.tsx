// Captured-step playback uses React effect cleanup; navigation never executes application actions.
import { useEffect, useState } from 'react'
import type { ViewerRun, ViewerSuite } from '../../../shared/types.js'
import { Badge } from '../../components/Badge.js'
import { duration, policyLabel } from '../../lib/format.js'
import { navigate } from '../../lib/route.js'
import { Evidence } from './Evidence.js'
import { Inspector } from './Inspector.js'

export function RunDetail({
  suite,
  run,
  index,
  step,
}: {
  suite: ViewerSuite
  run: ViewerRun
  index: number
  step: number
}) {
  const position = Number.isInteger(step) ? Math.max(0, Math.min(step, run.states.length - 1)) : 0
  const state = run.states[position]!
  const last = run.states.length - 1
  const [playing, setPlaying] = useState(false)
  const isPlaying = playing && position < last
  useEffect(() => {
    if (!isPlaying) return
    const timer = window.setTimeout(() => navigate(suite.id, index, position + 1), 2200)
    return () => window.clearTimeout(timer)
  }, [isPlaying, suite.id, index, position])
  const choose = (next: number) => {
    setPlaying(false)
    navigate(suite.id, index, next)
  }
  return (
    <>
      <button className="back" id="back" onClick={() => navigate(suite.id)}>
        ← All flows
      </button>
      <div className="run-heading">
        <h1>{run.flow.goal}</h1>
        <Badge status={run.status} />
      </div>
      <div className="run-meta">
        <span>{run.flow.id}</span>
        <span>{duration(run.durationMs)} recorded</span>
        <span>{policyLabel(suite)}</span>
        {run.trace && (
          <a href={run.trace} download>
            Download replay trace ↗
          </a>
        )}
      </div>
      <div className={`reason ${run.status}`}>{run.reason}</div>
      <details className="requirements">
        <summary>{run.flow.successCriteria.length} success requirements</summary>
        <ul>
          {run.flow.successCriteria.map((requirement, i) => (
            <li key={i}>{requirement}</li>
          ))}
        </ul>
      </details>
      <div className="toolbar">
        <div className="toolbar-group">
          <button
            className="primary"
            id="play"
            disabled={last === 0}
            onClick={() => {
              if (isPlaying) {
                setPlaying(false)
                return
              }
              if (position === last) navigate(suite.id, index, 0)
              setPlaying(true)
            }}
          >
            {isPlaying ? 'Pause walkthrough' : 'Play captured steps'}
          </button>
          <span className="step-label">Saved evidence · no actions are executed</span>
        </div>
        <div className="toolbar-group">
          <button id="previous" disabled={position === 0} onClick={() => choose(position - 1)}>
            ← Previous
          </button>
          <span className="step-label">
            {position} / {last}
          </span>
          <button id="next" disabled={position === last} onClick={() => choose(position + 1)}>
            Next →
          </button>
        </div>
      </div>
      <div className="detail-grid">
        <nav className="timeline panel" aria-label="Action timeline">
          <div className="eyebrow">Action timeline</div>
          {run.states.map((item, i) => (
            <button
              key={i}
              data-step={i}
              className={i === position ? 'active' : ''}
              aria-current={i === position ? 'step' : false}
              onClick={() => choose(i)}
            >
              <span className="step-number">{i}</span>
              <span className="timeline-title">{item.title}</span>
            </button>
          ))}
        </nav>
        <Evidence state={state} />
        <Inspector run={run} state={state} />
      </div>
      <div role="status" className="sr-only">
        Captured state {position}: {state.title}
      </div>
    </>
  )
}
