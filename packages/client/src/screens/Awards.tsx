import { useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type Award } from "../api.ts";
import { Logo, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";

/** Who: a linked player with his team. */
function Who({ a }: { a: { pid: number; name: string; pos: string; team_id: number } }) {
  const { id, team } = useLeague();
  const t = team(a.team_id);
  return <span><Logo team={t} size={16} /> <a href={`#/l/${id}/player/${a.pid}`}>{a.name}</a> <span className="muted small">{a.pos}, {t?.school}</span></span>;
}

/** Awards (Heisman, All-Americans, conference and weekly honors); stat leaders are under Stats. */
export function AwardsScreen() {
  const { id, state } = useLeague();
  const data = useData(() => api.awards(id), [state.date]);
  const [tab, setTab] = useState<"awards" | "weekly">("awards");
  if (!data) return <p className="muted">Loading...</p>;
  const year = data.awards.filter((a) => a.year === state.year);
  const of = (t: Award["type"]) => year.filter((a) => a.type === t);
  const heis = [...of("heisman"), ...of("heisman_finalist")];
  const aa = of("all_american");
  const confs = [...new Set([...of("conf_poy_off"), ...of("conf_poy_def")].map((a) => a.conference!))].sort();
  const weeks = [...new Set(of("potw_off").map((a) => a.date))].reverse();
  const mine = (a: Award) => a.team_id === state.user_team_id;
  return (
    <div>
      <div className="seg">
        <button className={tab === "awards" ? "on" : ""} onClick={() => setTab("awards")}>Season awards</button>
        <button className={tab === "weekly" ? "on" : ""} onClick={() => setTab("weekly")}>Players of the week</button>
        <a className="button" href={`#/l/${id}/stats/leaders`}>Stat leaders</a>
      </div>
      {tab === "awards" && (!heis.length ? <Panel title="Season awards"><p className="muted">The Heisman, the All-America team and conference players of the year are announced the day after championship weekend.</p></Panel> : (
        <div className="cols">
          <div>
            <Panel title={`${state.year} Heisman Trophy`}>
              <table className="grid tight"><tbody>{heis.map((a, i) => (
                <tr key={a.pid} className={mine(a) ? "mine" : ""}><td>{i === 0 ? <b>Winner</b> : "Finalist"}</td><td><Who a={a} /><div className="small muted">{a.line}</div></td><td className="num">{a.points}</td></tr>
              ))}</tbody></table>
            </Panel>
            <Panel title="Conference players of the year">
              <table className="grid tight"><thead><tr><th>Conference</th><th>Offense</th><th>Defense</th></tr></thead><tbody>{confs.map((c) => {
                const o = of("conf_poy_off").find((a) => a.conference === c), d = of("conf_poy_def").find((a) => a.conference === c);
                return <tr key={c}><td>{c}</td><td>{o && <Who a={o} />}</td><td>{d && <Who a={d} />}</td></tr>;
              })}</tbody></table>
            </Panel>
          </div>
          <div>
            <Panel title="All-America team">
              <table className="grid tight"><thead><tr><th></th><th>First team</th><th>Second team</th></tr></thead><tbody>
                {[...new Set(aa.map((a) => a.pos))].flatMap((pos) => {
                  const f = aa.filter((a) => a.pos === pos && a.team === 1), s = aa.filter((a) => a.pos === pos && a.team === 2);
                  return f.map((a, i) => (
                    <tr key={a.pid}><td className="muted">{pos}</td><td className={mine(a) ? "mine" : ""}><Who a={a} /></td><td className={s[i] && mine(s[i]) ? "mine" : ""}>{s[i] && <Who a={s[i]} />}</td></tr>
                  ));
                })}
              </tbody></table>
            </Panel>
          </div>
        </div>
      ))}
      {tab === "weekly" && (
        <Panel title="Players of the week">
          {!weeks.length ? <p className="muted">Named every Sunday with the AP poll, from the week's best games.</p> : (
            <table className="grid tight"><thead><tr><th>Week of</th><th>Offense</th><th>Defense</th></tr></thead><tbody>{weeks.map((d) => {
              const o = of("potw_off").find((a) => a.date === d)!, df = of("potw_def").find((a) => a.date === d)!;
              const conf = year.filter((a) => a.date === d && (a.type === "conf_potw_off" || a.type === "conf_potw_def") && mine(a));
              return (
                <tr key={d}><td className="nowrap">{shortDate(d)}</td>
                  <td><Who a={o} /><div className="small muted">{o.line}</div></td>
                  <td><Who a={df} /><div className="small muted">{df.line}</div>
                    {conf.map((a) => <div key={a.pid + a.type} className="small mine">{a.conference} {a.type === "conf_potw_off" ? "offensive" : "defensive"} player of the week: {a.name}</div>)}</td></tr>
              );
            })}</tbody></table>
          )}
        </Panel>
      )}
    </div>
  );
}
