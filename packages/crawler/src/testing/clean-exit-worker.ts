/**
 * Test fixture: a worker that exits cleanly (code 0) immediately.
 *
 * Used by `Supervisor.test.ts` to cover the clean-exit drop path without
 * depending on exchange behavior.
 */
process.exit(0)
