# Vendored Repositories

Upstream source vendored into this repository with [`git subtree`](https://effect.website/blog/the-one-weird-git-trick-that-makes-coding-agents-more-effect-ive/). They give coding agents real, local source to read instead of making them guess from docs or re-fetch the same snippets over and over.

Both directories are **read-only reference material**:

- Never edit files under `repos/`. Change application code instead.
- Never import from `repos/`. Application code imports from the installed packages (`effect`, `@effect/*`, `foldkit`, `@foldkit/*`).
- Read the installed `.d.ts` in `node_modules` when you need the exact type surface; read `repos/` when you need structure, examples, and intent.

Because these are subtrees (not submodules), they are committed with this repository: a plain `git clone` gets them, no `git submodule update` required.

## Effect

- Path: `repos/effect`
- Source: <https://github.com/Effect-TS/effect>
- Tag: `effect@4.0.0`
- Matches `catalog.effect` in the root `package.json`.

Layout:

- `repos/effect/LLMS.md`: read this before writing any Effect code.
- `repos/effect/ai-docs/src/`: task-oriented docs grouped by topic (`01_effect`, `03_stream`, `04_integration`, `05_batching`, `06_schedule`, `07_datetime`, `08_observability`, `09_testing`, `10_predicate`, `40_sql`).
- `repos/effect/packages/effect/src/`: the effect package source.
- `repos/effect/packages/{platform,sql,ai,atom,opentelemetry}/src/`: the `@effect/*` package sources.

### Updating

Bump the version in the `catalog` in the root `package.json`, run `bun install`, then re-pin the subtree to the tag for that version. Do not vendor `main`: a tag makes the references match the package the project actually compiles against.

Set the version from the catalog so there is nothing to edit by hand:

```sh
EFFECT_VERSION=$(bun -p "require('./package.json').catalog.effect")

git subtree pull --prefix=repos/effect https://github.com/Effect-TS/effect.git \
  "effect@$EFFECT_VERSION" --squash
```

To add it to a fresh clone or a project that does not have it yet:

```sh
EFFECT_VERSION=$(bun -p "require('./package.json').catalog.effect")

git subtree add --prefix=repos/effect https://github.com/Effect-TS/effect.git \
  "effect@$EFFECT_VERSION" --squash
```

If a version has no tag, pin to the full commit hash instead.

## Foldkit

- Path: `repos/foldkit`
- Source: <https://github.com/foldkit/foldkit>
- Tag: `foldkit@0.164.0`
- Matches `catalog.foldkit` in the root `package.json`.

Foldkit vendors itself the same way and documents the layout, conventions, and read-from-it rules in `apps/folding-plane/FOLDKIT.md`. Treat that file as the source of truth for how to use this subtree. The short version: `repos/foldkit/packages/foldkit/src/` is the framework source, `repos/foldkit/examples/` holds runnable examples, and `repos/foldkit/AGENTS.md` carries the project conventions.

### Updating

```sh
FOLDKIT_VERSION=$(bun -p "require('./package.json').catalog.foldkit")

git subtree pull --prefix=repos/foldkit https://github.com/foldkit/foldkit.git \
  "foldkit@$FOLDKIT_VERSION" --squash
```

To add it to a fresh clone:

```sh
FOLDKIT_VERSION=$(bun -p "require('./package.json').catalog.foldkit")

git subtree add --prefix=repos/foldkit https://github.com/foldkit/foldkit.git \
  "foldkit@$FOLDKIT_VERSION" --squash
```

For a canary install the version names its source commit (`x.y.z-canary.<commit>`); pin to that full hash instead of a tag.