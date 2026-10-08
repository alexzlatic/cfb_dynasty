import { useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type BudgetData } from "../api.ts";
import { Logo, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, x) => a + x, 0);
const grade = (g: number) => "★".repeat(g) + "☆".repeat(5 - g);

/** Football's budget for the fiscal year, game-day ticket prices and crowds, and facilities. */
export function BudgetScreen({ tid }: { tid?: number }) {
  const { id, state, team } = useLeague();
  const data = useData(() => api.budget(id, tid), [state.date, tid]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [price, setPrice] = useState<Record<number, string>>({});
  if (!data) return <p className="muted">Loading...</p>;
  if (data.team_id == null) return <Panel title="Budget"><p className="muted">This school has no football budget in the game.</p></Panel>;
  const t = team(data.team_id);
  const act = async (type: string, payload: unknown) => {
    setBusy(true); setErr(null);
    try { await api.act(id, type, payload); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const fy = `${data.year}-${String(data.year + 1).slice(2)}`;
  return (
    <div>
      {err && <p className="error">{err}</p>}
      <div className="cols even">
        <Panel title={<><Logo team={t} size={22} /> {t?.school} football budget, {fy}</>}>
          <Lines title="Revenue" lines={data.revenue} labels={data.labels.revenue} />
          <Lines title="Expenses" lines={data.expenses} labels={data.labels.expenses} />
          <table className="grid tight"><tbody><tr><td><b>{data.surplus >= 0 ? "Surplus to the athletic department" : "Deficit the athletic department covers"}</b></td>
            <td className={"num " + (data.surplus >= 0 ? "win" : "loss")}><b>{money(Math.abs(data.surplus))}</b></td></tr></tbody></table>
          <p className="small muted">The fiscal year runs July to June. Tickets count games played and the crowds expected at the rest; postseason shares arrive as you play in them.
            {data.source === "estimate" ? " These lines are estimated from the conference and the program's size until real athletic department finances are loaded." : " From the school's Knight-Newhouse football report."}</p>
        </Panel>
        <Panel title={`${t?.conference} budgets`}>
          <table className="grid tight"><thead><tr><th>School</th><th className="num">Revenue</th><th className="num">Expenses</th><th className="num">Surplus</th></tr></thead><tbody>
            {data.conference.map((r) => <tr key={r.team_id} className={r.team_id === state.user_team_id ? "mine" : ""}>
              <td><Logo team={team(r.team_id)} size={18} /> <a href={`#/l/${id}/budget/${r.team_id}`}>{team(r.team_id)?.school}</a></td>
              <td className="num">{money(r.revenue)}</td><td className="num">{money(r.expenses)}</td><td className={"num " + (r.surplus < 0 ? "loss" : "")}>{money(r.surplus)}</td></tr>)}
          </tbody></table>
        </Panel>
      </div>
      <div className="cols even">
        <Panel title="Game day">
          <p className="small muted">Usual price ${data.usual_price}, capacity {data.capacity.toLocaleString()}. Higher prices bring in more per fan and fewer fans; a winning team, a ranked opponent and a sellout crowd let you charge more.</p>
          <table className="grid tight">
            <thead><tr><th>Date</th><th>Opponent</th><th className="num">Price</th><th className="num">Crowd</th><th className="num">Tickets</th>{data.mine && <th></th>}</tr></thead>
            <tbody>{data.home.map((h) => {
              const g = h.game, opp = team(g.away_id), final = g.status === "final";
              return (
                <tr key={g.id}>
                  <td className="muted nowrap">{shortDate(g.date)}</td>
                  <td><Logo team={opp} size={18} /> {opp?.school}</td>
                  <td className="num">${h.price}{h.custom ? "" : <span className="muted small"> usual</span>}</td>
                  <td className="num">{h.attendance?.toLocaleString() ?? ""}{!final && <span className="muted small"> expected</span>}</td>
                  <td className="num">{h.revenue != null ? money(h.revenue) : ""}</td>
                  {data.mine && <td className="nowrap small">{!final && <>
                    <span className="muted">{h.options.map((o) => `$${o.price}: ${Math.round(o.attendance / 1000)}K fans, ${money(o.revenue)}`).join(" · ")}</span><br />
                    $<input className="num" style={{ width: "4em" }} value={price[g.id] ?? String(h.price)} onChange={(e) => setPrice({ ...price, [g.id]: e.target.value })} />{" "}
                    <button disabled={busy} onClick={() => act("set_ticket_price", { game_id: g.id, price: Number(price[g.id] ?? h.price) })}>Set</button>
                    {h.custom && <> <button className="link" disabled={busy} onClick={() => act("set_ticket_price", { game_id: g.id, price: null })}>Usual</button></>}
                  </>}</td>}
                </tr>
              );
            })}</tbody>
          </table>
        </Panel>
        <Facilities data={data} busy={busy} act={act} />
      </div>
    </div>
  );
}

function Lines({ title, lines, labels }: { title: string; lines: Record<string, number>; labels: Record<string, string> }) {
  return (
    <table className="grid tight"><thead><tr><th>{title}</th><th className="num">{money(sum(lines))}</th></tr></thead><tbody>
      {Object.entries(lines).map(([k, v]) => <tr key={k}><td>{labels[k] ?? k}</td><td className="num">{money(v)}</td></tr>)}
    </tbody></table>
  );
}

function Facilities({ data, busy, act }: { data: BudgetData; busy: boolean; act: (type: string, payload: unknown) => void }) {
  if (!data.facilities) return <div />;
  const building = new Map(data.projects.map((p) => [p.area, p]));
  return (
    <Panel title="Facilities">
      <table className="grid tight"><tbody>
        {Object.entries(data.areas).map(([k, label]) => {
          const g = data.facilities![k], p = building.get(k);
          return <tr key={k}><td>{label}</td><td className="nowrap">{grade(g)}</td>
            <td className="small muted">{p ? `Upgrade to ${p.to} underway: ${money(p.cost)}, ready ${shortDate(p.done)} ${p.done.slice(0, 4)}` : ""}</td>
            {data.mine && <td>{!p && g < 5 && <button className="link small" disabled={busy} onClick={() => act("request_project", { area: k })}>Ask the AD</button>}</td>}</tr>;
        })}
      </tbody></table>
      <p className="small muted">Weight rooms and practice fields speed up development, training and medical shortens injuries, and the locker room and academic support help chemistry and recruiting.
        Today's facilities are already part of every team's ratings, so an upgrade pays off from the season it opens. Your AD approves one when football's surplus covers the first year's payment.</p>
      {data.requests.length > 0 && <ul className="small">{data.requests.map((r, i) => <li key={i} className={r.approved ? "win" : "loss"}>{shortDate(r.date)}: {r.reason}</li>)}</ul>}
    </Panel>
  );
}
