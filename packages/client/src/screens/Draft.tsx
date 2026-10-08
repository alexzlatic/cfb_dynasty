import { useMemo, useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api } from "../api.ts";
import { Logo, fmtDate } from "../util.tsx";
import { Panel } from "./common.tsx";

const ROUNDS = [1, 2, 3, 4, 5, 6, 7];

/**
 * The NFL draft: before January's deadline, nothing yet; then the juniors who declared; after the rollover
 * the mock draft of everyone leaving; in April the real thing, round by round, and the schools it favored.
 */
export function DraftScreen() {
  const { id, state, team } = useLeague();
  const data = useData(() => api.draft(id), [state.date]);
  const [round, setRound] = useState(1);
  const [mineOnly, setMineOnly] = useState(false);
  const me = state.user_team_id;
  const bySchool = useMemo(() => {
    const m = new Map<number, number>();
    for (const p of data?.draft?.picks ?? []) m.set(p.team_id, (m.get(p.team_id) ?? 0) + 1);
    return [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  }, [data]);
  if (!data) return <p className="muted">Loading...</p>;
  const d = data.draft;
  const picks = (d?.picks ?? []).filter((p) => (mineOnly ? p.team_id === me : p.round === round));
  return (
    <div>
      <div className="boardhead">
        <h2>{d ? `${d.year} NFL draft` : "NFL draft"}</h2>
        <span className="muted small">
          {data.dates.deadline && `Underclassmen declare by ${fmtDate(data.dates.deadline, true)}. `}
          {data.dates.draft && `The draft is ${fmtDate(data.dates.draft, true)}.`}
        </span>
      </div>
      <div className="cols">
        <div>
          {d ? (
            <Panel title="Picks" right={<label className="check small"><input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} /> Only your school</label>}>
              {!mineOnly && <div className="seg">{ROUNDS.map((r) => <button key={r} className={round === r ? "on" : ""} onClick={() => setRound(r)}>Round {r}</button>)}</div>}
              <table className="grid draft">
                <thead><tr><th className="num">Pick</th><th>NFL team</th><th>Player</th><th>Pos</th><th>School</th><th className="num">Ovr</th><th></th></tr></thead>
                <tbody>{picks.map((p) => (
                  <tr key={p.pick} className={p.team_id === me ? "mine" : ""}>
                    <td className="num"><b>{p.pick}</b>{mineOnly && <span className="muted small"> (rd {p.round})</span>}</td>
                    <td className="nfl">{p.nfl}</td><td><b>{p.name}</b></td><td><span className="pos">{p.pos}</span></td>
                    <td><Logo team={team(p.team_id)} size={20} /> <a href={`#/l/${id}/team/${p.team_id}`}>{team(p.team_id)?.school}</a></td>
                    <td className="num">{p.ovr}</td><td>{p.early && <span className="tag">early entry</span>}</td>
                  </tr>
                ))}</tbody>
              </table>
              {!picks.length && <p className="muted">None.</p>}
            </Panel>
          ) : data.projected.length ? (
            <Panel title="Mock draft" right={<span className="small muted">the NFL's consensus before April</span>}>
              <table className="grid draft">
                <thead><tr><th className="num">#</th><th>Player</th><th>Pos</th><th>School</th><th className="num">Ovr</th><th></th></tr></thead>
                <tbody>{data.projected.slice(0, 100).map((p, i) => (
                  <tr key={p.pid} className={p.team_id === me ? "mine" : ""}><td className="num">{i + 1}</td><td><b>{p.name}</b></td><td><span className="pos">{p.pos}</span></td>
                    <td><Logo team={team(p.team_id)} size={20} /> {team(p.team_id)?.school}</td><td className="num">{p.ovr}</td><td>{p.early && <span className="tag">early entry</span>}</td></tr>
                ))}</tbody>
              </table>
            </Panel>
          ) : data.early.length ? (
            <Panel title={`${data.early.length} underclassmen declared`}>
              <table className="grid draft">
                <thead><tr><th className="num">Board</th><th>Player</th><th>Pos</th><th>School</th><th className="num">Ovr</th></tr></thead>
                <tbody>{data.early.map((p) => (
                  <tr key={p.pid} className={p.team_id === me ? "mine" : ""}><td className="num">{p.rank}</td><td><a href={`#/l/${id}/player/${p.pid}`}>{p.name}</a></td><td><span className="pos">{p.pos}</span></td>
                    <td><Logo team={team(p.team_id)} size={20} /> {team(p.team_id)?.school}</td><td className="num">{p.ovr}</td></tr>
                ))}</tbody>
              </table>
            </Panel>
          ) : data.prospects.length ? (
            <Panel title="NFL big board" right={<span className="small muted">draft-eligible players the NFL likes most; underclassmen decide by the deadline</span>}>
              <table className="grid draft">
                <thead><tr><th className="num">#</th><th>Player</th><th>Pos</th><th>Class</th><th>School</th><th className="num">Ovr</th></tr></thead>
                <tbody>{data.prospects.map((p, i) => (
                  <tr key={p.pid} className={p.team_id === me ? "mine" : ""}><td className="num">{i + 1}</td><td><a href={`#/l/${id}/player/${p.pid}`}><b>{p.name}</b></a></td><td><span className="pos">{p.pos}</span></td>
                    <td className="small">{p.cls}</td><td><Logo team={team(p.team_id)} size={20} /> {team(p.team_id)?.school}</td><td className="num">{p.ovr}</td></tr>
                ))}</tbody>
              </table>
            </Panel>
          ) : (
            <Panel title="Nothing yet"><p>Juniors decide by the January deadline whether to enter the draft; seniors and anyone out of eligibility are in it anyway. The draft itself is in late April.</p></Panel>
          )}
        </div>
        <div>
          {d && (
            <Panel title="Picks by school">
              <table className="grid tight"><tbody>{bySchool.slice(0, 20).map(([t, n], i) => (
                <tr key={t} className={t === me ? "mine" : ""}><td className="num muted">{i + 1}</td><td><Logo team={team(t)} size={18} /> {team(t)?.school}</td><td className="num"><b>{n}</b></td>
                  <td className="num small muted" title="What three years of drafts add to the school's standing with recruits">{data.prestige[t] > 0 ? "+" : ""}{data.prestige[t]}</td></tr>
              ))}</tbody></table>
              <p className="small muted">Recruits notice: a school's picks over its last three drafts add up to 4 points to its standing with them (the last column).</p>
            </Panel>
          )}
          {me != null && (
            <Panel title={`${team(me)?.school} in the draft`}>
              <p>Last three drafts: {data.history[me]?.length ? `${data.history[me].join(", ")} picks` : "none yet"}. Standing with recruits: {data.prestige[me] > 0 ? "+" : ""}{data.prestige[me] ?? 0}.</p>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
