// Exact assertions, observed changes, and model judgments have distinct React panels.
import { useState } from 'react'
import type { Assertion } from '../../../../src/types.js'
import type { CapturedState, ViewerRun } from '../../../shared/types.js'
import { Badge } from '../../components/Badge.js'
import { Comparison } from '../../components/Comparison.js'
import { json } from '../../lib/format.js'
function CheckRow({ assertion, pending = false }: { assertion: Assertion; pending?: boolean }) {
  return (
    <div className="check">
      <div className="check-title">
        <Badge status={pending ? 'pending' : assertion.passed ? 'passed' : 'failed'}>
          {pending ? 'Pending' : assertion.passed ? 'Pass' : 'Fail'}
        </Badge>
        <span>{assertion.name}</span>
      </div>
      <Comparison before={assertion.expected} after={assertion.actual} />
    </div>
  )
}
function Checks({ state }: { state: CapturedState }) {
  const check = state.check
  return (
    <>
      <h3>Exact correctness checks</h3>
      <p>
        {check?.complete
          ? 'The completion condition was reached for this state.'
          : 'Success assertions remain pending until the completion condition is reached.'}
      </p>
      {!check ? (
        <p>No check was recorded for this state.</p>
      ) : (
        <>
          {!!check.invariants?.length && (
            <>
              <h3>Always-required invariants</h3>
              {check.invariants.map((assertion, index) => (
                <CheckRow key={index} assertion={assertion} />
              ))}
            </>
          )}
          {check.assertions.length ? (
            check.assertions.map((assertion, index) => (
              <CheckRow key={index} assertion={assertion} pending={!check.complete} />
            ))
          ) : (
            <p>No success assertions recorded.</p>
          )}
        </>
      )}
      {state.error && <div className="reason failed">{state.error}</div>}
    </>
  )
}
function Changes({ state }: { state: CapturedState }) {
  const changes = state.changes?.changes ?? []
  return (
    <>
      <h3>Observed state changes</h3>
      <p>Changes are recorded facts. They do not establish a bug by themselves.</p>
      {state.number === 0 ? (
        <p>The initial state has no preceding action.</p>
      ) : !changes.length ? (
        <p>No structured data changes recorded.</p>
      ) : (
        changes.map((change, index) => (
          <div className="check" key={index}>
            <div className="check-title">{change.path}</div>
            <Comparison before={change.before} after={change.after} labels={['Before', 'After']} />
          </div>
        ))
      )}
      {state.changes?.truncated && (
        <p>Showing the first recorded changes; this list is truncated.</p>
      )}
      {state.observation && (
        <details>
          <summary>Observed application data</summary>
          <pre>{json(state.observation.data)}</pre>
        </details>
      )}
    </>
  )
}
function Diagnostics({ run, state }: { run: ViewerRun; state: CapturedState }) {
  const assessment = state.assessment
  return (
    <>
      <h3>Model assessment</h3>
      <p>Model judgments are candidates, not confirmed failures.</p>
      {assessment ? (
        <>
          <Badge status={assessment.choice === 'unexpected' ? 'candidate' : 'neutral'}>
            {assessment.choice}
          </Badge>
          <pre>{json(assessment)}</pre>
        </>
      ) : (
        <p>No model assessment recorded for this state.</p>
      )}
      {run.issues
        .filter((issue) => issue.source === 'model' && issue.step === state.number)
        .map((issue, index) => (
          <div className="issue" key={index}>
            Candidate: {issue.message}
          </div>
        ))}
      <div className="issues">
        {run.issues
          .filter((issue) => issue.source !== 'model' && issue.step === state.number)
          .map((issue, index) => (
            <div className="issue" key={index}>
              {issue.source}: {issue.message}
            </div>
          ))}
      </div>
      <details>
        <summary>Action and selection</summary>
        <pre>{json({ action: state.action, selection: state.selection })}</pre>
      </details>
      <details>
        <summary>Browser errors and failed requests</summary>
        <pre>
          {json({
            errors: state.observation?.errors,
            requests: state.observation?.failedRequests,
            error: state.error,
          })}
        </pre>
      </details>
      <details>
        <summary>Observed page text</summary>
        <pre>{state.observation?.text ?? 'Not recorded'}</pre>
      </details>
    </>
  )
}
export function Inspector({ run, state }: { run: ViewerRun; state: CapturedState }) {
  const [tab, setTab] = useState('checks')
  return (
    <section className="panel inspector">
      <div className="inspector-tabs" aria-label="Evidence details">
        {[
          ['checks', 'Exact checks'],
          ['changes', 'State changes'],
          ['model', 'Diagnostics'],
        ].map(([key, label]) => (
          <button
            key={key}
            data-tab={key}
            className={tab === key ? 'active' : ''}
            onClick={() => setTab(key!)}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="inspector-content" id="inspector">
        {tab === 'checks' ? (
          <Checks state={state} />
        ) : tab === 'changes' ? (
          <Changes state={state} />
        ) : (
          <Diagnostics run={run} state={state} />
        )}
      </div>
    </section>
  )
}
