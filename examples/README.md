# Example applications

The four evaluated applications below exercise JevTest with realistic forms, business rules, and deliberate faults. Each has independent correctness checks. Shared serving and evaluation code lives in [test/benchmarks](../test/benchmarks/). Each evaluated example keeps application code in `src/` and JevTest integration in `jevtest/`. Application source has no dependency on the evaluation code.

| Application                       | Flows | Workflows                                       | Results                                                 |
| --------------------------------- | ----- | ----------------------------------------------- | ------------------------------------------------------- |
| [Reservation desk](reservations/) | 240   | Reserve, cancel, reschedule, capacity rejection | [Evaluation](reservations/README.md#evaluation-results) |
| [Pocket ledger](ledger/)          | 240   | Transfer, refund, freeze, limit rejection       | [Evaluation](ledger/README.md#evaluation-results)       |
| [Team task board](taskboard/)     | 240   | Assign, complete, archive, permission denial    | [Evaluation](taskboard/README.md#evaluation-results)    |
| [Shop](shop/)                     | 12    | Checkout with prices, quantities, and discounts | [Evaluation](shop/README.md#evaluation-results)         |

Each larger application has four workflows, thirty input combinations, and matched healthy/faulty cases: **720 flows across 360 paired tasks**, covering 24 fault types. They use validated forms, domain services, persisted records, and duplicate/stale-request handling. See [application architecture](../docs/example-architecture.md).

## Evaluation results

[RepairWorks](repairworks/) is a separate, extensive repair-service application with deliberate minor and major defects. It has **not been integrated with or evaluated by JevTest** and is excluded from the benchmark commands and results below. Its README explains how to run it independently.

The complete 720-flow reference run on **2026-09-17** produced:

| Metric                                                | Result  |
| ----------------------------------------------------- | ------- |
| Healthy flows passed                                  | 360/360 |
| Planted faults exercised and detected by exact checks | 360/360 |
| Healthy false alarms                                  | 0       |
| Traces reproduced                                     | 720/720 |
| Incomplete / infrastructure errors                    | 0 / 0   |
| API requests / charged tokens                         | 0 / 0   |

The reference policy follows known routes. These results validate the applications, independent checks, and replay. **Live Jev accuracy has not been measured on the current larger applications.** Each application's README records its summary; the shop reports its separate twelve-flow evaluation.

## Run

Run from the repository root after installing dependencies and Chromium:

```sh
# All 720 flows, with no API calls.
pnpm benchmark --mode reference

# One application, or open its UI at http://127.0.0.1:4320.
pnpm benchmark --app ledger --mode reference
pnpm benchmark:serve ledger

# Small live pilot; set TYPESAFE_API_KEY in the process environment first.
pnpm benchmark --app taskboard --mode jev --limit 8 --max-tokens 100000

# Separate twelve-flow shop evaluation, with no API calls.
pnpm demo
```

Live evaluation uses an explicit token budget shared across the command's workers. The command defaults to at most 8,800,000 charged tokens and 6,000 requests; budgets do not carry across separate commands. A budget-limited run remains incomplete. Evaluation reads the process environment. Pass `--env-file .env.local` to load a file explicitly; existing process values take precedence.

## How scoring works

Jev sees public goals, inputs, controls, and observed records. Fault labels, reference routes, and oracle results are excluded from its decisions. Detection credit requires the fault to have been exercised. Model-only findings and combined findings, which include exact assertions, are scored separately; healthy-case warnings count as false alarms.

Every trace is replayed in a fresh session without model calls. Reports, traces, and usage go to ignored `artifacts/benchmarks-*` directories. The optional `--write-results` flag also generates local `examples/<app>/results/` files and refreshes README summaries; these results directories are ignored by Git. Reference paths take four to six actions; the runner allows twelve. These finite, parameterized examples measure performance on their defined tasks, not general bug recall across arbitrary software.
