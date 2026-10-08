import { useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, SKILL_NAMES, type CoachMove, type CoachView, type SkillKey } from "../api.ts";
import { SortTable, type Col } from "../sort.tsx";
import { Logo, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";
import { CoachWhere, ROLE_SHORT, coachLink, schemeOf } from "./Staff.tsx";

const WHY: Record<string, string> = { fired: "fired", retired: "retired", not_retained: "not kept by the new coach", resigned: "stepped down", left: "left", hired_away: "hired away" };
const pctStr = (x: number) => `${Math.round(100 * x)}%`;

/** One line of the carousel: who went where. */
function MoveLine({ m }: { m: CoachMove }) {
  const { id, team } = useLeague();
  const t = m.team_id != null ? team(m.team_id) : undefined;
  const who = <a href={`#/l/${id}/coach/${m.coach}`}>{m.name}</a>;
  const school = t ? <><Logo team={t} size={16} /> <a href={`#/l/${id}/team/${t.id}`}>{t.school}</a></> : null;
  if (m.kind === "hired") {
    const f = m.from?.team_id != null ? team(m.from.team_id) : undefined;
    return <>{school} hires {who} as {ROLE_SHORT[m.role!].toLowerCase()}{f ? <span className="muted"> (from {f.school}, {ROLE_SHORT[m.from!.role!].toLowerCase()})</span> : <span className="muted"> (was out of work)</span>}</>;
  }
  if (m.kind === "left_coaching") return <>{who} <span className="muted">leaves coaching</span></>;
  return <>{school} {ROLE_SHORT[m.role!].toLowerCase()} {who} <span className={m.kind === "fired" ? "loss" : "muted"}>{WHY[m.kind] ?? m.kind}</span>{m.note && <span className="muted small"> · {m.note}</span>}</>;
}

/** The coaching carousel: openings, this offseason's moves, and every FBS head coach (hot seats in season). */
export function CoachesScreen() {
  const { id, state, team } = useLeague();
  const data = useData(() => api.coaches(id), []);
  const [year, setYear] = useState<number | null>(null);
  const [onlyHc, setOnlyHc] = useState(true);
  const past = useData(() => (year != null ? api.coachMoves(id, year) : Promise.resolve(null)), [year]);
  if (!data) return <p className="muted">Loading...</p>;
  const moves = (year != null && past ? past : data.moves).filter((m) => !onlyHc || m.role === "HC");
  const hot = data.head_coaches.some((c) => c.hot != null);
  const cols: Col<CoachView & { hot: number | null }>[] = [
    { key: "school", label: "School", by: (c) => team(c.team_id!)?.school, cell: (c) => <><Logo team={team(c.team_id!)} size={18} /> <a href={`#/l/${id}/team/${c.team_id}`}>{team(c.team_id!)?.school}</a></> },
    { key: "coach", label: "Head coach", by: (c) => c.last, cell: (c) => <>{coachLink(id, c)}{c.user && <span className="muted small"> (you)</span>}</> },
    { key: "age", label: "Age", className: "num", by: (c) => c.age, asc: true, cell: (c) => c.age },
    { key: "rep", label: "Rep", title: "Reputation, 0 to 100", className: "num", by: (c) => c.rep, cell: (c) => c.rep },
    { key: "since", label: "Since", className: "num", by: (c) => c.since, asc: true, cell: (c) => c.since },
    { key: "rec", label: "Career", className: "num", by: (c) => c.hc_record.w / Math.max(1, c.hc_record.w + c.hc_record.l), cell: (c) => `${c.hc_record.w}-${c.hc_record.l}` },
    { key: "sys", label: "System", by: (c) => schemeOf(c, null), cell: (c) => <span className="small">{schemeOf(c, null)}</span> },
    { key: "pay", label: "Salary", className: "num", by: (c) => c.salary, cell: (c) => money(c.salary) },
    ...(hot ? [{ key: "hot", label: "Hot seat", title: "Chance his athletic director lets him go after the season, from his record so far (fit to 2006-2024 FBS coaches)", className: "num",
      by: (c: CoachView & { hot: number | null }) => c.hot, cell: (c: CoachView & { hot: number | null }) => (c.hot == null ? "" : <span className={c.hot >= 0.4 ? "loss" : c.hot >= 0.2 ? "warn" : "muted"}>{pctStr(c.hot)}</span>) }] : []),
  ];
  const openings = [...data.openings].sort((a, b) => (a.role === "HC" ? 0 : 1) - (b.role === "HC" ? 0 : 1) || a.opened.localeCompare(b.opened));
  return (
    <div>
      <div>
        <Panel title={`Coaching carousel ${data.year}`} right={<span className="small muted">{data.open ? `Open until ${shortDate(data.close)}` : state.date < `${state.year}-11-20` ? "Opens the Sunday after the last full Saturday of November" : "Closed"}</span>}>
          <p className="small muted">Athletic directors let coaches go the day after the last full Saturday of November; each opening is filled over the next weeks, best jobs first. Successful Group of Five head coaches and power-conference coordinators are first in line; coaches who are let go take a step down or drop out.</p>
          {data.open && openings.length > 0 && (
            <>
              <h4>Open jobs ({openings.length})</h4>
              <table className="grid tight"><tbody>{openings.map((o) => (
                <tr key={`${o.team_id}:${o.role}`}><td><Logo team={team(o.team_id)} size={16} /> <a href={`#/l/${id}/team/${o.team_id}`}>{team(o.team_id)?.school}</a></td><td>{ROLE_SHORT[o.role]}</td>
                  <td className="muted small">{o.prev_name ? `${o.prev_name} ${WHY[o.why] ?? o.why}` : WHY[o.why] ?? o.why}</td><td className="muted small nowrap">{shortDate(o.opened)}</td>
                  <td className="small">{o.offered ? <b>offered to you</b> : ""}</td></tr>
              ))}</tbody></table>
            </>
          )}
          <h4>
            Moves{" "}
            <span className="seg" style={{ margin: 0 }}>
              <button className={year == null ? "on" : ""} onClick={() => setYear(null)}>This offseason</button>
              {data.past_years.filter((y) => y !== data.year).slice(0, 5).map((y) => <button key={y} className={year === y ? "on" : ""} onClick={() => setYear(y)}>{y}</button>)}
            </span>{" "}
            <label className="small"><input type="checkbox" checked={onlyHc} onChange={(e) => setOnlyHc(e.target.checked)} /> Head coaches only</label>
          </h4>
          {!moves.length ? <p className="muted">No moves yet.</p> : (
            <table className="grid tight"><tbody>{moves.slice(0, 300).map((m, i) => (
              <tr key={i}><td className="muted small nowrap">{shortDate(m.date)}</td><td><MoveLine m={m} /></td></tr>
            ))}</tbody></table>
          )}
        </Panel>
      </div>
      <div>
        <Panel title="FBS head coaches">
          <SortTable rows={data.head_coaches} cols={cols} rowKey={(c) => c.id} rowClass={(c) => (c.user ? "mine" : undefined)} />
        </Panel>
      </div>
    </div>
  );
}

/** One coach: where he is, his record by season, his moves, and your staff's read of his skills. */
export function CoachPage({ cid }: { cid: number }) {
  const { id, team, state } = useLeague();
  const c = useData(() => api.coach(id, cid), [cid]);
  if (!c) return <p className="muted">Loading...</p>;
  const mine = c.team_id != null && c.team_id === state.user_team_id;
  return (
    <div className="cols">
      <div>
        <Panel title={`${c.first} ${c.last}`}>
          <table className="grid tight"><tbody>
            <tr><td>Now</td><td><CoachWhere c={c} /></td></tr>
            <tr><td>Age</td><td>{c.age}</td></tr>
            <tr><td>Reputation</td><td>{c.rep} <span className="muted small">of 100</span></td></tr>
            <tr><td>Came up on</td><td>{c.side === "off" ? "Offense" : "Defense"}: {schemeOf(c, c.side === "off" ? "OC" : "DC")}</td></tr>
            {c.role && <tr><td>Contract</td><td>{money(c.salary)} a year through {c.through}</td></tr>}
            {(c.hc_record.w + c.hc_record.l > 0) && <tr><td>Head coaching record</td><td>{c.hc_record.w}-{c.hc_record.l}{c.prior ? <span className="muted small"> ({c.prior.w}-{c.prior.l} in {c.prior.years} season{c.prior.years === 1 ? "" : "s"} before the dynasty)</span> : null}</td></tr>}
          </tbody></table>
          <h4>{mine ? "Skills" : "Skills (your staff's read)"}</h4>
          <table className="grid tight"><tbody>{(Object.keys(SKILL_NAMES) as SkillKey[]).map((k) => (
            <tr key={k}><td>{SKILL_NAMES[k]}</td><td className="num">{c.skills[k]}</td></tr>
          ))}</tbody></table>
        </Panel>
      </div>
      <div>
        <Panel title="Seasons">
          {!c.seasons.length ? <p className="muted">No seasons in this dynasty yet.</p> : (
            <table className="grid tight"><thead><tr><th>Year</th><th>School</th><th>Job</th><th className="num">Record</th><th className="num" title="His unit against what the roster was expected to give, in standard deviations">Unit</th></tr></thead>
              <tbody>{[...c.seasons].reverse().map((x) => (
                <tr key={`${x.year}:${x.team_id}`}><td>{x.year}</td><td><Logo team={team(x.team_id)} size={16} /> {team(x.team_id)?.school}</td><td>{ROLE_SHORT[x.role]}</td><td className="num">{x.w}-{x.l}</td>
                  <td className="num">{x.unit == null ? "" : <span className={x.unit >= 0.5 ? "win" : x.unit <= -0.5 ? "loss" : ""}>{x.unit > 0 ? "+" : ""}{x.unit.toFixed(1)}</span>}</td></tr>
              ))}</tbody></table>
          )}
        </Panel>
        <Panel title="Moves">
          {!c.moves.length ? <p className="muted">None in this dynasty.</p> : (
            <table className="grid tight"><tbody>{c.moves.map((m, i) => <tr key={i}><td className="muted small nowrap">{shortDate(m.date)} {m.date.slice(0, 4)}</td><td><MoveLine m={m} /></td></tr>)}</tbody></table>
          )}
        </Panel>
      </div>
    </div>
  );
}
