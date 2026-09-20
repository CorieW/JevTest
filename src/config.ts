// Locate explicitly selected or conventional project configurations without silently choosing between them.
import { access } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Project } from './types.js'
import { validateLimits } from './runner.js'

export function validateProject(value: unknown): asserts value is Project {
  const fail = (field: string, reason: string): never => {
    throw new Error(`Config ${field}: ${reason}`)
  }
  if (!value || typeof value !== 'object') fail('default export', 'expected a project object')
  const project = value as Project
  if (typeof project.adapter?.open !== 'function') fail('adapter.open', 'expected a function')
  if (project.dispose !== undefined && typeof project.dispose !== 'function')
    fail('dispose', 'expected an async cleanup function')
  if (
    project.setupIssues !== undefined &&
    (!Array.isArray(project.setupIssues) ||
      project.setupIssues.some((issue) => typeof issue !== 'string'))
  )
    fail('setupIssues', 'expected a list of setup issues')
  if (
    project.limits !== undefined &&
    (!project.limits || typeof project.limits !== 'object' || Array.isArray(project.limits))
  )
    fail('limits', 'expected an object')
  if (project.webServer !== undefined) {
    const server = project.webServer
    if (
      !server ||
      typeof server !== 'object' ||
      typeof server.command !== 'string' ||
      !server.command.trim()
    )
      fail('webServer.command', 'expected a start command')
    try {
      if (!['http:', 'https:'].includes(new URL(server.url).protocol)) throw new Error()
    } catch {
      fail('webServer.url', 'expected an absolute HTTP(S) readiness URL')
    }
    if (
      server.timeoutMs !== undefined &&
      (!Number.isSafeInteger(server.timeoutMs) || server.timeoutMs < 1)
    )
      fail('webServer.timeoutMs', 'expected a positive integer')
    if (server.cwd !== undefined && typeof server.cwd !== 'string')
      fail('webServer.cwd', 'expected a directory path')
    if (server.reuseExistingServer !== undefined && typeof server.reuseExistingServer !== 'boolean')
      fail('webServer.reuseExistingServer', 'expected a boolean')
  }
  if (!Array.isArray(project.flows) || !project.flows.length)
    fail('flows', 'expected at least one flow')
  const ids = new Set<string>()
  for (const [index, flow] of project.flows.entries()) {
    const field = `flows[${index}]${flow?.id ? ` (${flow.id})` : ''}`
    if (!flow || typeof flow !== 'object') fail(field, 'expected a flow object')
    for (const key of ['id', 'goal', 'startUrl'] as const)
      if (typeof flow[key] !== 'string' || !flow[key].trim())
        fail(`${field}.${key}`, 'expected non-empty text')
    if (ids.has(flow.id)) fail(`${field}.id`, 'duplicate flow ID')
    ids.add(flow.id)
    try {
      if (!['http:', 'https:'].includes(new URL(flow.startUrl).protocol)) throw new Error()
    } catch {
      fail(`${field}.startUrl`, 'expected an absolute HTTP(S) URL')
    }
    if (
      !Array.isArray(flow.successCriteria) ||
      !flow.successCriteria.length ||
      flow.successCriteria.some((item) => typeof item !== 'string' || !item.trim())
    )
      fail(`${field}.successCriteria`, 'expected non-empty requirement strings')
  }
  if (
    project.outputDir !== undefined &&
    (typeof project.outputDir !== 'string' || !project.outputDir.trim())
  )
    fail('outputDir', 'expected a directory path')
  try {
    validateLimits(project.limits)
  } catch (error) {
    fail('limits', (error as Error).message)
  }
}

export async function loadProject(file: string): Promise<Project> {
  const exported = (await import(pathToFileURL(file).href)).default
  const project = typeof exported === 'function' ? await exported() : exported
  try {
    validateProject(project)
  } catch (error) {
    if (typeof project?.dispose === 'function') await project.dispose()
    throw error
  }
  return project
}

export async function exists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return false
  }
}

export async function findConfig(explicit?: string, cwd = process.cwd()): Promise<string> {
  if (explicit) {
    const file = resolve(cwd, explicit)
    if (!(await exists(file))) throw new Error(`Config not found: ${file}`)
    return file
  }
  const candidates = ['jevtest/config.ts', 'jevtest.config.ts']
  const found = []
  for (const candidate of candidates) {
    const file = resolve(cwd, candidate)
    if (await exists(file)) found.push(file)
  }
  if (!found.length) throw new Error('No JevTest config found. Run jevtest init or use --config.')
  if (found.length > 1) throw new Error('Multiple JevTest configs found. Select one with --config.')
  return found[0]!
}
