/**
 * Workers monitoring page: per-exchange badges, shard detail, and the live
 * lifecycle event tail.
 *
 * @module
 */

import type { WorkerStatus } from "@lister/api"
import { html, join, type RawHtml } from "../Html.ts"
import { EmptyState, PageHeader } from "./Controls.ts"

const statusBadge = (status: WorkerStatus): RawHtml =>
  status.desired === "started"
    ? html`<span class="badge badge-success badge-sm">started</span>`
    : html`<span class="badge badge-ghost badge-sm">stopped</span>`

const transitionButton = (status: WorkerStatus): RawHtml =>
  status.running
    ? html`<button
        class="btn btn-error btn-sm"
        hx-post="/workers/${status.exchangeId}/stop"
        hx-target="#workers-list"
        hx-swap="outerHTML"
      >
        Stop
      </button>`
    : html`<button
        class="btn btn-primary btn-sm"
        hx-post="/workers/${status.exchangeId}/start"
        hx-target="#workers-list"
        hx-swap="outerHTML"
      >
        Start
      </button>`

const shardPhaseTone: Record<WorkerStatus["shards"][number]["phase"], string> = {
  starting: "badge-ghost",
  running: "badge-success",
  reconnecting: "badge-warning"
}

const shardPhaseBadge = (phase: WorkerStatus["shards"][number]["phase"]): RawHtml =>
  html`<span class="badge ${shardPhaseTone[phase]} badge-sm">${phase}</span>`

const lastTickTime = (lastTickAt: number | null): RawHtml => {
  if (lastTickAt === null) return html`<span class="opacity-60">No tick yet</span>`

  const timestamp = new Date(lastTickAt).toISOString()

  return html`<time datetime="${timestamp}">${timestamp}</time>`
}

const shardTable = (status: WorkerStatus): RawHtml =>
  status.shards.length === 0
    ? html`<p class="text-sm opacity-60">No shards running.</p>`
    : html`<div class="overflow-x-auto">
        <table class="table table-sm">
          <thead>
            <tr>
              <th>Shard</th>
              <th>Coins</th>
              <th>Restarts</th>
              <th>Phase</th>
              <th>Attempt</th>
              <th>Last tick</th>
            </tr>
          </thead>
          <tbody>
            ${join(
              status.shards.map(
                (shard) => html`<tr>
                  <td class="font-mono text-xs">${shard.shardId}</td>
                  <td>${shard.size}</td>
                  <td>${shard.restarts}</td>
                  <td>${shardPhaseBadge(shard.phase)}</td>
                  <td>${shard.attempt === null ? "—" : String(shard.attempt)}</td>
                  <td class="font-mono text-xs">${lastTickTime(shard.lastTickAt)}</td>
                </tr>`
              )
            )}
          </tbody>
        </table>
      </div>`

const workerCard = (status: WorkerStatus): RawHtml =>
  html`<div class="card rounded-box bg-base-100 shadow-sm" data-exchange-id="${status.exchangeId}">
    <div class="card-body gap-3 p-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-semibold">${status.exchangeSlug}</span>
          ${statusBadge(status)}
          <span class="badge badge-outline badge-sm">${status.eligibleCoins} eligible</span>
          <span class="badge badge-outline badge-sm">${status.restarts} restarts</span>
        </div>
        ${transitionButton(status)}
      </div>
      ${shardTable(status)}
    </div>
  </div>`

/**
 * Renders the polling worker list.
 *
 * The container polls `/partials/workers` every two seconds and replaces
 * itself (`outerHTML`) with the returned fragment, so start/stop responses and
 * the poll both target the same element.
 *
 * @param statuses - Current status for every known exchange.
 * @returns The worker list fragment.
 */
export const WorkersList = (statuses: ReadonlyArray<WorkerStatus>): RawHtml =>
  html`<div
    id="workers-list"
    class="flex flex-col gap-3"
    hx-get="/partials/workers"
    hx-trigger="every 2s"
    hx-swap="outerHTML"
  >
    ${statuses.length === 0
      ? EmptyState({ title: "No exchanges configured", hint: "Add an exchange before starting workers." })
      : join(statuses.map(workerCard))}
  </div>`

const eventsPanel = (): RawHtml =>
  html`<div class="card rounded-box mt-6 bg-base-100 shadow-sm">
      <div class="card-body gap-2 p-4">
        <h2 class="text-lg font-semibold">Lifecycle events</h2>
        <p class="text-xs opacity-60">
          Live server-sent events from <code>/api/workers/events</code>.
        </p>
        <div
          id="workers-events"
          class="mt-2 max-h-64 overflow-y-auto rounded-box bg-base-200/50 p-2 font-mono text-xs"
        ></div>
      </div>
    </div>
    <script>
      (function () {
        var el = document.getElementById("workers-events");
        if (!el || el.dataset.connected === "1") return;
        el.dataset.connected = "1";
        var source = new EventSource("/api/workers/events");
        source.onmessage = function (event) {
          var line = document.createElement("div");
          line.textContent = event.data;
          el.prepend(line);
          while (el.childElementCount > 50) {
            el.lastElementChild.remove();
          }
        };
      })();
    </script>`

/**
 * Renders the full workers page body.
 *
 * @param statuses - Current status for every known exchange.
 * @returns The page body fragment.
 */
export const WorkersBody = (statuses: ReadonlyArray<WorkerStatus>): RawHtml =>
  html`<div>
    ${PageHeader({
      title: "Workers",
      subtitle: "Start and stop exchange crawlers, watch shard health, and tail lifecycle events.",
      actions: html`<button
        class="btn btn-ghost btn-sm"
        hx-get="/workers"
        hx-target="#main-content"
        hx-swap="innerHTML show:top"
        hx-push-url="true"
      >
        ↻ Refresh
      </button>`
    })}
    ${WorkersList(statuses)}
    ${eventsPanel()}
  </div>`
