import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";

export type ExchangeRow = {
  id: number;
  name: string;
  slug: string;
  cmcId: number;
  baseCurrency: string;
  registeredOnCmc: boolean | null;
  coins: number;
};

export function ExchangesPageBody({
  rows,
  total,
}: {
  rows: ExchangeRow[];
  total: number;
}) {
  return (
    <div>
      <h1 class="mb-4 text-2xl font-bold">Exchanges</h1>
      <div id="exchanges-error"></div>
      <div class="my-2">
        <span id="exchanges-count" class="badge badge-ghost">{String(total)} exchanges</span>
      </div>
      <div id="exchanges-list-region" class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table class="table table-zebra w-full table-sm">
          <thead>
            <tr>
              <th>name</th>
              <th>slug</th>
              <th>cmcId</th>
              <th>baseCurrency</th>
              <th>registeredOnCmc</th>
              <th>coins</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody id="exchanges-table-body">
            {rows.map((row) => (
              <tr id={"exchange-row-" + String(row.id)}>
                <td>
                  <a
                    class="link link-primary font-semibold"
                    href={"/exchanges/" + String(row.id)}
                    hx-get={"/exchanges/" + String(row.id)}
                    hx-target="#main-content"
                    hx-swap="innerHTML"
                    hx-push-url="true"
                  >
                    {row.name}
                  </a>
                </td>
                <td class="font-mono text-sm opacity-70">{row.slug}</td>
                <td>{String(row.cmcId)}</td>
                <td>
                  <span class="badge badge-ghost">{row.baseCurrency}</span>
                </td>
                <td>{String(row.registeredOnCmc)}</td>
                <td>
                  <span class="badge badge-ghost">{String(row.coins)}</span>
                </td>
                <td>
                  <div class="flex gap-1">
                    <button
                      class="btn btn-ghost btn-xs"
                      hx-get={"/exchanges/" + String(row.id) + "/edit"}
                      hx-target="#modal-slot"
                      hx-swap="innerHTML"
                    >
                      Edit
                    </button>
                    <button class="btn btn-error btn-outline btn-xs" hx-delete={"/exchanges/" + String(row.id)} hx-swap="none">
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            )) as unknown as "safe"}
          </tbody>
        </table>
      </div>
      <div class="card mt-6 bg-base-100 shadow-sm">
        <div class="card-body p-4">
          <h2 class="card-title text-lg">New exchange</h2>
          <div id="exchange-create-error"></div>
          <form hx-post="/exchanges" hx-target="#exchanges-list-region" hx-swap="outerHTML" class="flex flex-wrap gap-2">
            <input name="name" placeholder="name" class="input input-bordered input-sm" />
            <input name="slug" placeholder="slug" class="input input-bordered input-sm" />
            <input name="cmcId" placeholder="cmcId" inputmode="numeric" class="input input-bordered input-sm w-28" />
            <select name="baseCurrency" class="select select-bordered select-sm">
              <option value="usdt">usdt</option>
              <option value="idr">idr</option>
            </select>
            <button type="submit" class="btn btn-primary btn-sm">Create</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function ExchangeDetailBody({
  exchange,
  coins,
}: {
  exchange: { id: number; name: string; slug: string; cmcId: number; baseCurrency: string; registeredOnCmc: boolean | null };
  coins: number;
}) {
  return (
    <div>
      <h1 class="mb-4 text-2xl font-bold">{exchange.name}</h1>
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body p-4">
          <dl class="flex flex-col gap-2">
            <div class="flex gap-2"><dt class="w-36 font-semibold opacity-70">slug</dt><dd class="font-mono">{exchange.slug}</dd></div>
            <div class="flex gap-2"><dt class="w-36 font-semibold opacity-70">cmcId</dt><dd>{String(exchange.cmcId)}</dd></div>
            <div class="flex gap-2"><dt class="w-36 font-semibold opacity-70">baseCurrency</dt><dd><span class="badge badge-ghost">{exchange.baseCurrency}</span></dd></div>
            <div class="flex gap-2"><dt class="w-36 font-semibold opacity-70">registeredOnCmc</dt><dd>{String(exchange.registeredOnCmc)}</dd></div>
            <div class="flex gap-2"><dt class="w-36 font-semibold opacity-70">listed coins</dt><dd><span class="badge badge-primary">{String(coins)}</span></dd></div>
          </dl>
          <div class="card-actions mt-2">
            <a class="btn btn-ghost btn-sm" href="/exchanges" hx-get="/exchanges" hx-target="#main-content" hx-swap="innerHTML" hx-push-url="true">
              Back to exchanges
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
