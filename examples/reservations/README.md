# Reservation desk

A self-contained reservation service with guest capacity, per-guest pricing, cancellation refunds, and rescheduling. The application provides room selection, guest/date entry, review and edit screens, conflict detection, and persisted reservation/payment records.

**240 user flows:** four workflows × 30 fixture combinations × healthy/faulty versions. That is 120 distinct parameterized tasks, each tested as a matched pair—not 240 unrelated workflow implementations. Guests, room, slot, price, and refund percentage vary across the fixtures.

| Workflow                     | Healthy / faulty | Deliberate faults                     |
| ---------------------------- | ---------------- | ------------------------------------- |
| Reserve                      | 30 / 30          | Wrong price; duplicate reservation    |
| Cancel                       | 30 / 30          | Uncancelled record; missing refund    |
| Reschedule                   | 30 / 30          | Wrong slot; extra charge              |
| Reject over-capacity request | 30 / 30          | Overbooking; charge despite rejection |

Each fault appears in 15 cases. Healthy rejection is a successful test outcome, not an application error.

Run manually: `pnpm benchmark:serve reservations`, then open `http://127.0.0.1:4320`. Run without API access: `pnpm benchmark --app reservations --mode reference`. Shared HTTP/browser/evaluation infrastructure is in [benchmarks](../../test/benchmarks/); state is stored in a local file repository, with no external services required.

Fault labels, reference actions, and grading outcomes stay server-side. Jev sees only opaque case IDs, the user goal, public input fixtures, the rendered UI and actual records. The bug is applied only when the intended mutation is exercised. Sessions and backend records are isolated per run; replay starts fresh.

<!-- evaluation:start -->

## Evaluation results

The current application was evaluated on **2026-09-17** using all 240 flows, a twelve-action limit, and three browser workers.

| Metric                                                  | Result  |
| ------------------------------------------------------- | ------- |
| Healthy flows passed                                    | 120/120 |
| Planted faults exercised and caught by exact assertions | 120/120 |
| Healthy false alarms                                    | 0       |
| Reproduced traces                                       | 240/240 |
| Incomplete / infrastructure errors                      | 0 / 0   |
| API requests / charged tokens                           | 0 / 0   |

This known-route run validates the application, fault reachability, independent assertions, and replay. **Jev was not called; these are not model-accuracy scores.** Per-case evidence, source digests, and environment details are written to ignored `artifacts/benchmarks-*` directories when evaluations run.

<!-- evaluation:end -->

## Code layout

Application code lives in `src/`; JevTest configuration, fixtures, and correctness checks live separately in `jevtest/`.

- [src/domain.ts](src/domain.ts): typed records and command validation.
- [src/service.ts](src/service.ts): business operations and deliberate fault profiles.
- [src/view.ts](src/view.ts): forms and application-specific record tables.
- [jevtest/config.ts](jevtest/config.ts): JevTest benchmark configuration, seeded state, and application wiring.
- [jevtest/cases.ts](jevtest/cases.ts) and [jevtest/oracle.ts](jevtest/oracle.ts): paired fixtures and independent checks.

See [application architecture](../../docs/example-architecture.md) for persistence, request handling, and evaluation details.
