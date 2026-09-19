# Spec Delta

## Purpose

The SSR web UI is the human interface operators use daily: dashboard, coins, exchanges, chains, routes matrix, and detail drawers, all updating in place via HTMX without full page reloads.

## ADDED Requirements

### Requirement: Stable page and partial URLs

The system SHALL serve operator pages (`/dashboard`, `/coins`, `/exchanges`, `/chains`, `/coins/:id/routes`, detail pages, `/not-found`) as full HTML documents, and HTMX fragments under `/partials/*`, with stable and documented URL shapes and query parameters. Exact parity with the legacy frontend URLs is not required: the UI ships with the rewrite and may be reshaped, as long as page and fragment routes stay stable within a release.

#### Scenario: Fragment updates in place

- **WHEN** an HTMX client requests `/partials/coins?page=2` with an `HX-Request` header
- **THEN** the response is the table fragment only (no layout shell) with headers marking it as a fragment

### Requirement: Form and mutation behavior

Create, edit, and delete flows SHALL be HTMX-driven: validation errors re-render the form fragment with an error message; success closes the modal (out-of-band), refreshes the affected fragment, and emits a toast; entity-miss on a full load redirects (302) while an HTMX request receives an `HX-Redirect` to `/not-found`.

#### Scenario: Failed coin creation

- **WHEN** a coin is submitted without a symbol via HTMX
- **THEN** the modal slot re-renders the form with "symbol is required" and no row is created

### Requirement: Delete guards

Delete operations with dependents SHALL be refused with an explanatory inline error instead of deleting: exchanges or chains referenced by market assignments or chain links cannot be deleted until references are removed.

#### Scenario: Guarded exchange delete

- **WHEN** an operator deletes an exchange that still has market assignments
- **THEN** the UI shows how many assignments block the delete and the exchange remains
