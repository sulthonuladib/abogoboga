# Spec Delta

## Purpose

Observability makes the system debuggable in production: structured logs with request and worker context, optional OTLP export, and log-level control, without requiring any external collector in development.

## ADDED Requirements

### Requirement: Structured environment-gated logging

Logs SHALL be structured lines carrying service, operation, and relevant domain context (exchange, shard, tick identifiers where applicable). Development SHALL log human-readable lines; production SHALL log one JSON object per line. Secrets SHALL never appear in logs, errors, traces, or snapshots.

#### Scenario: Production log format

- **WHEN** the service runs with `NODE_ENV=production`
- **THEN** each log entry is a single JSON line and no `Redacted` value renders its secret

### Requirement: OTLP export when configured

When a standard OTLP endpoint is configured, the system SHALL export logs, traces, and metrics to it; with no collector configured (or the SDK disabled) the system SHALL run normally with local logging only and no failed-export noise.

#### Scenario: No collector in development

- **WHEN** the service runs without OTLP environment configuration
- **THEN** startup succeeds, requests are served, and no export errors are logged

### Requirement: Traced operations with safe attributes

Inbound requests, worker lifecycle transitions, and tick-processing stages SHALL create tracing spans annotated with safe attributes (operation names, exchange slugs, shard ids, retry counts, typed error tags).

#### Scenario: Failed ingestion is diagnosable

- **WHEN** tick ingestion fails for a shard
- **THEN** the error log and span carry the exchange slug, shard id, and typed error tag sufficient to locate the failure without secrets
