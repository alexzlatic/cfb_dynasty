import { useState } from "react";
import { useLeague, useData } from "../App.tsx";
import { api } from "../api.ts";
import { Logo, TeamName, shortDate } from "../util.tsx";
import { NewsList, Panel } from "./common.tsx";
import { beatLabel } from "./Polls.tsx";

const STYLES: Record<string, { label: string; blurb: string }> = {
  homer: { label: "Homer", blurb: "Votes with the heart. Their team is always a little better than you think." },
  brand_loyalist: { label: "Brand loyalist", blurb: "Trusts the big names until they prove otherwise, and then some." },
  recency_chaser: { label: "Recency chaser", blurb: "Whatever happened Saturday matters most. Big swings, week to week." },
  numbers: { label: "Numbers person", blurb: "Efficiency, schedule strength, quality wins. Ignores the logo on the helmet." },
  contrarian: { label: "Contrarian", blurb: "Ballots that start arguments. Rarely agrees with the consensus." },
  steady: { label: "Steady hand", blurb: "Slow to move teams up or down. Their ballot changes least week to week." },
};

export function Writers() {
  const { id, team } = useLeague();
  const writers = useData(() => api.writers(id), []);
  const [q, setQ] = useState("");
  if (!writers) return <p className="muted">Loading...</p>;
  const shown = writers.filter((w) => !q || `${w.first} ${w.last} ${w.outlet} ${beatLabel(w, team)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="calhead"><h2>AP voters</h2><input placeholder="Search writers, outlets, teams" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <p className="muted">{writers.length} beat writers vote in the AP poll: one per Power 4 team and Notre Dame, two or three per smaller conference, and three national columnists. Names and outlets are made up.</p>
      <table className="grid">
        <thead><tr><th>Writer</th><th>Outlet</th><th>Beat</th><th>Style</th><th className="num">Years</th></tr></thead>
        <tbody>{shown.map((w) => (
          <tr key={w.id}>
            <td><a href={`#/l/${id}/writer/${w.id}`}>{w.first} {w.last}</a></td>
            <td className="muted">{w.outlet}</td>
            <td>{w.beat.kind === "team" ? <><Logo team={team(w.beat.team_id)} size={18} /> {team(w.beat.team_id)?.school}</> : beatLabel(w, team)}</td>
            <td>{STYLES[w.style]?.label}</td>
            <td className="num">{w.years_voting}</td>
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}

export function WriterPage({ wid }: { wid: number }) {
  const { id, team, state } = useLeague();
  const data = useData(() => api.writer(id, wid), [wid]);
  const [sel, setSel] = useState<string | null>(null);
  if (!data) return <p className="muted">Loading...</p>;
  const w = data.writer;
  const ballot = data.ballots.find((b) => b.date === sel) ?? data.ballots[data.ballots.length - 1];
  const prev = ballot ? data.ballots[data.ballots.indexOf(ballot) - 1] : undefined;
  const beatTeam = w.beat.kind === "team" ? team(w.beat.team_id) : undefined;
  const consensus = state.ap;
  return (
    <div className="cols">
      <div>
        <div className="profile" style={{ borderColor: beatTeam?.color }}>
          {beatTeam && <Logo team={beatTeam} size={64} />}
          <div>
            <h2>{w.first} {w.last}</h2>
            <div>{w.outlet}</div>
            <div className="muted">Covers {beatLabel(w, team)} · AP voter for {w.years_voting} season{w.years_voting === 1 ? "" : "s"}</div>
            <div className="muted">Hometown {w.hometown ?? "unknown"} · Alma mater {w.alma_mater != null ? team(w.alma_mater)?.school : "unknown"}</div>
            <div className="style"><b>{STYLES[w.style]?.label}.</b> {STYLES[w.style]?.blurb}</div>
          </div>
        </div>
        <Panel title="Ballot" right={
          <select value={ballot?.date ?? ""} onChange={(e) => setSel(e.target.value)}>
            {data.ballots.map((b, i) => <option key={b.date} value={b.date}>{i === 0 ? "Preseason" : `Week of ${shortDate(b.date)}`}</option>)}
          </select>}>
          {!ballot ? <p className="muted">No ballots yet.</p> : (
            <table className="grid tight"><thead><tr><th>#</th><th>Team</th><th>Poll</th><th>Last week</th></tr></thead><tbody>
              {ballot.team_ids.map((t, i) => {
                const p = prev ? prev.team_ids.indexOf(t) : -2;
                const c = consensus.findIndex((r) => r.team_id === t);
                return (
                  <tr key={t} className={t === state.user_team_id ? "mine" : ""}>
                    <td className="num">{i + 1}</td>
                    <td><Logo team={team(t)} size={18} /> <TeamName team={team(t)} league={id} /></td>
                    <td className="muted">{ballot === data.ballots[data.ballots.length - 1] ? (c >= 0 ? `No. ${c + 1}` : "NR") : ""}</td>
                    <td className={p === -2 ? "" : p === -1 ? "new" : p > i ? "up" : p < i ? "down" : "muted"}>{p === -2 ? "" : p === -1 ? "NR" : p > i ? `▲${p - i}` : p < i ? `▼${i - p}` : "–"}</td>
                  </tr>
                );
              })}
            </tbody></table>
          )}
        </Panel>
      </div>
      <Panel title="Stories"><NewsList items={data.stories} /></Panel>
    </div>
  );
}
