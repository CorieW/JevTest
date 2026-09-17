# Local improvement experiments

**Follow-up:** the user authorized a higher budget and a complete 720-flow live rerun. It caught **313/360 faults with zero healthy false alarms**, versus **245/360 and 28 false alarms** in the historical run. See the [full comparison](full-live-comparison.md), including the substantial effect of improved fault exposure. The smaller experiments below are preserved as development history.

The retained candidate adds requirement-by-requirement assessment, structured state differences, and a second evidence check before reporting a strong model finding. A fresh terminal-assessment comparison found **11/12 faults versus the original policy's 10/12**, with **0/12 healthy false alarms for both**. The earlier full-flow candidate matched the baseline at **20/24 model detections**, with no healthy false alarms. These are small synthetic samples, not evidence of optimal or universal bug detection.

All changes remain local and uncommitted. Historical 720-flow results remain unchanged in the example READMEs and their original JSON files.

## What changed

- Assess public requirements separately, up to eight question groups per request. One observed violation cannot be averaged away by unrelated passing requirements.
- Supply generic before/after differences: numeric deltas, record additions/removals, and retained record order. Unique observed `id`, `key`, or `name` fields associate records; ambiguous arrays retain their complete values. Full observed data remains available alongside the differences.
- Verify candidate findings using another request that does not receive the first answers. Review uncertain requirements when no actions remain. Disagreement or unavailable verification stays uncertain.
- Preserve a confident initial finding when the verifier also chooses `unexpected` with at least 50% probability. Requiring both answers to independently clear 0.6 confidence suppressed a real double-refund finding. Two weak answers are still insufficient. Both answers remain in the trace; they come from the same model and are not statistically independent.
- Improve discovered control labels using accessible names and associated labels. Record action labels and before/after state identities in selection history. Retain the original selection prompt after alternatives regressed navigation.
- Retry transient inference HTTP failures once with shared budget accounting; never retry browser mutations. Give cleanup a configurable 15-second allowance and share concurrent close requests.
- Count unfinished healthy flows as unclassified rather than true negatives. Preserve assessment and verification errors in evaluation summaries. Scan untracked source files for secrets without requiring staging.

The runtime contains no example names, planted-fault labels, reference routes, private expected values, or example imports. For example, a balance change of `-40` is presented as an observed delta; Jev must compare it with the public requirement to decide whether it is wrong. Exact application assertions remain separate and authoritative.

## Benchmark corrections

Some original examples had misleading shared action labels and route-sensitive grading. The corrected fixtures describe each operation accurately, accept equivalent routes, and inject the same applicable fault through either route. A third distinct card/task replaces duplicate valid choices that could bypass fault injection. Checks still protect all unrelated records. Offline tests exercise all 720 corrected cases and both equivalent routes.

Both policies used the corrected fixtures for comparisons below. Improvements relative to the historical full run therefore mix fixture repairs with runtime changes; the historical score must not be used to claim a runtime accuracy gain.

## Paired measurements

All live requests pinned `jev-1.13.0`. Variants 0 and 1 were used for development, 22 and 23 for the frozen full-flow comparison, and 27 for fresh confirmation of the final assessment change. These are different parameter combinations from the same workflow families, not unseen bug categories.

| Experiment                                   | Original policy | Candidate                  | Healthy false alarms |
| -------------------------------------------- | --------------- | -------------------------- | -------------------- |
| Full flows, variants 22–23, model only       | 20/24 faults    | 20/24 faults (v5)          | 0/24 each            |
| Same full flows, model plus exact assertions | 24/24 faults    | 24/24 faults (v5)          | 0/24 each            |
| Frozen terminal transitions, variant 27      | 10/12 faults    | 11/12 faults (retained v6) | 0/12 each            |

All 48 full-flow traces completed and replayed for each policy. All 24 fresh reference traces completed and replayed before terminal assessment. At this stage, the final v6 change had not received a full 720-flow live run; that subsequent run is documented separately above. Terminal assessment cannot measure navigation, intermediate false alarms, or end-to-end reliability.

The reservation baseline for variants 22–23 reused historical model judgments only after verifying identical public flows and replaying every action, state fingerprint, and assertion against the current fixture. Ledger and taskboard baselines were fresh live runs. Candidate v5 used 543,621 charged tokens for all 48 flows; the 32 fresh baseline flows used 335,896, and reservation reuse cost zero new tokens. These unequal paid scopes are not a valid whole-suite cost ratio.

The fresh assessment comparison used 73,438 tokens for v6 and 47,163 for the baseline: approximately **56% more tokens for one additional detection**. Its sole candidate miss was a duplicate debit. One healthy ledger assessment was uncertain, so zero false alarms does not mean every healthy case received a confident `expected` answer. Baseline assessment stopped after 23 cases when its conservative next-request reservation exceeded that run's allowance. The remaining case was evaluated once in a separately budgeted continuation and included in the paired results.

Per-case sanitized comparisons are in each example's `results/improvements.json`; raw evidence and frozen source snapshots remain ignored under `artifacts/improvements/`. The fresh baseline summary is reconstructed from the saved 23-case checkpoints plus that single-case continuation. Source digests identify actual experiment snapshots, not the later formatting/documentation changes.

## Rejected changes and remaining limits

Early requirement assessment improved development recall but produced two healthy taskboard warnings. A revised selector and an extra navigation reconsideration request reduced fault exposure, so both were removed. Restoring the original selector restored exposure. Evidence verification removed those observed false alarms, but requiring a second independently confident answer also removed a true finding; v6 corrects that overly strict rule.

The v5 full-flow misses were duplicate debit, double refund, unmarked refund, and deletion instead of archival. Exact assertions caught all four. V6's fresh sample includes double refund but does not include every missed fault type. Do not infer that the others are fixed. Broader unseen applications, realistic long flows, repeated runs, and calibration across more healthy controls are needed to establish a general improvement. More aggressive prompting or lower finding thresholds were not retained merely to increase recall.

## Spending and reproduction

`pnpm verify` passed with 53 offline tests, including exhaustive fixture/oracle checks for all 720 cases, real Chromium integration, retry accounting, verification disagreements, history isolation, and concurrent cleanup. Secret scanning, formatting, lint, type checking, and the distributable build also passed. This confirms implementation contracts; it does not replace the live model measurements above.

Previous testing charged 7,658,016 tokens. This initial improvement campaign charged **2,297,515**, bringing cumulative usage to **9,955,531 / 10,000,000**. Paid iteration stopped at that ceiling. The user subsequently raised the cumulative cap to **25,000,000** for the full live rerun; final cumulative accounting is **18,139,241 tokens**, including conservative settlement of a stranded reservation. The durable experiment ledger reserves before each request, includes retries and verification, and prevents parallel processes from spending against the same allowance. Credentials were supplied only through the process environment.

The experiment script supports full flows, terminal assessment, reference routes, and verified reuse. A new paid campaign requires its own explicitly budgeted ledger; do not reset the existing ledger to evade the original ceiling. For example, an offline reference check makes no API requests:

```powershell
pnpm exec tsx scripts/evaluate-improvements.ts --mode reference --variants '0,1' --label reference-check
```

To compare policies, preserve their source modules and pass `--policy-module` and, when needed, `--runner-module`. Use the same fixtures and model, separate development/validation variants, and inspect exposure, false alarms, incompleteness, replay, and token cost together. `--case` can finish an interrupted assessment without repeating completed paid calls. API budgets are conservative client accounting, not a provider-enforced billing cap.
