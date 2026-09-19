// Shared status label.
import type { ReactNode } from 'react'
export function Badge({ status, children }: { status: string; children?: ReactNode }) {
  return <span className={`badge ${status}`}>{children ?? status}</span>
}
