/**
 * Test fixture: a worker that crashes (code 1) immediately.
 *
 * Used by `Supervisor.test.ts` to cover crash respawn and to assert that
 * stopping an exchange cancels pending respawns.
 */
process.exit(1)
