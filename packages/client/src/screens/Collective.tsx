import { useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api } from "../api.ts";
import { Logo, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";

/** Your school's collective: boosters' NIL money, its deals, and what the fair-market-value review did. */
export function CollectiveScreen({ tid }: { tid?: number }) {
  const { id, state, team } = useLeague();
  const data = useData(() => api.collective(id, tid), [state.date, tid]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <p className="muted">Loading...</p>;
  if (data.team_id == null) return <Panel title="Collective"><p className="muted">This school has no collective.</p></Panel>;
  const t = team(data.team_id);
  const setFocus = async (focus: string[]) => {
    setBusy(true); setErr(null);
    try { await api.act(id, "set_collective_focus", { focus }); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const toggle = (pos: string) => setFocus(data.focus.includes(pos) ? data.focus.filter((x) => x !== pos) : [...data.focus, pos]);
  const cut = data.deals.filter((d) => d.deal.status === "cut");
  return (
    <div>
      <div className="cols even">
        <Panel title={<><Logo team={t} size={22} /> {t?.school} collective</>}>
          <table className="grid tight"><tbody>
            <tr><td>Boosters give in a normal year</td><td className="num">{money(data.base)}</td></tr>
            <tr><td>In player deals</td><td className="num">{money(data.spent)}</td></tr>
            <tr><td>On hand for new deals</td><td className="num">{money(data.reserve)}</td></tr>
          </tbody></table>
          <p className="small muted">The collective is the boosters' money, not yours: it fills the gap between what the school pays a player and what he's worth, then buys stars with what's left.
            Donors give more when the team wins beyond expectations, and the collective makes new deals on the first of each month in the season.
            Every deal goes through the fair-market-value review, which cuts back anything far above what players like him get.</p>
        </Panel>
        {data.mine ? (
          <Panel title="Where you've asked it to spend">
            <p className="small muted">Pick up to {data.focus_max} positions; the collective takes care of them first and gives their stars a bigger share of what's left.</p>
            <div className="seg small">{data.positions.map((p) => <button key={p} disabled={busy || (!data.focus.includes(p) && data.focus.length >= data.focus_max)} className={data.focus.includes(p) ? "on" : ""} onClick={() => toggle(p)}>{p}</button>)}</div>
            {err && <p className="error small">{err}</p>}
          </Panel>
        ) : <div />}
      </div>
      <div className="cols even">
        <Panel title={`Deals (${data.deals.length})`}>
          <table className="grid tight">
            <thead><tr><th>Player</th><th className="num">Value</th><th className="num">Revenue share</th><th className="num">NIL deal</th><th>Review</th></tr></thead>
            <tbody>{data.deals.map((d) => (
              <tr key={d.pid}>
                <td><a href={`#/l/${id}/player/${d.pid}`}>{d.name}</a> <span className="muted small">{d.pos} {d.ovr}</span></td>
                <td className="num">{money(d.value)}</td><td className="num muted">{money(d.revenue_share)}</td><td className="num">{money(d.deal.amount)}</td>
                <td className={"small " + (d.deal.status === "cut" ? "loss" : "muted")}>{d.deal.status === "cut" ? `Cut from ${money(d.deal.asked ?? 0)}` : "Approved"} {shortDate(d.deal.date)}</td>
              </tr>
            ))}</tbody>
          </table>
        </Panel>
        <Panel title={`${t?.conference} collectives`}>
          <table className="grid tight"><thead><tr><th>School</th><th className="num">In deals</th><th className="num">Normal year</th></tr></thead><tbody>
            {data.conference.map((r) => <tr key={r.team_id} className={r.team_id === state.user_team_id ? "mine" : ""}>
              <td><Logo team={team(r.team_id)} size={18} /> <a href={`#/l/${id}/collective/${r.team_id}`}>{team(r.team_id)?.school}</a></td>
              <td className="num">{money(r.spent)}</td><td className="num muted">{money(r.base)}</td></tr>)}
          </tbody></table>
          {cut.length > 0 && <p className="small muted">{cut.length} of {data.deals.length} deals here were cut back by the review.</p>}
        </Panel>
      </div>
    </div>
  );
}
