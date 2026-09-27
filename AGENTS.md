## Vendored repositories (`repos/`)

This project vendors upstream source as committed git subtrees under `repos/`. They exist so agents can read real source instead of guessing from documentation.

- `repos/effect`: Effect and the `@effect/*` packages, pinned to `catalog.effect`.
- `repos/foldkit`: Foldkit and the `@foldkit/*` packages, pinned to `catalog.foldkit`. See `apps/folding-plane/FOLDKIT.md`.

Rules:

- Treat `repos/` as read-only reference material. Do not edit files under `repos/`.
- Never import from `repos/`. Application code imports from the installed packages (`effect`, `@effect/*`, `foldkit`, `@foldkit/*`).
- Prefer the vendored source, its tests, and its examples over generated guesses or web search results.
- When upgrading a package, re-pin its subtree to the matching release tag. See `repos/README.md`.

## Learning more about Effect

This repository uses Effect. Before writing any Effect code, read `repos/effect/LLMS.md` and then explore `repos/effect/` for structure, examples, tests, and API design. Treat the vendored source as the source of truth for idiomatic Effect usage.

- Whole-library guide and gotchas: `repos/effect/LLMS.md`
- Task-oriented docs: `repos/effect/ai-docs/src/` (grouped by topic: `01_effect`, `03_stream`, `04_integration`, `05_batching`, `06_schedule`, `07_datetime`, `08_observability`, `09_testing`, `10_predicate`, `40_sql`)
- Library source: `repos/effect/packages/effect/src/` and `repos/effect/packages/{platform,sql,ai,atom,opentelemetry}/src/`

The vendored source is pinned to `catalog.effect`, so it matches the package this project compiles against. For the exact installed type surface, the `.d.ts` files in `node_modules` remain authoritative.

## Frontend apps
We are trying to redesign and rewrite our frontend to foldkit, read it more about it here if needed
`./apps/folding-plane/` we keep our old frontend which is `control-plane` along side it