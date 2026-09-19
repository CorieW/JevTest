# JevTest web-viewer

React displays saved JevTest results through a local, read-only server. The web-viewer owns its UI, styles, routing, playback, server, build, and tests. The testing engine remains in `../src/`; the browser bundle contains no engine code.

```sh
pnpm web-viewer:serve --output artifacts/run
pnpm web-viewer:serve artifacts/first-run artifacts/second-run --port 4310
```

Open the printed loopback URL. **Action graph** is the first and default tab; **Recorded flows** opens the run list. Filtering, playback, exact checks, state changes, and diagnostics all operate on saved evidence. No model API key is needed. Stop the server with Ctrl+C.

Inside a flow, **Recorded action path** shows an ordered screenshot strip. Select a frame or use the slider to inspect that step, then use **Play timelapse** to advance at 0.5×–4× speed. Playback uses fixed intervals between captures, preserves repeated visits, and pauses when you select a frame. Snapshot-only and missing captures are labelled rather than replaced with another step's image. The full-size evidence panel and exact checks stay synchronized with the selected frame.

Select **Action graph** to explore the application action space using React Flow and Dagre. A report's `action-space.json` supplies independently discovered branches; recorded traces add observed states and transitions. **Show flow coverage** is on by default: green states and actions have recorded flow visits, dashed ones have none, and labels count distinct flows. Click a state or action to see its flows and open their evidence. Repeated visits and reruns of the same flow count once; discovery alone does not count as flow coverage. Coverage totals describe the known map, not unknown paths or correctness. Turning coverage off removes these overlays without changing the map or its layout.

Individual flow pages embed the same map, dim other branches, and number their traversed edges. Repeated transitions show multiple step numbers. The current timelapse step is highlighted; selecting a visited state or transition opens its frame.

Run `pnpm dev discover --config jevtest/config.ts --output artifacts/run` to explore every configured entry context and save the map beside the reports. Discovery ignores flow completion checks. It is bounded by depth, states, transitions, and time; the viewer displays known untried actions, entry-context counts, and stopping reasons. Completeness only covers the configured adapter actions and inputs. Without `action-space.json`, the map is explicitly labelled as partial recorded evidence. States are matched by exact fingerprints, never guessed from similar text or URLs. A discovery-only directory containing `graph.json` is also supported.

| Path                                    | Responsibility                                                |
| --------------------------------------- | ------------------------------------------------------------- |
| `client/App.tsx`, `client/main.tsx`     | Application shell and React entry point                       |
| `client/features/suites/`               | Suite overview, filters, and pagination                       |
| `client/features/runs/`                 | Recorded steps, captured evidence, and inspection panels      |
| `client/features/graph/`                | Graph layout, action edges, and interactive state inspection  |
| `client/components/`                    | Reusable status and comparison components                     |
| `client/lib/`                           | Hash routing and display formatting                           |
| `server/http.ts`                        | Loopback HTTP routes and server lifecycle                     |
| `server/graph.ts`                       | Observed graph references and standalone discovery validation |
| `server/suites.ts`, `server/schema.ts`  | Report validation, redaction, and response data               |
| `server/evidence.ts`, `server/paths.ts` | Allowlisted evidence and filesystem boundaries                |
| `server/command.ts`, `cli.ts`           | Command startup and shutdown                                  |
| `shared/types.ts`                       | Data contracts shared by the client and server                |
| `build.mjs`                             | Browser and server bundles in `../dist/web-viewer/`           |
| `test/`                                 | HTTP and Chromium integration checks                          |

Run `pnpm web-viewer:build` after web-viewer edits, or restart `pnpm web-viewer:serve`, which rebuilds first. `pnpm web-viewer:test` builds the web-viewer and runs its tests. `pnpm build:core` and `pnpm test:core` work on the testing engine independently; `pnpm verify` checks both parts.

The main `jevtest view` command delegates to the built web-viewer command. Client features use shared components and display helpers; the client communicates with the server through the report API. The server reads JevTest report files and uses shared redaction and state-difference helpers. Its browser-facing types import engine contracts only as TypeScript types. The build rejects runtime engine or server imports in the React bundle.
