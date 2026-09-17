// Stable state hashing and redaction are shared by traces and API requests.
import { createHash } from 'node:crypto'
import type { Json } from './types.js'

export function stable(value: unknown): string {
  if (value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}
export function fingerprint(value: unknown): string {
  return createHash('sha256').update(stable(value)).digest('hex').slice(0, 24)
}
export function redact(text: string): string {
  let result = text
    .replace(/apikey_[a-zA-Z0-9_]+/g, '[REDACTED]')
    .replace(/Bearer\s+[^\s"<>]+/gi, 'Bearer [REDACTED]')
  const key = process.env.TYPESAFE_API_KEY
  if (key) result = result.split(key).join('[REDACTED]')
  return result
}
export function safeJson<T>(value: T): T {
  return JSON.parse(redact(JSON.stringify(value))) as T
}
export function errorMessage(error: unknown): string {
  return redact(error instanceof Error ? error.message : String(error))
}
export function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer`)
  return value
}
export function jsonValue(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json
}
