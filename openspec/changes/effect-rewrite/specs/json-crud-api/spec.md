# Spec Delta

## Purpose

The JSON CRUD API is the machine interface for managing exchanges, cryptocurrencies, market assignments, chain links, and chains, replacing the current oRPC procedures with versioned HTTP endpoints and stable error codes.

## ADDED Requirements

### Requirement: Aggregate CRUD over HTTP

The system SHALL expose create, read, update, delete, and list operations for exchanges, cryptocurrencies, market assignments, chain links, and chains as HTTP endpoints with JSON request and response bodies.

#### Scenario: Full resource lifecycle

- **WHEN** a client creates an exchange, lists exchanges with a search filter, updates it, fetches it by id, and deletes it
- **THEN** each step returns 2xx with the resource representation, and fetching after delete returns 404 with a stable error code

### Requirement: Extended list filters and pagination

List operations SHALL support search text, page/limit pagination (including unlimited `limit=-1` where currently offered), sort field and direction, and the domain filters clients need (exchange, chain, coverage flag), returning a `data` array plus a `meta` object with `items`, `pages`, `page`, `limit`, `from`, `to`, `hasNextPage`, and `hasPreviousPage`.

#### Scenario: Filtered coin coverage query

- **WHEN** a client requests coin stats filtered by exchange with `flag=blocked`, `sortBy=blocked`, `order=desc`
- **THEN** the response contains only matching coins in the requested order with accurate `meta` counts

### Requirement: Stable error codes

Known failures SHALL be reported with stable machine-readable error codes and appropriate HTTP statuses: duplicate `cmcId`/`slug` conflicts as 409, missing resources as 404, invalid input as 422, and unexpected failures as 500 without leaking internals.

#### Scenario: Duplicate coin rejected

- **WHEN** a client creates a cryptocurrency with an already-used `cmcId`
- **THEN** the API returns 409 with the duplicate-resource error code and no partial row is persisted

### Requirement: OpenAPI documentation

The system SHALL serve an OpenAPI document describing every endpoint and a Scalar reference UI, generated from the same definitions that serve traffic.

#### Scenario: Docs reflect the API

- **WHEN** a client fetches `/openapi.json` and opens `/docs`
- **THEN** every CRUD endpoint from this capability is documented with its inputs, outputs, and error codes
