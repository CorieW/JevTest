// Display captured screenshots and sandboxed page snapshots.
import { useState } from 'react'
import type { CapturedState, EvidenceFile } from '../../../shared/types.js'
function Capture({ asset, title }: { asset: EvidenceFile; title: string }) {
  const [failed, setFailed] = useState(false)
  if (failed)
    return (
      <div className="empty">
        This evidence file is missing. Try the page snapshot or inspect the checks.
      </div>
    )
  return asset.type === 'image' ? (
    <img
      alt={`Saved browser screenshot for ${title}`}
      src={asset.url}
      onError={() => setFailed(true)}
    />
  ) : (
    <iframe title="Saved page snapshot" sandbox="" src={asset.url} />
  )
}
export function Evidence({ state }: { state: CapturedState }) {
  const [preferred, setPreferred] = useState<EvidenceFile['type']>('image')
  const asset = state.evidence.find((item) => item.type === preferred) ?? state.evidence[0]
  const mode = asset?.type ?? preferred
  return (
    <section className="panel evidence-panel">
      <div className="panel-head">
        <h3>{state.title}</h3>
        <div className="evidence-mode" aria-label="Evidence format">
          <button
            id="image-mode"
            disabled={!state.evidence.some((item) => item.type === 'image')}
            className={mode === 'image' ? 'active' : ''}
            onClick={() => setPreferred('image')}
          >
            Screenshot
          </button>
          <button
            id="snapshot-mode"
            disabled={!state.evidence.some((item) => item.type === 'snapshot')}
            className={mode === 'snapshot' ? 'active' : ''}
            onClick={() => setPreferred('snapshot')}
          >
            Page snapshot
          </button>
        </div>
      </div>
      <div className="capture" id="capture">
        {asset ? (
          <Capture key={asset.url} asset={asset} title={state.title} />
        ) : (
          <div className="empty">
            <h3>No {mode === 'image' ? 'screenshot' : 'page snapshot'} recorded</h3>
            <p>Try the other evidence format or inspect the checks.</p>
          </div>
        )}
      </div>
      <div className="evidence-caption">
        <span>Captured state {state.number} · inputs masked</span>
        {asset && (
          <a href={asset.url} target="_blank" rel="noopener">
            Open capture ↗
          </a>
        )}
      </div>
    </section>
  )
}
