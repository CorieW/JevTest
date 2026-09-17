# Rules

- Keep this a single root TypeScript package; do not add apps/packages workspaces or CorieW dependencies.
- Keep source under `src/`, tests under `test/`, configuration under `config/`, and extended documentation under `docs/`.
- Keep exact correctness assertions independent of discovered actions and model judgments.
- Keep abort, cancellation, and exhausted limits incomplete; never treat them as passes.
- Keep credentials and generated evidence out of version control.
- Add a brief top-level comment to non-generated code and configuration files that support comments.
- Run `pnpm verify` before handing off changes. Live API tests are opt-in and must use explicit budgets.
- Use Conventional Commits and conventional branch/PR names. Every PR description must include `## Changes` with concise bullets.
- Keep licensing marked pending and package publishing disabled until the rights holder adopts terms.
