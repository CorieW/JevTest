# JevTest

**Project domain:** JevTest.dev (`jevtest.dev`).

JevTest is a local TypeScript library and CLI for exploratory browser testing. Supply a goal, fixture data, available actions, and exact success assertions. Jev chooses actions and judges observed results; Playwright executes them in isolated sessions and saves replayable evidence.

**Status:** working local library and CLI. Source is publicly visible at [CorieW/JevTest](https://github.com/CorieW/JevTest). Licensing terms are pending adoption; no usage license is granted yet and package publishing remains disabled. See [licensing intent](docs/licensing.md).

## Get started

Requires Node 24 and pnpm 11.

```sh
pnpm install
pnpm browser:install
pnpm verify
pnpm demo
```

The demo starts its own local shop, runs 12 labeled flows with six deliberately planted bugs, replays every trace, and writes an HTML report and metrics under `artifacts/baseline-*`. Expected planted failures do not make the demo command fail.

To run the same suite using Jev, copy `.env.example` to `.env.local`, set `TYPESAFE_API_KEY`, then run:

```sh
pnpm demo:live
```

The live demo uses one shared 250,000-token admission budget and at most 80 requests. It records actual provider usage. Ordinary tests, discovery, the baseline, and replay make **no model API calls**. See [budget behavior](docs/project-guide.md#api-budgets).

## Test your application

1. Build with `pnpm build`.
2. Run `pnpm dev init` to generate `jevtest/config.ts` and one unfinished flow.
3. Edit `jevtest/flows.ts` and `jevtest/config.ts` with your URL, inputs, exact checks, and readiness condition.
4. Set `TYPESAFE_API_KEY` in the process environment, or pass `--env-file .env.local` when running live.

```sh
node dist/cli.js run  --max-tokens 250000
node dist/cli.js run  --policy baseline
node dist/cli.js discover  --flow checkout
node dist/cli.js replay  --trace artifacts/run/RUN_ID/trace.json
```

Use `--env-file` consistently with CLI commands, `pnpm benchmark`, and evaluation scripts. Existing process variables take precedence; environment files are never loaded implicitly.

The CLI discovers `jevtest/config.ts` or `jevtest.config.ts`. If both exist, select one with `--config`. Initialization preserves existing files and scripts; the generated check cannot pass until you implement it. Run `pnpm jevtest:typecheck` to check the generated configuration.

Node 24 can load the example's erasable TypeScript directly. During development, `pnpm dev` runs the CLI through `tsx`. Config files are trusted executable code.

Each flow has a separate browser context. Use `setup`, `cleanup`, and the supplied unique run ID to isolate **backend** data as well. Browser isolation alone does not isolate a shared database.

A flow can use exact browser checks without implementing an adapter:

```ts
import { defineProject, checks } from '../dist/index.js'

export default defineProject({
  baseUrl: 'http://127.0.0.1:3000',
  ready: '[data-testid="app-ready"]',
  flows: [
    {
      id: 'checkout',
      goal: 'Place exactly one order.',
      inputs: { '#email': ['customer@example.test'] },
      completeWhen: '[data-testid="order-confirmation"]',
      checks: [checks.count('[data-testid="order-row"]', 1)],
    },
  ],
})
```

To start your application automatically, add `webServer` to either configuration style:

```ts
webServer: {
  command: 'pnpm dev',
  url: 'http://127.0.0.1:3000/health',
  timeoutMs: 30000,
}
```

Commands run from the invoking directory unless `cwd` is set. JevTest waits for an HTTP 2xx/3xx response and closes its owned process tree after completion, failure, or cancellation. Existing servers require `reuseExistingServer: true` and are never stopped by JevTest. Start commands are trusted shell code.

Use custom named checks for authoritative API/database assertions, or supply a complete adapter for advanced integrations.

## Outcomes and evidence

| Outcome      | Meaning                                                                              |
| ------------ | ------------------------------------------------------------------------------------ |
| `passed`     | The flow reached its terminal condition and every deterministic assertion passed.    |
| `failed`     | A deterministic requirement or action execution failed.                              |
| `incomplete` | Abort, cancellation, step/repetition/time limit, or API budget prevented completion. |
| `error`      | Configuration, provider, or runner infrastructure prevented evaluation.              |

Model assessments check public requirements separately against observed changes. Candidate findings receive a separate evidence review; an accepted `unexpected` assessment creates a **candidate issue**, even when assertions pass. It does not prove a bug. Weak or conflicting assessments remain `uncertain`. Traces retain individual checks, review decisions, probabilities, and confidence.

Every run saves `trace.json`, page snapshots, and masked screenshots. Suite output includes `report.html`, `summary.json`, `graph.json`, and `graph.dot`. Replay checks recorded states, action definitions, and assertions without asking Jev to choose again. State drift is reported instead of silently adapting the trace.

## Project structure

```text
src/             Runner, Jev policy, Playwright adapter, CLI, replay, reports, graph
test/            Offline contract and real Chromium integration tests
examples/        Four tested applications, fixtures, and evaluation results
config/          TypeScript, ESLint, Prettier, Vitest configuration
docs/            Architecture, integration constraints, validation, licensing intent
.github/         CI, dependency updates, issue and PR templates
```

The project uses one root TypeScript package. Shared example hosting and evaluation code lives in `test/benchmarks/`. Each example keeps application code in `src/` and JevTest integration in `jevtest/`. Application source has no dependency on the evaluation code.

## Examples and validation

The [example applications](examples/README.md) include reservations, a synthetic ledger, a task board, and a shop. The three larger applications define 720 flows with editable forms, business services, persistence, and request validation.

The current reference evaluation passed all 360 healthy cases, detected all 360 planted faults through exact checks, and reproduced all 720 traces without API calls. Live Jev accuracy has not been measured on these application versions. Run `pnpm benchmark --mode reference` to repeat the evaluation.

See the [project guide](docs/project-guide.md) for integration and budgets, and [example architecture](docs/example-architecture.md) for application structure and evaluation details.
