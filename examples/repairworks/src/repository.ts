// Serialize durable mutations and reject stale forms without partial writes.
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { AppError } from './domain.js'
import type { Database } from './domain.js'
import { seed } from './seed.js'

export async function openRepository(file: string) {
  await mkdir(dirname(file), { recursive: true })
  let state: Database
  try {
    state = JSON.parse(await readFile(file, 'utf8')) as Database
    if (state.version !== 1 || !Array.isArray(state.orders))
      throw new Error('Unsupported RepairWorks data file')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    state = seed()
    await writeFile(file, JSON.stringify(state, null, 2), { flag: 'wx' })
  }
  let queue = Promise.resolve()
  return {
    read: () => structuredClone(state),
    async update<T>(revision: number, change: (draft: Database) => T): Promise<T> {
      const operation = queue.then(async () => {
        if (revision !== state.revision)
          throw new AppError('This page is out of date. Reload and try again.', 409)
        const draft = structuredClone(state)
        const result = change(draft)
        draft.revision++
        const temporary = `${file}.${randomUUID()}.tmp`
        await writeFile(temporary, JSON.stringify(draft, null, 2), { flag: 'wx' })
        await rename(temporary, file)
        state = draft
        return result
      })
      queue = operation.then(
        () => {},
        () => {},
      )
      return operation
    },
  }
}
