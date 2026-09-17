import { Html } from "@elysiajs/html";
import "@elysiajs/html/htmx";

export type ChainRow = {
  id: number;
  name: string;
  code: string;
  coins: number;
};

export function ChainsPageBody({
  rows,
  total,
}: {
  rows: ChainRow[];
  total: number;
}) {
  return (
    <div>
      <h1 class="mb-4 text-2xl font-bold">Chains</h1>
      <div id="chains-error"></div>
      <div class="my-2">
        <span id="chains-count" class="badge badge-ghost">{String(total)} chains</span>
      </div>
      <div id="chains-list-region" class="overflow-x-auto rounded-box border border-base-300 bg-base-100">
        <table class="table table-zebra w-full table-sm">
          <thead>
            <tr>
              <th>name</th>
              <th>code</th>
              <th>coins</th>
              <th>actions</th>
            </tr>
          </thead>
          <tbody id="chains-table-body">
            {rows.map((row) => (
              <tr id={"chain-row-" + String(row.id)}>
                <td>
                  <a
                    class="link link-primary font-semibold"
                    href={"/chains/" + String(row.id)}
                    hx-get={"/chains/" + String(row.id)}
                    hx-target="#main-content"
                    hx-swap="innerHTML"
                    hx-push-url="true"
                  >
                    {row.name}
                  </a>
                </td>
                <td>
                  <span class="badge badge-ghost font-mono">{row.code}</span>
                </td>
                <td>
                  <span class="badge badge-ghost">{String(row.coins)}</span>
                </td>
                <td>
                  <div class="flex gap-1">
                    <button
                      class="btn btn-ghost btn-xs"
                      hx-get={"/chains/" + String(row.id) + "/edit"}
                      hx-target="#modal-slot"
                      hx-swap="innerHTML"
                    >
                      Edit
                    </button>
                    <button class="btn btn-error btn-outline btn-xs" hx-delete={"/chains/" + String(row.id)} hx-swap="none">
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
          <h2 class="card-title text-lg">New chain</h2>
          <div id="chain-create-error"></div>
          <form hx-post="/chains" hx-target="#chains-list-region" hx-swap="outerHTML" class="flex flex-wrap gap-2">
            <input name="name" placeholder="name" class="input input-bordered input-sm" />
            <input name="code" placeholder="code" class="input input-bordered input-sm" />
            <button type="submit" class="btn btn-primary btn-sm">Create</button>
          </form>
        </div>
      </div>
    </div>
  );
}

export function ChainDetailBody({
  chain,
  coins,
}: {
  chain: { id: number; name: string; code: string };
  coins: number;
}) {
  return (
    <div>
      <h1 class="mb-4 text-2xl font-bold">{chain.name}</h1>
      <div class="card bg-base-100 shadow-sm">
        <div class="card-body p-4">
          <dl class="flex flex-col gap-2">
            <div class="flex gap-2"><dt class="w-36 font-semibold opacity-70">code</dt><dd><span class="badge badge-ghost font-mono">{chain.code}</span></dd></div>
            <div class="flex gap-2"><dt class="w-36 font-semibold opacity-70">referencing coins</dt><dd><span class="badge badge-primary">{String(coins)}</span></dd></div>
          </dl>
          <div class="card-actions mt-2">
            <a class="btn btn-ghost btn-sm" href="/chains" hx-get="/chains" hx-target="#main-content" hx-swap="innerHTML" hx-push-url="true">
              Back to chains
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
