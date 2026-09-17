# Pocket ledger

A synthetic wallet service with transfers, refunds, card controls, and per-transfer limits. Balances and transaction history are local fixture data; this code never handles real money or calls financial services.

**240 user flows:** four workflows × 30 fixture combinations × healthy/faulty versions. The 120 matched task pairs vary amounts, starting balances, recipient accounts, fees, payment IDs, and cards. Each flow navigates a dashboard, selects one of three requests, and confirms a mutation.

| Workflow                   | Healthy / faulty | Deliberate faults                   |
| -------------------------- | ---------------- | ----------------------------------- |
| Transfer                   | 30 / 30          | Wrong recipient; duplicate debit    |
| Refund                     | 30 / 30          | Unmarked refund; double refund      |
| Freeze card                | 30 / 30          | Wrong card frozen; all cards frozen |
| Reject over-limit transfer | 30 / 30          | Limit bypass; fee on rejection      |

Each fault appears in 15 cases. Correct limit rejection is a successful flow. The oracle checks exact balances, permitted fees, ledger cardinality, refund state, and unaffected cards.

- [app.ts](app.ts): wallet state and deliberately faulty mutation branches.
- [cases.ts](cases.ts): fixture matrix and evaluator-only labels.
- [oracle.ts](oracle.ts): independent arithmetic and integrity requirements.
- [results](results/): sanitized per-case scores and aggregate metrics.

Run manually: `pnpm benchmark:serve ledger`, then open `http://127.0.0.1:4320`. Run without API access: `pnpm benchmark --app ledger --mode reference`. The shared [benchmark host](../benchmarks/host.ts) handles isolated sessions and browser presentation; all domain logic lives here.

Jev receives public account state and task inputs, not the fault label or expected grader answer. Matched pairs have identical model-visible starting states. A private server journal records whether and when each defect was exercised.

## What this run revealed

Jev missed all 15 duplicate-debit defects after exercising them; the independent balance and ledger checks caught them. In the refund workflow, 59 of 60 runs selected a request, backed out of confirmation, and reached the five-step limit. The one exercised double refund was also missed by the model.

This benchmark also exposed a **route-sensitive grading limitation**. In 21 healthy limit cases, Jev chose the ordinary transfer route, which correctly rejected the over-limit amount. The oracle nevertheless failed those cases because it required the dedicated limit route. They remain counted as combined false alarms; they are not model warnings or evidence of application bugs. On faulty variants, taking that alternate route also bypasses the route-specific injected defect. Read the measured recall as performance on these exact routes and fixtures, not just on equivalent business outcomes. A future benchmark revision should remove that ambiguity and be evaluated separately.

<!-- evaluation:start -->

## Evaluation results

| Metric                                   | Reference route | Jev                |
| ---------------------------------------- | --------------- | ------------------ |
| Evaluated flows                          | 240             | 240                |
| Healthy flows passed                     | 120/120         | 69/120             |
| Faulty flows exercised                   | 120/120         | 67/120             |
| Combined detected / faulty flows         | 120/120         | 67/120             |
| Combined recall                          | 100.0%          | 55.8%              |
| Combined healthy false alarms            | 0               | 21                 |
| Combined precision                       | 100.0%          | 76.1%              |
| Incomplete / infrastructure errors       | 0 / 0           | 59 / 0             |
| Reproduced traces                        | 233/240         | 240/240            |
| Replay cleanup failures                  | 7               | 0                  |
| Replay state/action/assertion divergence | 0               | 0                  |
| Other unreplayable traces                | 0               | 0                  |
| API requests                             | 0               | 1676               |
| Reported input + output tokens           | 0 + 0           | 2,727,716 + 80,395 |
| Budget-charged tokens                    | 0               | 2,826,299          |

Live run: **2026-09-17T05:15:21.544Z**; resolved model: **jev-1.13.0**.

Model-only recall: **42.5%** (51/120); precision: **100.0%**; healthy false alarms: **0/120**.

Recall among exercised faults: **76.1%**. Uncertain assessments: **165**. Assessment errors: **1**. Runs with model warnings before any fault was exercised: **0** (not credited as detections).

| Planted fault    | Exercised / cases | Model detections | Combined detections |
| ---------------- | ----------------- | ---------------- | ------------------- |
| double-refund    | 1/15              | 0/15             | 1/15                |
| duplicate-debit  | 15/15             | 0/15             | 15/15               |
| freeze-all-cards | 15/15             | 15/15            | 15/15               |
| limit-bypass     | 4/15              | 4/15             | 4/15                |
| rejection-fee    | 2/15              | 2/15             | 2/15                |
| unmarked-refund  | 0/15              | 0/15             | 0/15                |
| wrong-card       | 15/15             | 15/15            | 15/15               |
| wrong-recipient  | 15/15             | 15/15            | 15/15               |

Missed by the model: 69 cases; inspect the per-case actions, judgments, and failed assertions in [Jev results](results/jev.json).

- 59 unfinished case(s), refund: Step limit reached. Example: `case-58c501172abeb196`.

Replay cleanup failures mean the browser did not close within the runner’s five-second cleanup allowance; they are retained as failed replays even when application states and assertions matched. These failures are separate from state divergence and detection misses. Parallel browser startup/shutdown on the evaluation host can affect this metric.

Source/runner digest: `9a07a5b0e7f6c21891bd7ae326c0a9960af34d26a7cf35295c7d2617590761d4`. Environment: win32/x64, Node v24.3.0. Full local evidence: `artifacts/benchmarks-2026-09-17T05-08-28-678Z/ledger/jev`.

The reference route is an oracle/fixture sanity check with known action sequences, not an autonomous baseline. Jev receives multiple action choices and must select the route and fixture. Combined detection includes deterministic assertions; it must not be presented as model-only accuracy.

Faulty cases that abort or never exercise the mutation remain misses in end-to-end recall. Reproduction measures the exact observed trace, including incomplete prefixes, and does not establish that model judgments are correct. This is one deterministic, synthetic, parameterized run without statistical confidence intervals; it does not establish real-world bug recall.

**Reproduction:** `pnpm benchmark --app ledger --mode both --write-results`. Requires `TYPESAFE_API_KEY` for the Jev phase. Full runs overwrite only the generated results section and sanitized result JSON; partial pilot runs cannot overwrite published results.
<!-- evaluation:end -->
