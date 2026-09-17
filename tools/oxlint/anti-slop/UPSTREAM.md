# Anti-slop vendored plugin — provenance

Source: local skill bundle `.agents/skills/install-anti-slop/assets/anti-slop`,
from skill `install-anti-slop` (`skills-lock.json`: source `dmmulroy/anti-slop`,
sourceType `github`, skillPath `skills/install-anti-slop/SKILL.md`,
computedHash `4031728fbe75bdcad6ee3208fd52b5d66e167b056fefee1fa9758e9a6cb9c0c8`).

Exact upstream rule revision: unknown. The bundle records no commit for the
anti-slop rules themselves (only the nested `vendor/eslint-stylistic/UPSTREAM.md`
pins its own upstream commit). Recorded as unknown rather than guessing; do not
treat the skills-lock hash or current upstream HEAD as the rule revision.
Recoverable pristine snapshot: re-run
`node .agents/skills/install-anti-slop/scripts/install.mjs "$stage/incoming"`
into a temp dir and diff against this tree.

Installed plugin paths:
- `tools/oxlint/anti-slop/index.ts` (generic plugin, name `anti-slop`)
- `tools/oxlint/anti-slop/effect/index.ts` (opt-in Effect plugin, name `anti-slop-effect`)

Intentional deviations from the skill's fresh-install template:
- Config is `.oxlintrc.json` (new file; repo had no oxlint config). Chose JSON
  over `oxlint.config.ts` because JSON configs work in all runtimes while
  JS/TS configs are experimental and require Node.
- `ignorePatterns` adds `src/crawl-workers/**` to preserve the repo's existing
  `bun run lint --ignore-pattern 'src/crawl-workers/**'` exclusion in config
  form. The CLI flag is left unchanged.
- Effect plugin enabled because `effect` is a direct dependency in
  `package.json` (`^4.0.0-rc.115`).
- `oxlint` `1.83.0` + `@oxlint/plugins` `1.83.0` pinned exactly as dev
  dependencies (repo had no prior `oxlint` dependency; versions from
  `npm view oxlint version` / `npm view @oxlint/plugins version`).
- Nested `vendor/eslint-stylistic/LICENSE` and `vendor/eslint-stylistic/UPSTREAM.md`
  preserved verbatim with the copy.

Verification at install: `bun run typecheck` passes; `bun run lint`
(exit 1) loads both plugins and reports ~1275 owned-source findings, left
unfixed (no cleanup authorized).
