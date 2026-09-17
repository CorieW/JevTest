# Example application architecture

The three larger examples are small, runnable web applications. Each has typed domain records, validated commands, business services, HTML screens, editable forms, persistent state, and an independent correctness oracle. The shop remains a smaller application covered by its twelve browser flows.

`examples/` contains only these tested applications and their documentation/results. Shared serving and evaluation infrastructure lives under `test/benchmarks/`. There are no additional packages or workspaces.

## Application structure

Each of `examples/reservations`, `examples/ledger`, and `examples/taskboard` has:

| File                | Responsibility                                               |
| ------------------- | ------------------------------------------------------------ |
| `src/domain.ts`     | Domain records, typed commands, and input schemas            |
| `src/service.ts`    | Business operations independent of the browser and evaluator |
| `src/view.ts`       | Application-specific tables, forms, summaries, and receipts  |
| `jevtest/config.ts` | JevTest configuration, seeded policy, and application wiring |
| `jevtest/cases.ts`  | 240 paired user flows and their public input fixtures        |
| `jevtest/oracle.ts` | Independent exact checks against observed saved records      |
| `results/`          | Sanitized evaluations, with historical revisions identified  |

Application code lives in `src/`. JevTest configuration, paired fixtures, and independent assertions live in `jevtest/` within the same example directory. Application source does not import these evaluation modules. The shared benchmark catalog loads each `jevtest/config.ts`; these definitions are used by `pnpm benchmark` and `pnpm benchmark:serve`.

The shop uses the same separation: `src/server.ts` and `src/serve.ts` implement and serve the application, while `jevtest/config.ts`, `jevtest/project.ts`, and `jevtest/run.ts` configure and evaluate its twelve flows. Its CLI config is passed with `--config examples/shop/jevtest/config.ts`.

Services validate commands and return new state without modifying their input. Optional fault profiles deliberately introduce the benchmark defects. Fault selection and reference routes stay outside the model-visible flow and application responses. The browser presents records and form controls; it no longer prints a JSON dump or offers opaque numbered request choices.

### Reservation Desk

Users choose a room, enter a guest count and date/time, review their request, and confirm. Existing reservations can be cancelled or rescheduled. The service validates calendar dates, rejects conflicting bookings, enforces capacity, calculates charges and refunds, prevents repeated cancellation refunds, and retains unrelated reservations. The UI shows room rates, the booking register, payment totals, and saved outcomes.

### Pocket Ledger

Users enter transfer amounts and select recipient accounts, payments, or cards. Successful transfers produce balanced source, recipient, and fee journal entries. Refunds preserve settlement records and prevent a second refund; transfers check available funds and account limits. The UI shows balances, payment status, cards, and the journal. Amounts are integer synthetic credits; no real financial service is contacted.

### Team Workspace

Users select actual task records and teammates to assign, complete, or archive work. Server-seeded project membership controls authorization. Completion is idempotent, archived records remain available, and successful mutations record an actor-attributed activity. Active tasks, archive records, completion counts, and activity are separate views. The seeded identity represents a signed-in application user; account registration and an external identity provider are outside this example's scope.

## Serving and persistence

```sh
pnpm benchmark:serve ledger
pnpm benchmark:serve reservations 4321
pnpm benchmark:serve taskboard 4322
```

The default port is 4320. The landing page opens a healthy sample workspace; “Switch sample workspace” lists the available tasks. Reloading keeps saved data. Switching to another task seeds that workspace. Manual sessions persist under ignored `artifacts/example-data/<application>/`; evaluation sessions use isolated directories and remove their own records during cleanup.

The shared single-process server exposes `GET /api/state` and `POST /api/commands`. Commands carry an `If-Match` revision and an `Idempotency-Key`. A duplicate request returns its stored response; conflicting key reuse or stale revisions return 409. The last 32 responses are retained, and older stale requests still fail revision checks. Invalid payloads return 400, invalid form values return 422, and missing concurrency preconditions return 428. Authorization comes from the server's principal, regardless of fields supplied by the client.

File replacement is atomic, so a failed save cannot leave half of a command applied. The repository uses bounded retries for transient Windows rename conflicts. This is a single-process local JSON repository; it does not claim multi-process database transaction guarantees. All input fixtures are synthetic.

## Evaluation and verification

The three larger applications retain 720 flows: four workflow families per app, thirty input combinations, and matched healthy/faulty implementations. The matrix covers 24 planted fault types. The flows now fill real controls and submit forms, requiring four to six reference actions. Evaluation allows twelve actions so navigation, edits, and validation recovery can be observed.

The adapter exposes available controls, public fixtures, visible text, and public application records. Private fault labels, reference actions, and oracle results never enter Jev's decision context. Fault-exposure accounting includes form-fill steps, so a warning before the actual mutation cannot receive detection credit.

```sh
pnpm verify
pnpm benchmark --mode reference
```

Verification covers all 720 case/oracle combinations, representative Chromium flows and replay, malformed and stale HTTP requests, duplicate submissions, reload and server-restart persistence, keyboard form submission, permissions, balanced entries, refund guards, date validation, and retained records. The complete reference run exercises all 720 browser flows without model calls; each example README records its outcome.

The older Jev live results describe the pre-refactor fixtures. They remain available as historical evidence and must not be treated as scores for these changed applications. No live-model accuracy claim is made for this revision. A future comparison must run complete live suites against the same application revision and use an explicitly authorized token budget.

## Verified results for this revision

On 2026-09-17, `pnpm verify` passed all 67 tests, secret scanning, formatting, lint, type checking, and the build. The complete 720-flow browser/reference evaluation passed all 360 healthy cases, exercised and detected all 360 planted faults through independent exact assertions, and reproduced all 720 traces. No cases were incomplete and no infrastructure errors or healthy false alarms occurred. API requests and charged tokens were both zero.

The per-application `results/realistic-reference.json` files retain every case outcome, action sequence, replay outcome, environment, and source digest. Earlier live result files remain unchanged.
