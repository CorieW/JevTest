# Team task board

**Current implementation:** a layered application with validated commands, editable forms, domain services, persistent records, revision checks, and idempotent submissions. [Architecture and operation](../../docs/example-architecture.md). Live results farther down describe earlier fixture revisions; they are not measurements of this rewritten application.

A project task service with assignments, completion, archiving, activity history, and viewer/editor permissions. It keeps a target task and two unrelated tasks so tests can detect collateral edits as well as the intended change.

**240 user flows:** four workflows × 30 fixture combinations × healthy/faulty versions. The 120 matched task pairs vary project, task ID, title, assignee, and priority. Users choose a task from the project records and fill the relevant teammate or operation form before reviewing and saving.

| Workflow               | Healthy / faulty | Deliberate faults                                 |
| ---------------------- | ---------------- | ------------------------------------------------- |
| Assign                 | 30 / 30          | Wrong assignee; priority reset                    |
| Complete               | 30 / 30          | Duplicate activity; stale completed count         |
| Archive                | 30 / 30          | Deletion instead of archival; wrong task archived |
| Reject viewer mutation | 30 / 30          | Permission bypass; a write despite denial         |

Each fault appears in 15 cases. Permission tests deliberately submit unauthorized requests; correct denial without a write is a passing result. Checks cover the persisted record and activity, so a reassuring UI message alone cannot pass.

Run manually: `pnpm benchmark:serve taskboard`, then open `http://127.0.0.1:4320`. Run without API access: `pnpm benchmark --app taskboard --mode reference`. The [shared harness](../../test/benchmarks/) supplies session isolation, browser execution, replay, and scoring.

Fault labels and expected results are never sent to Jev. Opaque IDs identify cases; public fixtures and actual task records supply its evidence. The evaluator credits a model warning as detection only after the fault has been exercised.

## Current reference evaluation

The rewritten application was evaluated on **2026-09-17** using all 240 flows, a twelve-action limit, and three browser workers.

| Metric                                                  | Result  |
| ------------------------------------------------------- | ------- |
| Healthy flows passed                                    | 120/120 |
| Planted faults exercised and caught by exact assertions | 120/120 |
| Healthy false alarms                                    | 0       |
| Reproduced traces                                       | 240/240 |
| Incomplete / infrastructure errors                      | 0 / 0   |
| API requests / charged tokens                           | 0 / 0   |

This known-route run validates the application, fault reachability, independent assertions, and replay. **Jev was not called; these are not model-accuracy scores.** [Sanitized per-case results](results/realistic-reference.json). Source/runner digest: `d4d71afe82861d31a462eddc7b0dbaf5b448dbd30ca88ba810083d902b543c9b`.

## Code layout

- [domain.ts](domain.ts): typed records and command validation.
- [service.ts](service.ts): business operations and deliberate fault profiles.
- [view.ts](view.ts): forms and application-specific record tables.
- [app.ts](app.ts): composition and benchmark integration.
- [cases.ts](cases.ts) and [oracle.ts](oracle.ts): paired fixtures and independent checks.

## Historical full-suite run

The following findings and generated results describe commit `783f5e2`, before the local fixture and policy corrections. The original result JSON remains unchanged. See the local comparison below for measurements on the corrected examples.

### What this run revealed

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

## Local improvement evaluation

Compared on corrected fixtures with pinned model `jev-1.13.0`. [Methods, changes, limitations, and spending](../../docs/improvements.md); [per-case comparison](results/improvements.json).

| Measurement                                  | Original policy | Candidate                |
| -------------------------------------------- | --------------- | ------------------------ |
| Full flows, variants 22?23: model detections | 7/8 faults      | 7/8 faults (v5)          |
| Same full flows: combined detections         | 8/8 faults      | 8/8 faults (v5)          |
| Full-flow healthy false alarms               | 0/8             | 0/8                      |
| Full traces completed and replayed           | 16/16           | 16/16                    |
| Fresh terminal assessment, variant 27        | 4/4 faults      | 4/4 faults (retained v6) |
| Fresh healthy false alarms                   | 0/4             | 0/4                      |
| Fresh healthy uncertain judgments            | 1/4             | 0/4                      |

Both full-flow policies ran live against the same corrected fixture revision. The small-sample phase did not include another end-to-end run; the complete live rerun follows below. The fresh sample covers four fault types; it does not validate every planted type. These small parameterized comparisons do not establish real-world recall.

<!-- full-live-comparison:start -->

## Historical live rerun: all 240 flows

This historical run used the v6 policy and the pre-refactor application, running every flow live, including action selection and intermediate assessments, followed by replay. Model: `jev-1.13.0`; started 2026-09-17T10:08:57.409Z; finished 2026-09-17T10:25:47.329Z. [Per-case results](results/full-live-v6.json).

| Metric                                | Previous full live run | Current full live run |
| ------------------------------------- | ---------------------- | --------------------- |
| Flows evaluated                       | 240                    | 240                   |
| Model detections / planted faults     | 75/120                 | 102/120               |
| Model recall                          | 62.5%                  | 85.0%                 |
| Model healthy false alarms            | 28/120                 | 0/120                 |
| Model precision                       | 72.8%                  | 100.0%                |
| Combined detections / planted faults  | 80/120                 | 118/120               |
| Combined healthy false alarms         | 52/120                 | 0/120                 |
| Faults exercised                      | 80/120                 | 118/120               |
| Healthy flows passed exact assertions | 73/120                 | 120/120               |
| Unclassified healthy flows (model)    | 47                     | 0                     |
| Incomplete / infrastructure errors    | 41 / 1                 | 0 / 0                 |
| Replayed traces                       | 239/240                | 240/240               |
| Replay cleanup failures               | 0                      | 0                     |
| Assessment / verification errors      | 0                      | 0                     |

New model detections: 31; previous detections lost: 4. Of the new detections, 31 involve faults the previous run never exercised.

The earlier 240-flow historical result remains unchanged above. This comparison includes both generic policy improvements and the documented example corrections, so the entire difference cannot be attributed to the model policy alone. Unfinished healthy flows are unclassified, not true negatives. Combined detections include exact assertions. See the [complete 720-flow analysis](../../docs/full-live-comparison.md) for methodology, token cost, and limitations.

<!-- full-live-comparison:end -->
