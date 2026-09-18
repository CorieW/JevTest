// Run and replay the new payment integration against isolated real application instances.
import { expect, it } from 'vitest'
import { mkdtemp, mkdir } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import repairWorksProject from '../examples/repairworks/jevtest/config.js'
import { runSuite } from '../src/runner.js'
import { replay } from '../src/replay.js'
import { TraversalPolicy } from '../src/jev.js'
import { reachable } from '../src/server.js'

it('accepts one payment, catches a duplicate receipt, and reproduces both outcomes', async () => {
  const root = resolve('artifacts/repairworks-project-tests')
  await mkdir(root, { recursive: true })
  const output = await mkdtemp(join(root, 'run-'))
  const project = repairWorksProject()
  const results = await runSuite({
    flows: project.flows,
    adapter: project.adapter,
    limits: project.limits,
    policy: new TraversalPolicy(),
    outputDir: output,
  })
  expect(results.map((result) => result.status)).toEqual(['passed', 'failed'])
  expect(results.map((result) => result.steps.length)).toEqual([3, 6])
  expect(results[1]!.issues.some((issue) => issue.message.includes('exactly one payment'))).toBe(
    true,
  )
  const duplicate = results[1]!.steps
    .at(-1)!
    .check!.assertions.find((check) => check.name === 'Exactly £10 is credited')!
  expect(duplicate).toMatchObject({ passed: false, expected: 1000, actual: 2000 })
  for (const result of results) {
    expect(await reachable(result.flow.startUrl)).toBe(false)
    const reproduced = await replay(result, project.adapter, output)
    expect(reproduced.reproduced, reproduced.reason).toBe(true)
    expect(await reachable(result.flow.startUrl)).toBe(false)
  }
}, 60000)
