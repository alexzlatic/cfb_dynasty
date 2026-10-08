import { useData, useLeague } from "../App.tsx";
import { api } from "../api.ts";
import { Logo, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";

/** Your school's collective: boosters' NIL money, its deals, and what the fair-market-value review did. */
export function CollectiveScreen({ tid }: { tid?: number }) {
  const { id, state, team } = useLeague();
  const data = useData(() => api.collective(id, tid), [state.date, tid]);
  if (!data) return <p className="muted">Loading...</p>;
  if (data.team_id == null) return <Panel title="Collective"><p className="muted">This school has no collective.</p></Panel>;
  const t = team(data.team_id);
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
          {data.mine
            ? <p className="small muted">Your collective raises the boosters' money and you decide where it goes: it's part of your <a href={`#/l/${id}/payroll`}>roster budget</a>.
                Donors give more when the team wins beyond expectations and less when it loses. Every NIL deal goes through the fair-market-value review.</p>
            : <p className="small muted">This school's collective fills the gap between what the school pays a player and what he's worth, then pays stars with what's left, on the first of each month in the season.
                Donors give more when the team wins beyond expectations. Every deal goes through the fair-market-value review, which cuts back anything far above what players like him get.</p>}
        </Panel>
        <div />
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
