# Team task board

A project task service with assignments, completion, archiving, activity history, and viewer/editor permissions. It keeps a target task and an unrelated task so tests can detect collateral edits as well as the intended change.

**240 user flows:** four workflows × 30 fixture combinations × healthy/faulty versions. The 120 matched task pairs vary project, task ID, title, assignee, and priority. The task is selected from three requests after choosing the appropriate dashboard operation.

| Workflow               | Healthy / faulty | Deliberate faults                                 |
| ---------------------- | ---------------- | ------------------------------------------------- |
| Assign                 | 30 / 30          | Wrong assignee; priority reset                    |
| Complete               | 30 / 30          | Duplicate activity; stale completed count         |
| Archive                | 30 / 30          | Deletion instead of archival; wrong task archived |
| Reject viewer mutation | 30 / 30          | Permission bypass; a write despite denial         |

Each fault appears in 15 cases. Permission tests deliberately submit unauthorized requests; correct denial without a write is a passing result. Checks cover the persisted record and activity, so a reassuring UI message alone cannot pass.

- [app.ts](app.ts): task operations, role checks, and deliberate defects.
- [cases.ts](cases.ts): all parameterized tasks and evaluator-only labels.
- [oracle.ts](oracle.ts): independent record and side-effect requirements.
- [results](results/): generated, sanitized scores for every evaluated flow.

Run manually: `pnpm benchmark:serve taskboard`, then open `http://127.0.0.1:4320`. Run without API access: `pnpm benchmark --app taskboard --mode reference`. The [shared harness](../benchmarks/) supplies session isolation, browser execution, replay, and scoring.

Fault labels and expected results are never sent to Jev. Opaque IDs identify cases; public fixtures and actual task records supply its evidence. The evaluator credits a model warning as detection only after the fault has been exercised.

## What this run revealed

Jev flagged 28 healthy completion cases as unexpected even though every deterministic assertion passed. It missed all five exercised deletion-instead-of-archival defects. Another 41 archive runs chose the abort action before completion, and one completion case stopped on a TypeSafe HTTP 529. Those incomplete cases remain in the recall denominator.

The combined system also reported 23 healthy permission cases because of the same **route-sensitive grading limitation** described in the [ledger example](../ledger/README.md#what-this-run-revealed): the ordinary assignment route correctly denied a viewer's request, but the oracle required the dedicated permission route. One further healthy completion case selected assignment instead of completion, correctly failing its task assertions. These are distinct from the 28 semantic model false alarms. Fault injection is route-specific, so alternate routes also reduce measured fault exposure. The report preserves the original run rather than changing grading rules after seeing the results.

<!-- evaluation:start -->

## Evaluation results

| Metric                                   | Reference route | Jev                |
| ---------------------------------------- | --------------- | ------------------ |
| Evaluated flows                          | 240             | 240                |
| Healthy flows passed                     | 120/120         | 73/120             |
| Faulty flows exercised                   | 120/120         | 80/120             |
| Combined detected / faulty flows         | 120/120         | 80/120             |
| Combined recall                          | 100.0%          | 66.7%              |
| Combined healthy false alarms            | 0               | 52                 |
| Combined precision                       | 100.0%          | 60.6%              |
| Incomplete / infrastructure errors       | 0 / 0           | 41 / 1             |
| Reproduced traces                        | 240/240         | 239/240            |
| Replay cleanup failures                  | 0               | 0                  |
| Replay state/action/assertion divergence | 0               | 0                  |
| Other unreplayable traces                | 0               | 1                  |
| API requests                             | 0               | 1315               |
| Reported input + output tokens           | 0 + 0           | 2,212,101 + 64,163 |
| Budget-charged tokens                    | 0               | 2,296,708          |

Live run: **2026-09-17T05:21:29.245Z**; resolved model: **jev-1.13.0**.

Model-only recall: **62.5%** (75/120); precision: **72.8%**; healthy false alarms: **28/120**.

Recall among exercised faults: **93.8%**. Uncertain assessments: **262**. Assessment errors: **0**. Runs with model warnings before any fault was exercised: **28** (not credited as detections).

| Planted fault      | Exercised / cases | Model detections | Combined detections |
| ------------------ | ----------------- | ---------------- | ------------------- |
| archive-other-task | 6/15              | 6/15             | 6/15                |
| delete-instead     | 5/15              | 0/15             | 5/15                |
| denied-write       | 6/15              | 6/15             | 6/15                |
| duplicate-activity | 15/15             | 15/15            | 15/15               |
| permission-bypass  | 4/15              | 4/15             | 4/15                |
| reset-priority     | 15/15             | 15/15            | 15/15               |
| stale-count        | 14/15             | 14/15            | 14/15               |
| wrong-assignee     | 15/15             | 15/15            | 15/15               |

Missed by the model: 45 cases; inspect the per-case actions, judgments, and failed assertions in [Jev results](results/jev.json).

- 1 unfinished case(s), complete: TypeSafe HTTP 529; no automatic retry was made. Example: `case-6ba0d5019b7479db`.
- 41 unfinished case(s), archive: Policy chose Abort testing. Example: `case-bcbfddf08d7e8ae7`.

Replay cleanup failures mean the browser did not close within the runner’s five-second cleanup allowance; they are retained as failed replays even when application states and assertions matched. These failures are separate from state divergence and detection misses. Parallel browser startup/shutdown on the evaluation host can affect this metric.

Source/runner digest: `7c8b526dd69f80a659d8d57bddcad03f29bc7b71e976317188bf5324c73c2248`. Environment: win32/x64, Node v24.3.0. Full local evidence: `artifacts/benchmarks-2026-09-17T05-08-28-678Z/taskboard/jev`.

The reference route is an oracle/fixture sanity check with known action sequences, not an autonomous baseline. Jev receives multiple action choices and must select the route and fixture. Combined detection includes deterministic assertions; it must not be presented as model-only accuracy.

Faulty cases that abort or never exercise the mutation remain misses in end-to-end recall. Reproduction measures the exact observed trace, including incomplete prefixes, and does not establish that model judgments are correct. This is one deterministic, synthetic, parameterized run without statistical confidence intervals; it does not establish real-world bug recall.

**Reproduction:** `pnpm benchmark --app taskboard --mode both --write-results`. Requires `TYPESAFE_API_KEY` for the Jev phase. Full runs overwrite only the generated results section and sanitized result JSON; partial pilot runs cannot overwrite published results.
<!-- evaluation:end -->
