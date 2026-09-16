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
      <h1>Chains</h1>
      <div id="chains-error"></div>
      <div>
        <span id="chains-count">{String(total)} chains</span>
      </div>
      <div id="chains-list-region">
        <table>
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
                    href={"/chains/" + String(row.id)}
                    hx-get={"/chains/" + String(row.id)}
                    hx-target="#main-content"
                    hx-swap="innerHTML"
                    hx-push-url="true"
                  >
                    {row.name}
                  </a>
                </td>
                <td>{row.code}</td>
                <td>{String(row.coins)}</td>
                <td>
                  <button
                    hx-get={"/chains/" + String(row.id) + "/edit"}
                    hx-target="#modal-slot"
                    hx-swap="innerHTML"
                  >
                    Edit
                  </button>{" "}
                  <button hx-delete={"/chains/" + String(row.id)} hx-swap="none">
                    Delete
                  </button>
                </td>
              </tr>
            )) as unknown as "safe"}
          </tbody>
        </table>
      </div>
      <h2>New chain</h2>
      <div id="chain-create-error"></div>
      <form hx-post="/chains" hx-target="#chains-list-region" hx-swap="outerHTML">
        <input name="name" placeholder="name" />
        <input name="code" placeholder="code" />
        <button type="submit">Create</button>
      </form>
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
      <h1>{chain.name}</h1>
      <dl>
        <dt>code</dt>
        <dd>{chain.code}</dd>
        <dt>referencing coins</dt>
        <dd>{String(coins)}</dd>
      </dl>
      <a href="/chains" hx-get="/chains" hx-target="#main-content" hx-swap="innerHTML" hx-push-url="true">
        Back to chains
      </a>
    </div>
  );
}
