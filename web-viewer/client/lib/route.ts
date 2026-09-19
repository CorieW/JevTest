// Hash routes keep individual recorded states shareable and support browser back/forward.
import { useSyncExternalStore } from 'react'
const subscribe = (listener: () => void) => {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}
const snapshot = () => location.hash
export interface Route {
  suite: number
  run?: number
  step: number
  view?: string
}
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, snapshot)
  const params = new URLSearchParams(hash.slice(1))
  return {
    suite: Number(params.get('suite') || 0),
    run: params.has('run') ? Number(params.get('run')) : undefined,
    step: Number(params.get('step') || 0),
    view: params.get('view') ?? undefined,
  }
}
export function navigate(suite: number, run?: number, step = 0) {
  const params = new URLSearchParams({ suite: String(suite) })
  if (run !== undefined) {
    params.set('run', String(run))
    params.set('step', String(step))
  }
  location.hash = params.toString()
}
