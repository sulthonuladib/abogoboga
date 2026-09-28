/**
 * Bun worker fixture that dies immediately with a defect.
 *
 * Supervisor tests select a healthy fixture for its subsequent spawn to verify
 * that the RPC transport and supervisor can recover from the worker failure.
 */
throw new Error("fixture worker defect")
