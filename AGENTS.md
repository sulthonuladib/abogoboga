# AGENTS.md

# Agent workflow
- Subagents are allowed when they help. Keep them scoped to independent work and avoid concurrent writes to shared files (root `package.json`, `bun.lock`, `tsconfig.json`).

# Learning more about Effect
This repository uses Effect. Before writing any Effect code, fully read
`node_modules/effect/AGENTS.md` (including linked files), the relevant
`node_modules/@effect/*/AGENTS.md`, and consult `node_modules/effect/ai-docs/src` as needed.
