# AGENTS.md

# Learning more about Effect

This repository uses the Effect Typescript library.

Before writing any Effect code, first read `node_modules/effect/AGENTS.md`
**completely**, and follow the links in the file when required.

If you need to learn more about particular Effect apis and concepts that the
guide doesn't cover, search through the source code in `node_modules/effect/src`.

# Design principles
- Prefer correct-by-construction APIs, explicit dependencies, typed failures, and parsed boundary values.
- Keep domain and application code independent of frameworks, protocols, vendors, and runtime bindings.
- Prefer deep, cohesive modules and real test seams over pass-through abstractions, module mocks, and spies.
- Use code-shaped contracts, call stacks, and concrete evidence when design precision matters.
- Keep deliberate workflows user-invoked.

