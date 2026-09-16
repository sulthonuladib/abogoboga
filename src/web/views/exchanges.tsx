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
      <h1>Exchanges</h1>
      <div id="exchanges-error"></div>
      <div>
        <span id="exchanges-count">{String(total)} exchanges</span>
      </div>
      <div id="exchanges-list-region">
        <table>
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
                    href={"/exchanges/" + String(row.id)}
                    hx-get={"/exchanges/" + String(row.id)}
                    hx-target="#main-content"
                    hx-swap="innerHTML"
                    hx-push-url="true"
                  >
                    {row.name}
                  </a>
                </td>
                <td>{row.slug}</td>
                <td>{String(row.cmcId)}</td>
                <td>{row.baseCurrency}</td>
                <td>{String(row.registeredOnCmc)}</td>
                <td>{String(row.coins)}</td>
                <td>
                  <button
                    hx-get={"/exchanges/" + String(row.id) + "/edit"}
                    hx-target="#modal-slot"
                    hx-swap="innerHTML"
                  >
                    Edit
                  </button>{" "}
                  <button hx-delete={"/exchanges/" + String(row.id)} hx-swap="none">
                    Delete
                  </button>
                </td>
              </tr>
            )) as unknown as "safe"}
          </tbody>
        </table>
      </div>
      <h2>New exchange</h2>
      <div id="exchange-create-error"></div>
      <form hx-post="/exchanges" hx-target="#exchanges-list-region" hx-swap="outerHTML">
        <input name="name" placeholder="name" />
        <input name="slug" placeholder="slug" />
        <input name="cmcId" placeholder="cmcId" inputmode="numeric" />
        <select name="baseCurrency">
          <option value="usdt">usdt</option>
          <option value="idr">idr</option>
        </select>
        <button type="submit">Create</button>
      </form>
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
      <h1>{exchange.name}</h1>
      <dl>
        <dt>slug</dt>
        <dd>{exchange.slug}</dd>
        <dt>cmcId</dt>
        <dd>{String(exchange.cmcId)}</dd>
        <dt>baseCurrency</dt>
        <dd>{exchange.baseCurrency}</dd>
        <dt>registeredOnCmc</dt>
        <dd>{String(exchange.registeredOnCmc)}</dd>
        <dt>listed coins</dt>
        <dd>{String(coins)}</dd>
      </dl>
      <a href="/exchanges" hx-get="/exchanges" hx-target="#main-content" hx-swap="innerHTML" hx-push-url="true">
        Back to exchanges
      </a>
    </div>
  );
}
