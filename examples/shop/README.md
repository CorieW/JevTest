# Controlled shop benchmark

`pnpm demo` runs 12 flows using deterministic traversal. `pnpm demo:live` runs them with Jev and reads `.env.local`. Both commands start an ephemeral loopback server, close it afterward, replay every run, and write metrics and an HTML report under `artifacts/`.

The six healthy flows cover different quantities, prices, and discounts. The six planted faults are an incorrect total, duplicate order, missing checkout control, wrong cart count, payment HTTP 500, and ignored discount. Orders live in each page's own memory, so parallel runs do not share data.

Metrics distinguish exact assertion failures from model candidates. The demo exits nonzero on missed bugs, healthy-flow false alarms, incomplete healthy flows, infrastructure errors, or replay drift. A planted assertion failure is an expected benchmark outcome.

For CLI/manual exploration, keep the server running in a separate terminal:

```sh
pnpm exec tsx examples/shop/src/serve.ts
```

Then run:

```sh
pnpm dev run --config examples/shop/jevtest/config.ts --policy baseline
pnpm dev discover --config examples/shop/jevtest/config.ts --flow single-item
pnpm dev replay --config examples/shop/jevtest/config.ts --trace artifacts/run/RUN_ID/trace.json
```

The fixture server defaults to `http://127.0.0.1:4317`. Set `SHOP_URL` to match a different server. Replay requires the original fixture URL to remain available; ephemeral demo runs perform replay before shutting down.

This compact benchmark checks browser execution, assertions, and replay within a constrained checkout flow. Its scores do not estimate performance on arbitrary websites.

## Code layout

- [src/server.ts](src/server.ts) and [src/serve.ts](src/serve.ts): the shop application and standalone server.
- [jevtest/config.ts](jevtest/config.ts): CLI configuration.
- [jevtest/project.ts](jevtest/project.ts): flows, browser adapter, and independent assertions.
- [jevtest/run.ts](jevtest/run.ts): evaluation and replay entry point used by `pnpm demo`.

## Evaluation results

The current baseline run on **2026-09-17** evaluated all twelve flows:

| Metric                                  | Result |
| --------------------------------------- | ------ |
| Healthy flows passed                    | 6/6    |
| Planted faults detected by exact checks | 6/6    |
| Healthy false alarms                    | 0      |
| Traces reproduced                       | 12/12  |
| API requests / charged tokens           | 0 / 0  |

This deterministic run validates the shop and replay; it does not measure live Jev accuracy. Running `pnpm demo` produces per-flow outcomes in `metrics.json` and a browsable `report.html` under `artifacts/baseline-*`.
