# Validation

Validated on 2026-09-17 with Node 24.3.0, pnpm 11.15.1, Playwright 1.62.1, and Chromium on Windows. The repeatable commands are `pnpm verify`, `pnpm demo`, and `pnpm demo:live`.

| Metric                                         | Deterministic baseline | Live Jev |
| ---------------------------------------------- | ---------------------- | -------- |
| Flows                                          | 12                     | 12       |
| Healthy flows completed                        | 6/6                    | 6/6      |
| Planted bugs detected by combined system       | 6/6                    | 6/6      |
| Missed bugs                                    | 0                      | 0        |
| Healthy-flow false alarms                      | 0                      | 0        |
| Traces reproduced                              | 12/12                  | 12/12    |
| Bugs independently flagged as model candidates | N/A                    | 5/6      |
| Model API requests                             | 0                      | 64       |
| Input tokens                                   | 0                      | 70,807   |
| Output tokens                                  | 0                      | 2,336    |
| Total tokens                                   | 0                      | 73,143   |

The live run used **0.73143%** of the user's 10,000,000-token maximum. No retries or follow-up paid runs were needed. It used `jev-latest`; the original pilot did not capture the resolved model name. Subsequent traces record the provider-returned model and per-request usage.

Evidence directories from this development session:

- `artifacts/live-2026-09-17T02-16-36-653Z/`: live HTML report, JSON traces, screenshots, metrics, graph, and replay results.
- `artifacts/baseline-2026-09-17T02-19-52-351Z/`: equivalent zero-API baseline evidence.

The fixture uses a constrained three-action ordering flow with varied quantities/prices/discounts and explicit assertions for the planted faults. Both policies therefore find every fault. This validates integration, accounting, evidence, and replay; it does not establish that Jev outperforms graph traversal or estimate recall on unseen real-world bugs. Shortest was not benchmarked in this implementation.

The initial test suite covers runner outcomes and limits, isolated sessions, cancellation, invalid action rejection, TypeSafe protocol validation, shared concurrent budgets, unknown-usage accounting, uncertainty, real Chromium execution, six planted faults, replay divergence, DOM discovery, graph discovery, and report generation.

Live validation uses the provided key only in the child process environment. The key is not stored in source or an environment file by this implementation session.
