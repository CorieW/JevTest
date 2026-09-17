# Controlled shop benchmark

`pnpm demo` runs 12 flows using deterministic traversal. `pnpm demo:live` runs them with Jev and reads `.env.local`. Both commands start an ephemeral loopback server, close it afterward, replay every run, and write metrics and an HTML report under `artifacts/`.

The six healthy flows cover different quantities, prices, and discounts. The six planted faults are an incorrect total, duplicate order, missing checkout control, wrong cart count, payment HTTP 500, and ignored discount. Orders live in each page's own memory, so parallel runs do not share data.

Metrics distinguish exact assertion failures from model candidates. The demo exits nonzero on missed bugs, healthy-flow false alarms, incomplete healthy flows, infrastructure errors, or replay drift. A planted assertion failure is an expected benchmark outcome.

For CLI/manual exploration, keep the server running in a separate terminal:

```sh
pnpm exec tsx examples/shop/serve.ts
```

Then run:

```sh
pnpm dev run --config examples/shop/config.ts --policy baseline
pnpm dev discover --config examples/shop/config.ts --flow single-item
pnpm dev replay --config examples/shop/config.ts --trace artifacts/run/RUN_ID/trace.json
```

The fixture server defaults to `http://127.0.0.1:4317`. Set `SHOP_URL` to match a different server. Replay requires the original fixture URL to remain available; ephemeral demo runs perform replay before shutting down.

This is a plumbing/regression benchmark with a small constrained action space, not an estimate of performance on arbitrary websites. Broader validation should include branching flows, ambiguous actions, noisy state, and bugs without prewritten assertions.

## Evaluation results

The initial development run on 2026-09-17 evaluated all 12 flows. These historical measurements predate the larger [720-flow benchmark suite](../README.md).

| Metric                                       | Reference traversal | Live Jev       |
| -------------------------------------------- | ------------------- | -------------- |
| Healthy flows passed                         | 6/6                 | 6/6            |
| Planted bugs detected by the combined system | 6/6                 | 6/6            |
| Healthy false alarms                         | 0                   | 0              |
| Traces reproduced                            | 12/12               | 12/12          |
| Bugs independently flagged by the model      | N/A                 | 5/6            |
| API requests                                 | 0                   | 64             |
| Input + output tokens                        | 0                   | 70,807 + 2,336 |

Total live usage was **73,143 tokens**. The requested model was `jev-latest`; the pilot did not capture its resolved version. Source evidence and limitations are recorded in [validation notes](../../docs/validation.md). Combined detection includes exact assertions and is not model-only recall.
