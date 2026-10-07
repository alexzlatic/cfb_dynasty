import { useState } from "react";
import { useLeague, useData } from "../App.tsx";
import { api, type Poll } from "../api.ts";
import { Logo, TeamName, shortDate } from "../util.tsx";

const NAMES: Record<Poll["type"], string> = { ap: "AP poll", coaches: "Coaches poll", cfp: "CFP rankings", bcs: "BCS standings" };

export function Polls({ date }: { date?: string }) {
  const { id, team, state } = useLeague();
  const polls = useData(() => api.polls(id), []);
  const standings = useData(() => api.standings(id), []);
  const writers = useData(() => api.writers(id), []);
  const [type, setType] = useState<Poll["type"]>("ap");
  const [sel, setSel] = useState<string | null>(date ?? null);
  const [showBallots, setShowBallots] = useState(false);
  const ofType = (polls ?? []).filter((p) => p.type === type);
  const poll = ofType.find((p) => p.date === sel) ?? ofType[ofType.length - 1];
  const prev = poll ? ofType[ofType.indexOf(poll) - 1] : undefined;
  const ballots = useData(() => (poll && type === "ap" && showBallots ? api.ballots(id, poll.date) : Promise.resolve(null)), [poll?.date, type, showBallots]);
  const rec = new Map<number, string>();
  for (const c of standings ?? []) for (const r of c.rows) rec.set(r.team_id, `${r.w}-${r.l}`);
  const types = (["ap", "coaches", "cfp", "bcs"] as const).filter((t) => (polls ?? []).some((p) => p.type === t));
  if (!polls) return <p className="muted">Loading...</p>;
  if (!poll) return <p className="muted">No polls yet. The preseason AP poll comes out on the first day of the dynasty.</p>;
  const prevRank = (tid: number) => { const i = prev?.ranks.findIndex((r) => r.team_id === tid) ?? -1; return i >= 0 && i < 25 ? i + 1 : null; };
  const others = poll.ranks.slice(25).filter((r) => r.points > 0).slice(0, 15);
  const wname = new Map((writers ?? []).map((w) => [w.id, w]));
  return (
    <div>
      <div className="calhead">
        <div className="seg">{types.map((t) => <button key={t} className={t === type ? "on" : ""} onClick={() => { setType(t); setSel(null); }}>{NAMES[t]}</button>)}</div>
        <select value={poll.date} onChange={(e) => setSel(e.target.value)}>
          {ofType.map((p, i) => <option key={p.date + i} value={p.date}>{i === 0 && type === "ap" ? "Preseason" : `Week of ${shortDate(p.date)}`}</option>)}
        </select>
        {type === "ap" && <button onClick={() => setShowBallots(!showBallots)}>{showBallots ? "Hide ballots" : "Show every ballot"}</button>}
      </div>
      <div className="cols">
        <table className="grid poll">
          <thead><tr><th>#</th><th>Team</th><th>Rec</th><th className="num">{type === "bcs" ? "Avg" : "Points"}</th>{poll.voters ? <th className="num">1st</th> : null}<th>Prev</th></tr></thead>
          <tbody>{poll.ranks.slice(0, 25).map((r, i) => {
            const p = prevRank(r.team_id);
            const move = p == null ? "new" : p - (i + 1);
            return (
              <tr key={r.team_id} className={r.team_id === state.user_team_id ? "mine" : ""}>
                <td className="num">{i + 1}</td>
                <td><Logo team={team(r.team_id)} size={20} /> <TeamName team={team(r.team_id)} league={id} /></td>
                <td className="muted">{rec.get(r.team_id)}</td>
                <td className="num">{type === "bcs" ? r.points.toFixed(4) : r.points}</td>
                {poll.voters ? <td className="num muted">{r.first || ""}</td> : null}
                <td className={typeof move === "number" ? (move > 0 ? "up" : move < 0 ? "down" : "muted") : "new"}>{prev ? (typeof move === "number" ? (move > 0 ? `▲${move}` : move < 0 ? `▼${-move}` : "–") : "NR") : ""}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <div>
          {poll.voters ? <p className="muted">{poll.voters} voters. Points are 25 for first place down to 1 for 25th.</p> : null}
          {type === "cfp" && <p className="muted">The committee: 13 members who weigh schedule strength and quality wins over brand and margin.</p>}
          {type === "bcs" && <p className="muted">Average of the AP share, the coaches' share and a computer rating with no margin of victory.</p>}
          {others.length > 0 && <p className="small"><b>Others receiving votes:</b> {others.map((r) => `${team(r.team_id)?.school} ${r.points}`).join(", ")}</p>}
        </div>
      </div>
      {showBallots && ballots && (
        <section className="panel">
          <h3>Every ballot, {shortDate(poll.date)}</h3>
          <div className="ballots">
            <table className="grid tight">
              <thead><tr><th>Writer</th><th>Beat</th>{Array.from({ length: 25 }, (_, i) => <th key={i} className="num">{i + 1}</th>)}</tr></thead>
              <tbody>{ballots.map((b) => {
                const w = wname.get(b.writer_id);
                return (
                  <tr key={b.writer_id}>
                    <td className="nowrap"><a href={`#/l/${id}/writer/${b.writer_id}`}>{w ? `${w.first} ${w.last}` : b.writer_id}</a></td>
                    <td className="nowrap muted small">{w ? beatLabel(w, team) : ""}</td>
                    {b.team_ids.map((t, i) => <td key={i} title={team(t)?.school} className={t === state.user_team_id ? "mine" : ""}><Logo team={team(t)} size={18} /></td>)}
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

export function beatLabel(w: { beat: { kind: string; team_id?: number; conference?: string } }, team: (id: number) => { school: string } | undefined): string {
  return w.beat.kind === "team" ? team(w.beat.team_id!)?.school ?? "" : w.beat.kind === "conference" ? w.beat.conference! : "National";
}
