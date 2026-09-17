# Pocket ledger

A synthetic wallet service with transfers, refunds, card controls, and per-transfer limits. Balances and transaction history are local fixture data; this code never handles real money or calls financial services.

**240 user flows:** four workflows × 30 fixture combinations × healthy/faulty versions. The 120 matched task pairs vary amounts, starting balances, recipient accounts, fees, payment IDs, and cards. Each flow opens an operation, fills its actual recipient, amount, payment, or card controls, reviews the changes, and confirms.

| Workflow                   | Healthy / faulty | Deliberate faults                   |
| -------------------------- | ---------------- | ----------------------------------- |
| Transfer                   | 30 / 30          | Wrong recipient; duplicate debit    |
| Refund                     | 30 / 30          | Unmarked refund; double refund      |
| Freeze card                | 30 / 30          | Wrong card frozen; all cards frozen |
| Reject over-limit transfer | 30 / 30          | Limit bypass; fee on rejection      |

Each fault appears in 15 cases. Correct limit rejection is a successful flow. The oracle checks exact balances, permitted fees, ledger cardinality, refund state, and unaffected cards.

Run manually: `pnpm benchmark:serve ledger`, then open `http://127.0.0.1:4320`. Run without API access: `pnpm benchmark --app ledger --mode reference`. The shared [benchmark host](../../test/benchmarks/host.ts) handles isolated sessions and browser presentation; all domain logic lives here.

Jev receives public account state and task inputs, not the fault label or expected grader answer. Matched pairs have identical model-visible starting states. A private server journal records whether and when each defect was exercised.

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

Application code lives in `src/` and has no dependency on JevTest. The `jevtest/` directory imports the application and supplies evaluation configuration, fixtures, and correctness checks.

- [src/app.ts](src/app.ts): menus, public state, and form transitions.
- [src/ui.ts](src/ui.ts): local form types, validation flow, and HTML helpers.
- [src/domain.ts](src/domain.ts): typed records and command validation.
- [src/service.ts](src/service.ts): business operations and deliberate fault profiles.
- [src/view.ts](src/view.ts): forms and application-specific record tables.
- [jevtest/config.ts](jevtest/config.ts): JevTest wiring and deliberate-fault selection.
- [jevtest/fixtures.ts](jevtest/fixtures.ts): evaluation seed records and policy.
- [jevtest/fields.ts](jevtest/fields.ts): mappings from form controls to test inputs.
- [jevtest/cases.ts](jevtest/cases.ts) and [jevtest/oracle.ts](jevtest/oracle.ts): paired fixtures and independent checks.

See [application architecture](../../docs/example-architecture.md) for persistence, request handling, and evaluation details.
