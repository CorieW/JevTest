# Project guide

## Scope and design

The project is named **JevTest**. Its selected primary domain is **JevTest.dev** (`jevtest.dev`). The package and CLI use `jevtest`; the default configuration file is `jevtest.config.ts`.

The [Notion specification](https://app.notion.com/p/3de9a6efcd588026a01fcc84e6941433) defines an exploratory testing tool, with a future hosted offering mentioned separately. This delivery implements a local CLI/library. It does not register domains, create a hosted dashboard, or publish a package.

The root package follows the template's separation of source, configuration, tests, documentation, and GitHub automation. Monorepo orchestration, application scaffolds, databases, authentication foundations, and CorieW dependencies are omitted.

```mermaid
flowchart LR
  F[Flow and fixture] --> R[Bounded runner]
  R --> O[Observed state and available actions]
  O --> J[Jev Choice]
  J --> A[Validated action]
  A --> P[Isolated Playwright session]
  P --> O
  P --> C[Deterministic assertions]
  O --> E[Evidence and replay trace]
  C --> E
```

The action graph records observed transitions. It is not the correctness specification: a missing checkout control is detected by an independent assertion even though discovery cannot offer it as an action.

## Integration contracts

`Flow` carries an ID, goal, starting URL, fixture data, and human-readable success criteria. The strings describe requirements to Jev; executable `check` assertions enforce them.

`Adapter.open(flow, runId)` returns one disposable `Session`. A session observes the application, executes one predefined typed action, evaluates checks, captures evidence, and closes. Non-browser applications can implement this interface directly. Custom session methods must stop their own outstanding work on close; a JavaScript promise cannot forcibly terminate arbitrary integration code.

`createBrowserAdapter` implements this contract with Chromium. It fixes viewport, locale, and timezone, blocks service workers and downloads, and restricts requests to the starting origin plus configured `allowedOrigins`. Add required CDN/API origins explicitly. New popup pages are closed; multi-tab flows require a custom adapter.

Use `setup(page, flow, runId)` to create isolated application data and establish authentication before navigation. Use `cleanup(flow, runId)` to remove only that run's fixture data. If data lives in an external service, namespace it with the run ID. Discovery resets frequently; its setup must be repeatable. Replay uses a fresh run ID but the same fixture values.

Use `ready(page)` to wait for a reliable application-specific condition after navigation and actions. The adapter does not assume `networkidle` means ready. A pending fetch can otherwise produce a premature snapshot. Assertions should query authoritative data through `check`; `readData` adds relevant application data to model context and state fingerprints.

`check` returns:

```ts
{
  complete: confirmationVisible,
  invariants: [{ name: 'No duplicate orders', passed: orderCount <= 1 }],
  assertions: [
    { name: 'Exactly one order', passed: orderCount === 1, actual: orderCount },
    { name: 'Correct total', passed: actualTotal === checkoutTotal },
  ],
}
```

Invariants run at every observed state. Success assertions are evaluated as pass/fail requirements only once `complete` is true; otherwise an unfinished checkout would be reported as a failure too early. Completion with no assertions is a configuration error. Exact assertions remain authoritative if a subsequent model assessment is unavailable.

## Actions and state

Supply `actions(page, flow)` for an explicit application model, or use DOM discovery. Discovery enumerates visible, enabled buttons, links, inputs, textareas, selects, and elements with `role=button`. It prefers test IDs and element IDs, with a structural CSS path fallback. Dynamic DOMs should use explicit stable selectors. Each execution requires a selector matching exactly one element.

Text and select inputs use **only** values supplied in `inputFixtures`, keyed by selector. Password/file/hidden inputs are not automatically offered. Checkbox and radio discovery offers the checked state; explicit actions can offer unchecked variants. Jev cannot invent values or execute code. Custom actions require a custom adapter.

Action IDs must be unique within a state and cannot be `__abort__`, which is reserved for the always-available abort option. The default browser action cap is 40. Discovery returns the first 40 sorted actions; explicit action spaces exceeding the limit are rejected.

Fingerprints include URL, up to 8,000 characters of visible text, form controls, application data, and available actions. Error/network history is excluded from the hash. Same-URL states with different cart data remain distinct. Large pages can collide at the semantic level if all differences fall outside captured data; use `readData` and explicit actions for important state. `normalize` can remove irrelevant timestamps or random IDs, but must retain business state needed to distinguish bugs.

## Jev judgments

The integration uses the documented [TypeSafe HTTP API](https://docs.typesafe.ai/api), [Choice primitive](https://docs.typesafe.ai/primitives/choice), and [bounded function selection pattern](https://docs.typesafe.ai/cookbooks/function_calling). The default model is `jev-latest`; pin `TYPESAFE_MODEL` when comparing runs over time.

Each action normally uses two requests: one selects among available action IDs plus abort; the other assesses the resulting observation as expected, unexpected, or uncertain. They cannot be batched because assessment depends on the executed action. Recent actions and full bounded observations are supplied as context. Probability distributions and confidence are validated before use.

The assessment confidence threshold defaults to 0.6 and is configurable. It is a starting policy, not a calibrated guarantee. Low confidence maps the effective judgment to uncertain while preserving the original distribution. Selection confidence is recorded but does not override deterministic action availability.

## API budgets

All parallel flows share a `TokenBudget`. Admission reserves `4 × UTF-8 request bytes + 4,096` tokens before a request starts. Successful responses replace that reservation with provider-reported input/output tokens. Failed or malformed responses keep the full charge because their usage is unknown. Payloads over 24,000 bytes are rejected before sending. Automatic retries are disabled, including for rate limits.

This is conservative accounting, **not a tokenizer proof or a server-enforced billing cap**: the API does not expose a hard per-request output-token limit. Actual usage can only be confirmed after the response. A response above its reservation stops further requests. In-flight requests may already have been admitted. Keep substantial headroom below any account spending ceiling. The live validation budget is 250,000 tokens, far below the user's 10,000,000-token limit.

`usage.requests` counts attempted requests, `inputTokens` and `outputTokens` are reported usage, `chargedTokens` includes unknown-usage reservations, and `reservedTokens` tracks active requests. Requests and flow operations have separate timeouts. API credentials are read from environment variables or supplied to `JevPolicy`; credentials are never serialized as configuration.

## Evidence and replay

Runs persist a versioned JSON trace with starting conditions, actions, snapshots, assertions, classifications, and relative evidence filenames. Reports include both model candidates and deterministic failures. State graphs export as JSON and Graphviz DOT. The self-contained HTML report escapes application content and requires no external scripts.

Replay opens a fresh fixture, verifies the initial fingerprint and checks, then executes the exact recorded action definitions. It checks before/after fingerprints and deterministic assertions at every step. A changed selector, input, state, or assertion produces divergence. Model classifications are not rerun, so replay confirms observed behavior, not the truth of a model's interpretation. Incomplete traces may reproduce their recorded prefix; they remain incomplete source runs.

The crawler uses breadth-first reset-and-replay traversal, with depth, state, edge, and wall-clock limits. It makes no model calls and does not certify requirements. Its graph is only the explored portion of the supplied action space. Discovery errors and limit reasons are returned explicitly.

## Data handling and operating constraints

Run against controlled test systems with permission to exercise their actions. Discovered clicks can submit forms and change application data. Use an explicit action space for destructive or privileged interfaces.

Artifacts can contain application data. The adapter masks input fields and `[data-sensitive]` screenshot regions, redacts TypeSafe-style keys and bearer tokens in JSON/text, and omits network headers and bodies. These measures are not general PII detection. Use synthetic fixtures, narrow `readData`, and a custom `normalize` or adapter for domain-specific redaction. Review evidence before sharing it. HTML snapshots omit script elements and input values but remain diagnostic snapshots, not a reconstructed live application.

The adapter currently targets one main document; it does not automatically model iframes, multi-tab workflows, uploads, drag/drop, arbitrary keyboard gestures, mobile emulation, or virtualized content beyond the observed DOM. These can be added through custom adapters or explicit integration code. Hosted infrastructure, automatic fixture generation, and a Shortest comparison are future work; the included benchmark compares Jev with a deterministic traversal baseline on a small controlled fixture.

## Development

The public repository is `CorieW/JevTest`. `main` is the default stable branch; `next` is the integration branch. Open feature, fix, and dependency-update PRs against `next`. Promote releases through a PR from this repository's `next` to `main`; `Verify` rejects other sources for `main`.

Both branches require a reviewed PR, fresh approval after changes, approval of the latest push, resolved review threads, code-owner approval, and an up-to-date successful `Verify` check from GitHub Actions. Deletion and force pushes are blocked. Administrators retain bypass access only through PRs, not direct pushes. The template requires code-owner review only on `main` and allows administrator bypass at all times; JevTest tightens these two settings for its public repository.

Public-repository safeguards include SHA-pinned CI actions, read-only workflow tokens, disabled workflow PR approval, maintainer approval for every external contributor's fork workflows, secret scanning/push protection, and private vulnerability reporting. CI never uses the live TypeSafe API key. `pnpm secrets:check` detects common key formats without printing matched values. Generated artifacts and local environment files are ignored.

`pnpm verify` runs formatting, lint, strict type checks, offline tests, and the distributable build. Chromium tests cover the real fixture shop. GitHub Actions installs Chromium and runs the same checks. Use Conventional Commits and a `## Changes` section in PR descriptions. Keep credentials and evidence out of commits. Licensing remains pending; do not publish until terms are adopted.
