# Example applications and evaluations

The benchmark mini-codebases are real loopback HTTP applications with isolated backend sessions and browser UIs. Each owns its state transitions, fixture matrix, and independent correctness oracle. They share only hosting, browser integration, replay, and evaluation infrastructure.

| Mini-codebase                     | User flows | Workflow families                               | Intentional faults        | Results                                             |
| --------------------------------- | ---------- | ----------------------------------------------- | ------------------------- | --------------------------------------------------- |
| [Reservation desk](reservations/) | 240        | Reserve, cancel, reschedule, capacity rejection | 8 types; 120 faulty cases | [README](reservations/README.md#evaluation-results) |
| [Pocket ledger](ledger/)          | 240        | Transfer, refund, freeze, limit rejection       | 8 types; 120 faulty cases | [README](ledger/README.md#evaluation-results)       |
| [Team task board](taskboard/)     | 240        | Assign, complete, archive, permission denial    | 8 types; 120 faulty cases | [README](taskboard/README.md#evaluation-results)    |
| [Original shop demo](shop/)       | 12         | Compact checkout demonstration                  | 6 faults                  | [README](shop/README.md#evaluation-results)         |

The three larger benchmarks define **720 flows**, covering 360 parameterized tasks in matched healthy/faulty pairs. They are hundreds of fixture-specific flows, not hundreds of fundamentally different workflows. The shop remains a small getting-started example.

## Historical full-suite results

One complete run at commit `783f5e2` on 2026-09-17 used `jev-1.13.0`, a five-step limit, and a 0.6 assessment-confidence threshold. Every application has 120 healthy and 120 faulty cases. These historical scores precede the local fixture repairs and policy changes.

| Mini-codebase | Model detections / planted faults | Combined detections / planted faults | Model healthy false alarms | Combined healthy false alarms |
| ------------- | --------------------------------- | ------------------------------------ | -------------------------- | ----------------------------- |
| Reservations  | 119/120 (99.2%)                   | 119/120 (99.2%)                      | 0/120                      | 0/120                         |
| Ledger        | 51/120 (42.5%)                    | 67/120 (55.8%)                       | 0/120                      | 21/120                        |
| Taskboard     | 75/120 (62.5%)                    | 80/120 (66.7%)                       | 28/120                     | 52/120                        |

These scores include navigation failures and API failures as missed faults. The ledger and taskboard READMEs explain a route-sensitive oracle limitation behind 44 combined false alarms: equivalent successful outcomes through alternate routes were rejected by the grader. This is a benchmark limitation, not evidence of 44 application bugs. Other findings include missed duplicate debits, missed deletion-versus-archival defects, refund navigation loops, and false model warnings on healthy task completion.

The known-route reference exercised all 360 planted faults and passed all 360 healthy cases. Reference replay reproduced 713/720 traces; live replay reproduced 711/720. Across both phases, 14 replay failures were browser-cleanup timeouts after states/assertions matched, and two live traces ended before an observable result after API errors. No replay state/action/assertion divergence was observed. Evaluation commands exited nonzero to retain these infrastructure failures; they are separate from the offline verification suite.

The full live evaluation attempted **4,427 API requests** and reported **7,450,402 input/output tokens**. Conservative budget accounting charged **7,507,562 tokens**, including reservations for requests with unknown usage. Including the 77,311-token pilot and earlier 73,143-token shop test, cumulative charged usage was **7,658,016 tokens**, below the authorized 10,000,000 maximum. No failed full-run case was retried to improve these scores.

## Run the evaluations

The [complete 720-flow live comparison](../docs/full-live-comparison.md) records the retained policy at **313/360 model detections and zero healthy false alarms**, versus **245/360 and 28 previously**. Combined detections rose from 266/360 to 357/360. Each example README includes both historical results and the full rerun. Most new detections involve faults previously unexercised; fixture repairs affect this comparison. With the user-authorized cumulative cap raised to 25,000,000, final conservative accounting totals **18,139,241 tokens**.

```sh
# No model API calls: verify the apps and oracles with known routes.
pnpm benchmark --mode reference --write-results

# Set TYPESAFE_API_KEY in the process environment first.
# Run all 720 cases with Jev, recording real usage and replaying every trace.
pnpm benchmark --mode jev --write-results

# One example, or a balanced eight-case pilot without replacing published results.
pnpm benchmark --app ledger --mode both --write-results
pnpm benchmark --app taskboard --mode jev --limit 8 --max-tokens 100000

# Refresh README tables from existing JSON without running any flows or API calls.
pnpm benchmark --render-only

# Inspect a mini-app manually at http://127.0.0.1:4320.
pnpm benchmark:serve reservations
```

Install Chromium with `pnpm browser:install` first. Live evaluation reads the process environment; it does not implicitly load an environment file or persist an API key. Never put a key on a committed command line. Running `--mode reference` or the offline test suite requires no key.

Each evaluation command shares one conservative token budget across its workers and applications: at most 8,800,000 budget-charged tokens and 6,000 attempted requests by default. Use smaller limits for pilots. These caps apply per command, not across separate invocations; account for earlier runs yourself. The eight-case development pilot used 77,311 tokens; one assessment was skipped by its 100,000-token admission guard. Its measured usage showed that the full 720-flow run needed more than the initially estimated 6,000,000-token allowance. The full-run cap plus the pilot and the earlier 73,143-token shop run remain below the user's original 10,000,000-token maximum. Partial pilot scores are excluded from the published full-suite metrics.

## How the measurement works

1. Each case has an opaque ID, a public goal, public fixture inputs, a private fault label, and a private reference route. Healthy/faulty pairs start with identical public state.
2. Jev chooses among four dashboard routes, three fixture requests, review/back actions, and the runner's abort option. Option order varies across fixtures. It never receives the fault label, reference route, private audit journal, or assertion results.
3. The server records the step at which the intended faulty mutation is actually exercised. A warning before that step cannot count as detecting that fault.
4. Separate oracles check business requirements using observed records and the public fixture. A pass still requires deterministic assertions; model judgments cannot mark completion.
5. Scoring distinguishes **model-only** findings from **combined** findings (model plus runner assertions). Healthy-case warnings are false alarms. Faulty cases without a credited finding—including aborted or unexposed cases—are misses in end-to-end recall.
6. Every observed trace is replayed in a fresh session without another model call. Incomplete prefixes may reproduce; this is reported separately from completion.

The reference policy follows known routes and always returns `uncertain` for semantic assessments. It verifies fault reachability and oracle coverage; it is **not** an autonomous competitor. The model-only confusion matrix uses one unit per flow, not per warning. `unexposedModelWarnings` reports premature warnings separately, including those on faulty fixtures. Precision is `TP/(TP+FP)`, recall is `TP/(TP+FN)`, and a zero denominator is reported as N/A.

## Evidence and limitations

Full JSON traces, HTML snapshots, replay records, graph exports, reports, and incremental `cases.jsonl` checkpoints go to ignored `artifacts/benchmarks-*` directories. Bulk benchmarks disable screenshots to reduce I/O and storage; the original shop demo still captures them.

`--write-results` publishes only sanitized fixture/result data under each example's `results/` and replaces its marked README results section. It rejects partial suites. The JSON includes per-case labels, chosen actions, classifications, confidence, failed assertions, replay outcomes, usage, environment, resolved models, and a digest of application and runner source. Labels become public in evaluation reports **after** model inference; they are not part of the model request.

These are finite synthetic apps with known requirements, four workflow families each, and one planted fault per faulty case. A single run on related fixtures is not a statistically independent sample of arbitrary software bugs. Strong combined results primarily validate the supplied assertions; model-only recall and false alarms must be read separately. Inspect misses and uncertainty before generalizing to a real application.

The development run pins `TYPESAFE_MODEL=jev-1.13.0`, the version resolved by the pilot. Set that environment variable when comparing against these results; leaving it unset uses the moving `jev-latest` alias. No model thresholds or prompts were tuned between the original pilot and complete run; later local experiments are documented separately.
