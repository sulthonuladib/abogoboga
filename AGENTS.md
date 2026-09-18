# AGENTS.md

# Agent workflow
- Never spawn subagents or i will kill you!

# Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

When writing Effect code, inspect node_modules/effect for examples of idiomatic usage, tests, module structure, and API design. Treat it as the source of truth for Effect patterns.

# Design principles
- Prefer correct-by-construction APIs, explicit dependencies, typed failures, and parsed boundary values.
- Keep domain and application code independent of frameworks, protocols, vendors, and runtime bindings.
- Prefer deep, cohesive modules and real test seams over pass-through abstractions, module mocks, and spies.
- Use code-shaped contracts, call stacks, and concrete evidence when design precision matters.
- Keep deliberate workflows user-invoked.

