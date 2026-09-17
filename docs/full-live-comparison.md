# Complete 720-flow live comparison

The retained v6 policy was run live on **all 720 flows** with `jev-1.13.0`, including navigation, intermediate assessments, terminal assessments, and evidence verification. Replay was attempted for every trace; 719 succeeded. The model caught **313/360 planted faults**, versus **245/360 previously**, with **0/360 healthy false alarms**, versus **28/360 previously**. Combined detection, including exact assertions, was **357/360**.

This replaces the earlier small-sample evidence as the most complete measurement of the retained candidate. It is one run of related synthetic workflows, not proof of optimal or real-world performance. Source changes remain local and uncommitted.

Final `pnpm verify` passed: 53 offline tests, secret scanning, formatting, lint, type checking, and the distributable build. All evaluated policy, runner, adapter, and fixture source files still match the frozen live-run snapshots.

## Full-run results

| Metric                                | Previous full live run | Current full live run |
| ------------------------------------- | ---------------------- | --------------------- |
| Flows evaluated                       | 720                    | 720                   |
| Model detections / planted faults     | 245/360                | 313/360               |
| Model recall                          | 68.1%                  | 86.9%                 |
| Model healthy false alarms            | 28/360                 | 0/360                 |
| Model precision                       | 89.7%                  | 100.0%                |
| Combined detections / planted faults  | 266/360                | 357/360               |
| Combined healthy false alarms         | 73/360                 | 0/360                 |
| Faults exercised                      | 266/360                | 357/360               |
| Healthy flows passed exact assertions | 262/360                | 360/360               |
| Unclassified healthy flows (model)    | 98                     | 0                     |
| Incomplete / infrastructure errors    | 100 / 2                | 0 / 1                 |
| Replayed traces                       | 711/720                | 719/720               |
| Replay cleanup failures               | 7                      | 0                     |
| Assessment / verification errors      | 1                      | 0                     |

| App          | Previous model detections | Current model detections | Previous healthy false alarms | Current healthy false alarms |
| ------------ | ------------------------- | ------------------------ | ----------------------------- | ---------------------------- |
| reservations | 119/120                   | 119/120                  | 0/120                         | 0/120                        |
| ledger       | 51/120                    | 92/120                   | 0/120                         | 0/120                        |
| taskboard    | 75/120                    | 102/120                  | 28/120                        | 0/120                        |

Unclassified healthy counts are recomputed from stored per-case completion and warning data for both runs. Historical JSON originally counted some incomplete healthy flows as true negatives; those original files remain unchanged. Recall retains every planted fault in its denominator, including cases that abort or fail to exercise the fault. A model warning is credited only after the planted mutation has been exercised.

## Comparability

There were 73 newly detected faults and five lost detections, a net gain of 68. **70 of the 73 new detections were faults the previous run never exercised.** Among the 263 faults exercised in both runs, model detections changed only from **242 to 243**. This indicates that improved fault exposure accounts for most of the gain; it does not establish a large improvement in assessment quality alone.

All 720 case IDs and planted-fault labels match the historical run. Both runs pin the same resolved model, use a five-step limit, and start from the same parameterized task matrix. The policy remained fixed for the entire new run; no failed cases were rerun to improve scores.

The examples changed between runs: misleading operation labels were corrected, equivalent valid routes now receive consistent fault injection and grading, and duplicate valid choices were replaced with distinct unrelated cards/tasks. These repairs affect navigation and combined false alarms. The measured difference is therefore for the complete revised system and benchmark, not a controlled estimate of policy-only improvement. The earlier paired comparisons against the original policy on corrected fixtures are retained in [the improvement report](improvements.md).

The current run uses two browser workers and a 15-second cleanup allowance; the historical run used three workers and a five-second cleanup allowance. Replay/infrastructure changes must be interpreted with those settings in mind. Replay confirms observed behavior and exact assertions, not model judgment correctness.

## Fault coverage

| App / planted fault                  | Current model detections | Combined detections | Exercised |
| ------------------------------------ | ------------------------ | ------------------- | --------- |
| reservations / charge-on-rejection   | 15/15                    | 15/15               | 15/15     |
| reservations / duplicate-reservation | 15/15                    | 15/15               | 15/15     |
| reservations / extra-charge          | 15/15                    | 15/15               | 15/15     |
| reservations / missing-refund        | 15/15                    | 15/15               | 15/15     |
| reservations / overbooking           | 15/15                    | 15/15               | 15/15     |
| reservations / uncancelled-record    | 15/15                    | 15/15               | 15/15     |
| reservations / wrong-price           | 14/15                    | 14/15               | 14/15     |
| reservations / wrong-slot            | 15/15                    | 15/15               | 15/15     |
| ledger / double-refund               | 15/15                    | 15/15               | 15/15     |
| ledger / duplicate-debit             | 2/15                     | 15/15               | 15/15     |
| ledger / freeze-all-cards            | 15/15                    | 15/15               | 15/15     |
| ledger / limit-bypass                | 15/15                    | 15/15               | 15/15     |
| ledger / rejection-fee               | 15/15                    | 15/15               | 15/15     |
| ledger / unmarked-refund             | 0/15                     | 15/15               | 15/15     |
| ledger / wrong-card                  | 15/15                    | 15/15               | 15/15     |
| ledger / wrong-recipient             | 15/15                    | 15/15               | 15/15     |
| taskboard / archive-other-task       | 15/15                    | 15/15               | 15/15     |
| taskboard / delete-instead           | 1/15                     | 15/15               | 15/15     |
| taskboard / denied-write             | 15/15                    | 15/15               | 15/15     |
| taskboard / duplicate-activity       | 11/15                    | 13/15               | 13/15     |
| taskboard / permission-bypass        | 15/15                    | 15/15               | 15/15     |
| taskboard / reset-priority           | 15/15                    | 15/15               | 15/15     |
| taskboard / stale-count              | 15/15                    | 15/15               | 15/15     |
| taskboard / wrong-assignee           | 15/15                    | 15/15               | 15/15     |

## Usage and evidence

The 47 model misses comprise 13 duplicate debits, 15 unmarked refunds, 14 deletion-instead-of-archival faults, four duplicate-activity faults, and one reservation case interrupted before fault exposure. Two of the duplicate-activity cases selected assignment instead of completion and never exercised their planted fault. The other two were exercised model misses. These wrong-route results failed their exact task assertions but are not credited as detections of an unexercised planted fault.

The reservation interruption was a Windows `EPERM` failure while renaming the durable token-ledger file (`case-76fed6331577eb6c`). Its incomplete trace could not replay. It remains an infrastructure error and a detection miss; no replacement run was substituted. This leaves 357/360 credited combined detections and 719/720 reproduced traces, despite all 360 healthy flows passing.

Started: 2026-09-17T10:08:57.409Z. Finished: 2026-09-17T10:25:47.329Z. Source snapshot digest: `d58063919c05caa474a048783f31ae96a2a3a858d37ce9f5d8a598132110302f`. Full local evidence: `artifacts/improvements/v6-full-720-2026-09-17T10-08-57-409Z`.

This run made **4,730 budget-admitted request attempts**, reporting 7,790,924 input and 353,766 output tokens. Conservative accounting charged **8,183,710 tokens**, including unknown-usage charges and a conservatively settled 25,328-token reservation stranded by the ledger-write failure. The original run record retains 8,158,382 charged tokens and that outstanding reservation; budget-settlement.json records the conservative final accounting without changing inference results. Earlier testing charged 9,955,531, bringing cumulative usage to **18,139,241 / 25,000,000 authorized tokens**. The user explicitly raised the cumulative cap before this run. Credentials were supplied only through the process environment; source/report secret scanning is part of final verification.

Sanitized per-case results and historical comparisons are in [reservations](../examples/reservations/results/full-live-v6.json), [ledger](../examples/ledger/results/full-live-v6.json), and [taskboard](../examples/taskboard/results/full-live-v6.json), with tables in each example README. Historical full-suite and smaller experimental result files are preserved. Raw traces, snapshots, and the durable spending ledger remain under ignored `artifacts/`.
