# Reservation desk

A self-contained reservation service with guest capacity, per-guest pricing, cancellation refunds, and rescheduling. The application exposes a dashboard, three fixture choices per request, a review screen, and persisted reservation/payment records.

**240 user flows:** four workflows × 30 fixture combinations × healthy/faulty versions. That is 120 distinct parameterized tasks, each tested as a matched pair—not 240 unrelated workflow implementations. Guests, room, slot, price, and refund percentage vary across the fixtures.

| Workflow                     | Healthy / faulty | Deliberate faults                     |
| ---------------------------- | ---------------- | ------------------------------------- |
| Reserve                      | 30 / 30          | Wrong price; duplicate reservation    |
| Cancel                       | 30 / 30          | Uncancelled record; missing refund    |
| Reschedule                   | 30 / 30          | Wrong slot; extra charge              |
| Reject over-capacity request | 30 / 30          | Overbooking; charge despite rejection |

Each fault appears in 15 cases. Healthy rejection is a successful test outcome, not an application error.

- [app.ts](app.ts): real application state transitions, observable records, and injected defects.
- [cases.ts](cases.ts): deterministic fixture matrix and ground-truth labels.
- [oracle.ts](oracle.ts): independent correctness requirements; receives no fault labels.
- [results](results/): sanitized, per-case evaluation results.

Run manually: `pnpm benchmark:serve reservations`, then open `http://127.0.0.1:4320`. Run without API access: `pnpm benchmark --app reservations --mode reference`. Shared HTTP/browser/evaluation infrastructure is in [benchmarks](../benchmarks/); no external services or database are required.

Fault labels, reference actions, and grading outcomes stay server-side. Jev sees only opaque case IDs, the user goal, public input fixtures, the rendered UI and actual records. The bug is applied only when the intended mutation is exercised. Sessions and backend records are isolated per run; replay starts fresh.

## Historical full-suite run

The following findings and generated results describe commit `783f5e2`, before the local fixture and policy corrections. The original result JSON remains unchanged. See the local comparison below for measurements on the corrected examples.

### What this run revealed

Jev detected every exercised defect. One extra-charge case stopped on a TypeSafe HTTP 503 before reaching the mutation; it remains a miss in end-to-end recall. Seven replay attempts reproduced the application states and assertions but exceeded the browser cleanup timeout. The incomplete API-error trace could not be replayed to an observable result. No failed case was retried to improve the score.

<!-- evaluation:start -->

## Evaluation results

| Metric                                   | Reference route | Jev                |
| ---------------------------------------- | --------------- | ------------------ |
| Evaluated flows                          | 240             | 240                |
| Healthy flows passed                     | 120/120         | 120/120            |
| Faulty flows exercised                   | 120/120         | 119/120            |
| Combined detected / faulty flows         | 120/120         | 119/120            |
| Combined recall                          | 100.0%          | 99.2%              |
| Combined healthy false alarms            | 0               | 0                  |
| Combined precision                       | 100.0%          | 100.0%             |
| Incomplete / infrastructure errors       | 0 / 0           | 0 / 1              |
| Reproduced traces                        | 240/240         | 232/240            |
| Replay cleanup failures                  | 0               | 7                  |
| Replay state/action/assertion divergence | 0               | 0                  |
| Other unreplayable traces                | 0               | 1                  |
| API requests                             | 0               | 1436               |
| Reported input + output tokens           | 0 + 0           | 2,297,009 + 69,018 |
| Budget-charged tokens                    | 0               | 2,384,555          |

Live run: **2026-09-17T05:08:28.777Z**; resolved model: **jev-1.13.0**.

Model-only recall: **99.2%** (119/120); precision: **100.0%**; healthy false alarms: **0/120**.

Recall among exercised faults: **100.0%**. Uncertain assessments: **301**. Assessment errors: **0**. Runs with model warnings before any fault was exercised: **0** (not credited as detections).

| Planted fault         | Exercised / cases | Model detections | Combined detections |
| --------------------- | ----------------- | ---------------- | ------------------- |
| charge-on-rejection   | 15/15             | 15/15            | 15/15               |
| duplicate-reservation | 15/15             | 15/15            | 15/15               |
| extra-charge          | 14/15             | 14/15            | 14/15               |
| missing-refund        | 15/15             | 15/15            | 15/15               |
| overbooking           | 15/15             | 15/15            | 15/15               |
| uncancelled-record    | 15/15             | 15/15            | 15/15               |
| wrong-price           | 15/15             | 15/15            | 15/15               |
| wrong-slot            | 15/15             | 15/15            | 15/15               |

Missed by the model: 1 cases; inspect the per-case actions, judgments, and failed assertions in [Jev results](results/jev.json).

- 1 unfinished case(s), reschedule: TypeSafe HTTP 503; no automatic retry was made. Example: `case-7919ea04f1e5cd23`.

Replay cleanup failures mean the browser did not close within the runner’s five-second cleanup allowance; they are retained as failed replays even when application states and assertions matched. These failures are separate from state divergence and detection misses. Parallel browser startup/shutdown on the evaluation host can affect this metric.

Source/runner digest: `8d3364a9baa41568b89958e052d4be3200da146fc9ac9be11d87fae9a9f08d14`. Environment: win32/x64, Node v24.3.0. Full local evidence: `artifacts/benchmarks-2026-09-17T05-08-28-678Z/reservations/jev`.

The reference route is an oracle/fixture sanity check with known action sequences, not an autonomous baseline. Jev receives multiple action choices and must select the route and fixture. Combined detection includes deterministic assertions; it must not be presented as model-only accuracy.

Faulty cases that abort or never exercise the mutation remain misses in end-to-end recall. Reproduction measures the exact observed trace, including incomplete prefixes, and does not establish that model judgments are correct. This is one deterministic, synthetic, parameterized run without statistical confidence intervals; it does not establish real-world bug recall.

**Reproduction:** `pnpm benchmark --app reservations --mode both --write-results`. Requires `TYPESAFE_API_KEY` for the Jev phase. Full runs overwrite only the generated results section and sanitized result JSON; partial pilot runs cannot overwrite published results.
<!-- evaluation:end -->

## Local improvement evaluation

Compared on corrected fixtures with pinned model `jev-1.13.0`. [Methods, changes, limitations, and spending](../../docs/improvements.md); [per-case comparison](results/improvements.json).

| Measurement                                  | Original policy | Candidate                |
| -------------------------------------------- | --------------- | ------------------------ |
| Full flows, variants 22?23: model detections | 8/8 faults      | 8/8 faults (v5)          |
| Same full flows: combined detections         | 8/8 faults      | 8/8 faults (v5)          |
| Full-flow healthy false alarms               | 0/8             | 0/8                      |
| Full traces completed and replayed           | 16/16           | 16/16                    |
| Fresh terminal assessment, variant 27        | 4/4 faults      | 4/4 faults (retained v6) |
| Fresh healthy false alarms                   | 0/4             | 0/4                      |
| Fresh healthy uncertain judgments            | 1/4             | 0/4                      |

The full-flow baseline reuses historical model answers after exact public-flow and replay equivalence checks; candidate answers and both fresh assessment arms use new API calls. The small-sample phase did not include another end-to-end run; the complete live rerun follows below. The fresh sample covers four fault types; it does not validate every planted type. These small parameterized comparisons do not establish real-world recall.

<!-- full-live-comparison:start -->

## Complete live rerun: all 240 flows

This is the final v6 policy running every flow live, including action selection and intermediate assessments, followed by replay. Model: `jev-1.13.0`; started 2026-09-17T10:08:57.409Z; finished 2026-09-17T10:25:47.329Z. [Per-case results](results/full-live-v6.json).

| Metric                                | Previous full live run | Current full live run |
| ------------------------------------- | ---------------------- | --------------------- |
| Flows evaluated                       | 240                    | 240                   |
| Model detections / planted faults     | 119/120                | 119/120               |
| Model recall                          | 99.2%                  | 99.2%                 |
| Model healthy false alarms            | 0/120                  | 0/120                 |
| Model precision                       | 100.0%                 | 100.0%                |
| Combined detections / planted faults  | 119/120                | 119/120               |
| Combined healthy false alarms         | 0/120                  | 0/120                 |
| Faults exercised                      | 119/120                | 119/120               |
| Healthy flows passed exact assertions | 120/120                | 120/120               |
| Unclassified healthy flows (model)    | 0                      | 0                     |
| Incomplete / infrastructure errors    | 0 / 1                  | 0 / 1                 |
| Replayed traces                       | 232/240                | 239/240               |
| Replay cleanup failures               | 7                      | 0                     |
| Assessment / verification errors      | 0                      | 0                     |

New model detections: 1; previous detections lost: 1. Of the new detections, 1 involve faults the previous run never exercised.

The earlier 240-flow historical result remains unchanged above. This comparison includes both generic policy improvements and the documented example corrections, so the entire difference cannot be attributed to the model policy alone. Unfinished healthy flows are unclassified, not true negatives. Combined detections include exact assertions. See the [complete 720-flow analysis](../../docs/full-live-comparison.md) for methodology, token cost, and limitations.

<!-- full-live-comparison:end -->
