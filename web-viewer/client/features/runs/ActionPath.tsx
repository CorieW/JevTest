// Keep every recorded visit in order, even when the application returns to an earlier state.
import { useEffect, useRef, useState } from 'react'
import type { CapturedState } from '../../../shared/types.js'
function FrameImage({ state }: { state: CapturedState }) {
  const image = state.evidence.find((asset) => asset.type === 'image')
  const snapshot = state.evidence.find((asset) => asset.type === 'snapshot')
  const [missing, setMissing] = useState(false)
  if ((!image || missing) && snapshot)
    return (
      <span className="path-snapshot">
        <iframe
          title={`Snapshot preview: ${state.title}`}
          src={snapshot.url}
          sandbox=""
          loading="lazy"
          tabIndex={-1}
          aria-hidden="true"
        />
        <span>Page snapshot recorded</span>
      </span>
    )
  if (!image || missing)
    return (
      <span className="path-placeholder">
        {missing
          ? 'Screenshot unavailable'
          : state.evidence.some((asset) => asset.type === 'snapshot')
            ? 'Page snapshot recorded'
            : 'No capture recorded'}
      </span>
    )
  return (
    <img
      src={image.url}
      alt={`Captured page after ${state.title}`}
      loading="lazy"
      onError={() => setMissing(true)}
    />
  )
}
export function ActionPath({
  states,
  position,
  onChoose,
}: {
  states: CapturedState[]
  position: number
  onChoose: (index: number) => void
}) {
  const strip = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const container = strip.current
    const active = container?.children[position] as HTMLElement | undefined
    if (!container || !active) return
    // Scroll only the strip; playback must not move the page away from the full-size capture.
    container.scrollLeft =
      active.offsetLeft - container.offsetLeft - (container.clientWidth - active.clientWidth) / 2
  }, [position])
  return (
    <section className="panel action-path" aria-label="Recorded action path">
      <div className="panel-head">
        <div>
          <h2>Recorded action path</h2>
          <p>Initial state → actions in execution order. Select a frame to inspect it.</p>
        </div>
        <span>{states.length} frames</span>
      </div>
      <ol ref={strip} className="path-strip">
        {states.map((state, index) => (
          <li key={index}>
            <button
              data-step={index}
              aria-label={`View frame ${index}: ${state.title}`}
              aria-current={position === index ? 'step' : undefined}
              onClick={() => onChoose(index)}
            >
              <span className="path-frame">
                <FrameImage
                  key={state.evidence.find((asset) => asset.type === 'image')?.url ?? 'none'}
                  state={state}
                />
              </span>
              <span className="path-caption">
                <b>{index === 0 ? 'Start' : `Action ${index}`}</b>
                <span>{state.title}</span>
                {state.error && <span className="path-error">Execution error</span>}
              </span>
            </button>
            {index < states.length - 1 && (
              <span className="path-arrow" aria-hidden="true">
                →
              </span>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
