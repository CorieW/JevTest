---
name: jevtest
description: Set up or extend JevTest exploratory browser testing in an application codebase. Inspect the app, configure isolated fixtures and meaningful user flows, implement exact checks, and validate the integration with offline runs and replay.
---

# JevTest

Deliver a working integration, not just a generated config. Inspect the application, implement its flows and checks, run them, and leave reproducible commands. Preserve existing integrations and application behavior.

## Locate and prepare

Identify the target application's repository and a JevTest checkout separately. Read their local instructions. Inspect the application's start commands, tests, routes, forms, authentication, data setup, and business requirements. Reuse existing test fixtures and local services where practical. Ask only for missing requirements or access that prevents meaningful progress.

JevTest currently runs from a source checkout; its package is private and unpublished. Do not use `npx jevtest` or install an assumed registry release. Locate an existing checkout first. If one is unavailable, obtain the repository identified by the user or the project's README in a separate tools directory. Do not replace the application's package manager or add a workspace structure for JevTest.

In the JevTest checkout, use Node 24 and pnpm 11:

```sh
pnpm install
pnpm setup:local
```

Read that checkout's `src/project.ts` for `defineProject`, `BrowserFlow`, and check helpers. Read `src/browser.ts` and `docs/project-guide.md` when authentication, backend fixtures, custom actions, or authoritative API checks are needed. Use the checked-out version's interfaces.

## Scaffold inside the application

Run the compiled CLI **from the application directory**. In the commands below, replace `/path/to/JevTest` with the actual checkout path and quote paths containing spaces:

```sh
node /path/to/JevTest/dist/cli.js init
```

This creates `jevtest/config.ts`, `jevtest/flows.ts`, and `jevtest/tsconfig.json`, adds package scripts without replacing existing script names, and ignores `.env.local` and `artifacts/`. It refuses to overwrite an existing integration. If `jevtest/config.ts` or `jevtest.config.ts` already exists, inspect and extend it instead; use `--config` when discovery is ambiguous.

Keep fixtures, assertions, and JevTest utilities inside the application's `jevtest/` directory, separate from its production code. Preserve the generated imports: they point to the chosen checkout's `dist/index.js`, rather than a registry package. Keep that checkout available and document its location. Check existing script-name collisions before relying on the generated scripts.

The generated typecheck script assumes TypeScript is available in the application. When it is not, use the checkout's compiler without changing application dependencies:

```sh
node /path/to/JevTest/node_modules/typescript/bin/tsc --noEmit -p jevtest/tsconfig.json
```

For a CommonJS application, keep its package type unchanged. If the integration needs an ESM boundary, add `jevtest/package.json` with `{"private":true,"type":"module"}` and typecheck again. Node's direct TypeScript loading requires erasable syntax; avoid enums, parameter properties, and unresolved application path aliases in the integration.

## Implement real flows

Choose a small, representative set of complete user tasks from the application's requirements and existing tests. Include useful validation or boundary cases where their expected behavior is established. Extend coverage according to the requested scope; do not manufacture hundreds of near-duplicates or import JevTest benchmark fault labels.

For each flow, define:

- A stable ID, user goal, starting path, and synthetic fixture values.
- Input choices keyed by the exact selectors offered by DOM discovery. Discovery prefers `data-testid`, then element IDs, then structural selectors. Text and select controls have no actions unless values are supplied; select values must match option values.
- A terminal selector or predicate in `completeWhen`, plus nonempty exact checks of the required outcome. Completion identifies when to judge the result; it does not establish correctness.
- Invariants only for rules that must hold at every observed state. Checks are evaluated during intermediate states too, so missing confirmation data must return a failed result rather than throw or wait indefinitely.

Use `defineProject` and `checks.text`, `checks.count`, or `checks.visible` for simple DOM requirements. Use named custom checks for business rules or authoritative API/database state. Read [the flow example](references/flow.md) for the configuration shape.

Derive expected results from requirements and fixture inputs, independently of observed actions, model judgments, and the application's function under test. Check persisted records, totals, permissions, or unchanged data when the requirement demands them. A success toast alone does not prove that a transaction was saved correctly. Keep assertion-only expectations and fault metadata out of model-visible fixtures and observations.

Replace every generated TODO and `checks.pending()` before declaring setup complete. If a requirement cannot be established, describe the missing information and keep that flow explicitly unfinished; do not substitute an always-passing check.

## Make execution repeatable

Configure a stable local URL and application-specific `ready` condition that also works after actions. Prefer `webServer` with the application's existing start command and readiness URL; set `cwd` if the command needs another directory. Set `reuseExistingServer: true` only when intentionally targeting an already running test server. JevTest stops servers it starts. A project factory may instead return `dispose` for resources it owns.

Browser contexts isolate browser state, not backend data. Use `browser.setup(page, flow, runId)` to seed a test account or isolated records and establish authentication before navigation. Use `browser.cleanup(flow, runId)` to remove only those records. Setup must support repeated discovery and replay with a new run ID. Start with concurrency 1 when shared state cannot yet be isolated.

Password, hidden, and file inputs are excluded from automatic discovery. Establish authentication in setup using the application's test mechanisms; do not expose credentials as action inputs or fixtures. Add required API or asset origins through `browser.allowedOrigins`. Use explicit actions or a custom adapter when the application needs unsupported interactions; do not claim uploads, iframes, or multi-tab flows are covered by default.

Set finite step, time, and concurrency limits appropriate to the chosen tasks. Restrict actions when a local page links to privileged or destructive operations. Baseline, discovery, and replay make no model calls, but they still execute application actions.

## Validate and finish

From the application directory, typecheck the integration, then run:

```sh
node /path/to/JevTest/dist/cli.js doctor --policy baseline
node /path/to/JevTest/dist/cli.js run --policy baseline --flow FLOW_ID
node /path/to/JevTest/dist/cli.js replay --trace artifacts/run/RUN_ID/trace.json
```

Replace flow and trace placeholders with actual IDs and output paths. Pass `--config` consistently for a nondefault config. Use `--env-file .env.local` only when local environment values are needed; existing process values win. Doctor checks readiness, not correctness or API authentication.

Inspect the resulting trace and exact assertions, replay a representative completed run, and verify cleanup. Expand offline validation to the configured flows. Baseline traversal can exhaust limits without reaching a goal: inspect the trace and available inputs, use `discover --flow FLOW_ID` when useful, and distinguish unreachable tasks from actual assertion failures. Do not weaken checks, hide failures, or call an incomplete run a pass to finish setup. Reproduction of an incomplete trace confirms only its recorded prefix.

Where feasible, demonstrate that a meaningful check rejects an incorrect outcome using an isolated fixture variation or existing application test. Do not alter production behavior to make the evaluation pass. Run the target repository's applicable checks after integration edits.

Live Jev runs are optional. Use them only within the user's authorized scope and explicit token/request budget. Keep keys in process environment or ignored local files; never copy them into code, command arguments, reports, or messages. Use `--max-tokens` and `--max-requests`, track usage across retries and separate invocations, and stop when the authorized allowance is consumed. The CLI budget is per invocation and conservative admission accounting, not a provider-enforced billing ceiling. Do not assume an earlier project's budget authorizes this one.

Leave brief application-local instructions for starting, typechecking, offline runs, replay, and optional live runs. Report implemented flows, actual outcomes, evidence paths, and unresolved gaps. Keep raw evidence and credentials ignored. Setup does not authorize committing, pushing, publishing, or adding credentialed CI runs.
