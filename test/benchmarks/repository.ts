// File-backed session transactions; atomic replacement keeps a failed write from partially applying a command.
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Screen, View } from './contracts.js'
export interface Reply {
  view: View
  html: string
  revision: number
  error?: string
}
export interface StoredSession {
  scenarioId: string
  state: Screen
  revision: number
  receipts: { key: string; fingerprint: string; status: number; body: Reply }[]
}
export class SessionRepository {
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true })
  }
  private file(id: string) {
    return resolve(this.directory, `${createHash('sha256').update(id).digest('hex')}.json`)
  }
  get(id: string): StoredSession | undefined {
    try {
      return JSON.parse(readFileSync(this.file(id), 'utf8')) as StoredSession
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
      throw error
    }
  }
  save(id: string, session: StoredSession) {
    const file = this.file(id),
      temporary = `${file}.${randomUUID()}.tmp`
    let failure: unknown
    try {
      writeFileSync(temporary, JSON.stringify(session), { flag: 'wx' })
      for (let attempt = 0; ; attempt++) {
        try {
          renameSync(temporary, file)
          break
        } catch (error) {
          if (
            attempt >= 3 ||
            !['EPERM', 'EBUSY', 'EACCES'].includes((error as NodeJS.ErrnoException).code ?? '')
          )
            throw error
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10 * (attempt + 1))
        }
      }
    } catch (error) {
      failure = error
    }
    try {
      unlinkSync(temporary)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failure ??= error
    }
    if (failure) throw failure
  }
  delete(id: string) {
    try {
      unlinkSync(this.file(id))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
  }
}
