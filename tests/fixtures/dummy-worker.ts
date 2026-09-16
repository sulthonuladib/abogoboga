// Alias: the canonical dummy worker lives in src for typechecking.
// Spawn this path; importing it executes the worker (top-level await).
export * from "../../src/core/crawler/tester-worker";
