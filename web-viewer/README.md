# JevTest web-viewer

React displays saved JevTest results through a local, read-only server. The web-viewer owns its UI, styles, routing, playback, server, build, and tests. The testing engine remains in `../src/`; the browser bundle contains no engine code.

```sh
pnpm web-viewer:serve --output artifacts/run
pnpm web-viewer:serve artifacts/first-run artifacts/second-run --port 4310
```

Open the printed loopback URL. Filtering, playback, exact checks, state changes, and diagnostics all operate on saved evidence. No model API key is needed. Stop the server with Ctrl+C.

Select **Action graph** to explore observed states using React Flow, with Dagre arranging directed paths, cycles, and parallel actions. Zoom, pan, search states, filter by recorded flow, and select a state to open its evidence. Suites larger than 50 runs initially show the first flow; choose **All recorded flows** for the full graph. You can also open a discovery directory containing only `graph.json`; its stopping reason and errors remain visible. Graphs show observed paths, not proof that every action has been explored or verified.

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
