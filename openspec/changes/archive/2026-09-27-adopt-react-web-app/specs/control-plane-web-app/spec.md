# Spec Delta

## Purpose

Defines the browser control plane served by the control-plane process: a single-page application mounted at the site root that consumes the JSON API and replaces the previous server-rendered pages.

## ADDED Requirements

### Requirement: Single-page application served at the site root

The control-plane process SHALL serve the compiled browser application for the site root and SHALL serve its static assets (scripts, styles, fonts, icons) under the same origin. The application SHALL be usable without a server-side render step.

#### Scenario: Root serves the application shell

- **WHEN** a browser requests `/`
- **THEN** the response is the application HTML shell and the referenced assets load from the same origin

#### Scenario: Static assets are cacheable

- **WHEN** a browser requests a built script, style, font, or icon asset
- **THEN** the response is served with a content type matching the asset and a long-lived cache directive for content-hashed files

#### Scenario: Missing asset is a not-found

- **WHEN** a browser requests an asset path that does not exist
- **THEN** the response is a not-found status rather than the application shell

### Requirement: Client-side routing with deep links

The application SHALL resolve its own routes in the browser, and the server SHALL return the application shell for unknown client routes that are not API or asset paths, so that deep links and reloads work.

#### Scenario: Deep link reloads into the application

- **WHEN** a browser requests a client route directly (or reloads on it)
- **THEN** the response is the application shell and the client renders the matching view

#### Scenario: Unknown client route renders a not-found view

- **WHEN** a browser navigates to a client route with no matching view
- **THEN** the application renders its not-found view without a server error

### Requirement: JSON API remains the sole data source

The application SHALL read and write control-plane data only through the JSON API served under `/api/*`, and that API SHALL remain available to non-browser clients.

#### Scenario: Application calls the JSON API

- **WHEN** the application loads a listing
- **THEN** it issues a request to an `/api/*` endpoint and renders the returned JSON

#### Scenario: API paths are not shadowed by the application

- **WHEN** a client requests an `/api/*` path
- **THEN** the response is the API response, never the application shell

### Requirement: Server-rendered pages are retired after parity

The control-plane process SHALL stop serving the previous server-rendered fragment and page routes once the application covers them. Requests for retired routes SHALL NOT return server-rendered HTML.

#### Scenario: Retired page route is gone

- **WHEN** a browser requests a previously server-rendered page or fragment route
- **THEN** the response is not the old server-rendered page, and the application's client route (if any) is served instead

#### Scenario: API behavior is preserved

- **WHEN** the server-rendered pages are removed
- **THEN** every `/api/*` endpoint continues to respond as before

### Requirement: Development and production serving stay equivalent

In development the application SHALL be served with hot reload from the tooling dev server while the JSON API is proxied to the control-plane process; in production the compiled output SHALL be served by the control-plane process itself. Both modes SHALL resolve the same API paths.

#### Scenario: Development proxies the API

- **WHEN** the application runs under the development server and calls an `/api/*` path
- **THEN** the request reaches the control-plane process and the response is returned to the client

#### Scenario: Production serves the compiled output

- **WHEN** the control-plane process runs without the development server
- **THEN** it serves the compiled application from its build output directory