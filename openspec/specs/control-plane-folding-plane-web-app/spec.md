# control-plane-folding-plane-web-app Specification

## Purpose

Defines the second browser control plane: a server-rendered application served
by its own server, which reads the same control-plane JSON API as the existing
single-page application and covers browsing and editing coins, exchanges,
chains, markets, chain links, and crawler workers.


## Requirements

### Requirement: Served by a server of its own

The application SHALL be served by a server dedicated to it, distinct from the
control-plane process, and SHALL NOT add any endpoint to the control-plane
process. Both browser applications SHALL be reachable at the same time.

#### Scenario: Control-plane endpoint surface is unchanged

- **WHEN** the control-plane process starts with this application present
- **THEN** its routes are the JSON API routes and the static routes of the existing application, and no route belongs to the new application

#### Scenario: Both applications answer at once

- **WHEN** both servers are running
- **THEN** a request to the existing application's server returns that application, and a request to the new application's server returns a rendered page

### Requirement: Pages are server-rendered and hydrated in place

A request for any page of the application SHALL return HTML containing that
page's data, and the browser SHALL take over that HTML without discarding it.
The first view after hydration SHALL be the view the server rendered.

#### Scenario: Deep link arrives with its data

- **WHEN** a browser requests a page directly, or reloads on it
- **THEN** the response is that page's HTML with its data already in it, not an empty shell and not a client-side redirect

#### Scenario: Hydration does not re-read the first window

- **WHEN** the browser finishes hydrating a page the server rendered
- **THEN** it has not issued a read for the data that page was rendered with, and the rendered table is unchanged

#### Scenario: Unknown path renders the not-found page

- **WHEN** a browser requests a path that matches no page
- **THEN** the response is a not-found page with a route back into the application, and no server error

### Requirement: Control-plane data is read over HTTP from one origin

The application SHALL read and write control-plane data only through the JSON
API. A browser's requests to that API SHALL reach the control-plane process, and
the application's own server SHALL NOT intercept them with a page.

#### Scenario: A listing read reaches the API

- **WHEN** a page loads a listing
- **THEN** a request reaches a JSON API listing endpoint and the response is rendered

#### Scenario: API paths are not shadowed by pages

- **WHEN** a browser requests an API path on the application's origin
- **THEN** the response is the API's response, never a rendered page

#### Scenario: A response that does not match its schema is reported

- **WHEN** the API answers a request with a body the application cannot read
- **THEN** the page shows what went wrong in the words the API gave, offers a retry, and the application keeps running

### Requirement: The URL carries the listing state

Search text, sort column, sort direction, and page number SHALL live in the
page's URL, and the rendered table SHALL match the URL. A change to any of them
SHALL be a navigation.

#### Scenario: A filtered listing is shareable

- **WHEN** an operator filters a listing, sorts it, and moves to another page
- **THEN** the URL carries all three, and requesting that URL renders the same rows

#### Scenario: Sorting the same column twice flips the direction

- **WHEN** an operator clicks a sorted column, then clicks it again
- **THEN** the first click sorts ascending and the second sorts descending, and the header announces the direction

#### Scenario: A page number beyond the data is not reachable

- **WHEN** a listing has fewer pages than the operator requested
- **THEN** the last available window is rendered with its true total

### Requirement: The rail reports catalogue coverage

Every page SHALL show totals for coins, exchanges, chains, market assignments,
and running workers. The figures SHALL refresh after a write that changes them,
and a read that fails SHALL leave the last figures visible with a retry.

#### Scenario: Totals appear on any page

- **WHEN** a browser loads any page
- **THEN** the rail shows the current totals for coins, exchanges, chains, markets, and running workers

#### Scenario: Totals follow a write

- **WHEN** an operator adds or removes a chain, exchange, or coin
- **THEN** the rail's totals for that record type and for market assignments are re-read

#### Scenario: A failed re-read keeps the previous totals

- **WHEN** a re-read of the totals fails
- **THEN** the previous totals stay on screen, a notice says they are stale, and a retry is offered

### Requirement: Coins are listed, filtered, and edited

The coin listing SHALL show each coin's symbol, name, number of markets, number
of chains, and number of market pairs with no transfer route, and SHALL support a
coverage filter, sorting on those counts, and paging. An operator SHALL be able
to add, edit, and remove a coin.

#### Scenario: Coverage filter narrows the listing

- **WHEN** an operator selects the blocked-routes or single-market filter
- **THEN** the URL carries the filter and the listing shows only the coins that match it

#### Scenario: A coin is added

- **WHEN** an operator submits the new-coin form with a symbol, name, slug, and CoinGecko id
- **THEN** the coin is created, the listing shows it, and the form closes

#### Scenario: A duplicate is refused with a reason

- **WHEN** an operator submits a coin whose slug or CoinGecko id already exists
- **THEN** the form stays open, shows the reason, and no coin is created

#### Scenario: Removing a coin takes its assignments with it

- **WHEN** an operator confirms removal of a coin
- **THEN** the coin is removed and the listing and totals are re-read

### Requirement: A coin's routes are shown as markets and a transfer matrix

A coin's page SHALL list every exchange that lists it, with that listing's
exchange symbol, listed and trade-enabled flags, and the chains it is linked to.
It SHALL show, for every ordered pair of those markets, whether value can move
between them: fully, in one direction only, or not at all. A route SHALL exist
exactly when the source market can withdraw on a chain the destination market
can deposit on.

#### Scenario: The matrix reports the direction of every pair

- **WHEN** a coin is listed on two or more markets
- **THEN** the matrix shows each ordered pair as full, one-way, or blocked, and the shared chains for a pair are named when one exists

#### Scenario: A market is assigned to an exchange

- **WHEN** an operator assigns the coin to an exchange with an exchange symbol
- **THEN** the market appears in the list, the matrix is re-read, and the totals are re-read

#### Scenario: Unassigning removes the market and its links

- **WHEN** an operator confirms unassigning a market
- **THEN** the market and its chain links are removed, and the matrix is re-read

#### Scenario: Chain links are managed per market

- **WHEN** an operator links a market to a chain and sets its withdraw and deposit flags
- **THEN** the link appears with those flags, the matrix is re-read, and toggling a flag changes what the matrix reports

#### Scenario: A chain is created from the lookup when it is new

- **WHEN** an operator types a chain code that no chain uses and adds it from the lookup
- **THEN** the chain is created and immediately available to link

#### Scenario: A single market has no matrix

- **WHEN** a coin is listed on fewer than two markets
- **THEN** the page says how many more markets are needed instead of showing a matrix

### Requirement: Exchanges are listed and inspected

The exchange listing SHALL show each exchange's name, slug, base currency, CoinMarketCap registration, and creation time, and SHALL support search, sorting, and paging. An exchange's page SHALL show that exchange with its market assignments, the count of assignments that are listed, the count whose trading is enabled, and the coin behind each assignment.

#### Scenario: An exchange's markets name their coins

- **WHEN** an operator opens an exchange that has market assignments
- **THEN** each row shows the coin's symbol and name, the exchange symbol, and the listed and trade-enabled flags

#### Scenario: An exchange with no markets says so

- **WHEN** an operator opens an exchange that has no market assignments
- **THEN** the page says there are none and offers a way to browse coins

#### Scenario: A missing exchange is reported

- **WHEN** an operator opens an exchange id that no longer exists
- **THEN** the page reports that it no longer exists and offers a route back to the listing

### Requirement: Chains are listed and inspected

The chain listing SHALL show each chain's code, name, and creation time, and SHALL support search, sorting, and paging. A chain's page SHALL show every market linked to it with that market's exchange chain code and its deposit and withdraw flags, and SHALL report how many distinct exchanges and coins reach it.

#### Scenario: A chain's links name their market and coin

- **WHEN** an operator opens a chain that has market links
- **THEN** each row shows the exchange, the coin, the exchange's own chain code, and the deposit and withdraw flags

#### Scenario: A chain with no links says so

- **WHEN** an operator opens a chain that has no market links
- **THEN** the page says there are none

### Requirement: Workers are monitored and controlled

The worker page SHALL list every known exchange's worker with its desired state,
whether it is running, its shards with their phase and restart count, and how
many coins it is eligible to crawl. An operator SHALL be able to start and stop a
worker.

#### Scenario: A stopped worker is started

- **WHEN** an operator starts a worker that is not running
- **THEN** the row reports it running with its shards, and the running total in the rail is re-read

#### Scenario: A redundant request is refused with a reason

- **WHEN** an operator starts a worker that is already running, or stops one that is not
- **THEN** the request is refused, the page shows the reason, and the row is unchanged

### Requirement: A write cannot be sent incomplete, and a failed write keeps its form open

A form that requires a value SHALL NOT send a write while that value is missing,
and SHALL show what is missing. A write the API refuses SHALL leave its form
open and show the reason next to the control that caused it.

#### Scenario: A required field is empty

- **WHEN** an operator submits a form with a required field empty
- **THEN** the reason is shown against that field and no write is sent

#### Scenario: The API refuses a write

- **WHEN** the API refuses a write with a reason
- **THEN** the form stays open, the reason is shown inside it, and the data on screen is unchanged

### Requirement: The chosen theme is what the server renders

An operator SHALL be able to switch between a light and a dark theme, the choice
SHALL be remembered across reloads, and the server SHALL render the chosen
theme so the page does not show the other one first.

#### Scenario: The choice survives a reload

- **WHEN** an operator switches the theme and reloads
- **THEN** the server renders the chosen theme, and no flash of the other theme is visible

#### Scenario: The default applies without a choice

- **WHEN** a browser with no recorded theme requests a page
- **THEN** the server renders the light theme

### Requirement: Controls are operable without a pointer and announce their state

Every control SHALL have an accessible name. A sortable column header SHALL
announce the current sort direction. A failed read SHALL be announced without
requiring the operator to find it.

#### Scenario: An icon-only control has a name

- **WHEN** a control shows only an icon
- **THEN** it exposes a name that describes what it does

#### Scenario: A failed read is announced

- **WHEN** a read fails
- **THEN** the failure is in a live region, so it is announced rather than only drawn
