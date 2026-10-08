import { useState } from "react";
import { useLeague, useData } from "../App.tsx";
import { api } from "../api.ts";
import { Logo, fmtClock, fmtDate, onColor } from "../util.tsx";
import { Panel } from "./common.tsx";

const BOX_ROWS: [string, string][] = [
  ["first_downs", "First downs"], ["total_yards", "Total yards"], ["rush_att", "Rushes"], ["rush_yards", "Rushing yards"],
  ["completions", "Completions"], ["pass_att", "Pass attempts"], ["net_pass_yards", "Passing yards (net)"], ["sacks_taken", "Sacked"],
  ["ypp", "Yards per play"], ["third", "Third down"], ["fourth", "Fourth down"], ["red", "Red zone TDs"], ["turnovers", "Turnovers"],
  ["penalties", "Penalties"], ["punts", "Punts"], ["top", "Time of possession"],
];

export function GamePage({ gid }: { gid: number }) {
  const { id, team } = useLeague();
  const data = useData(() => api.game(id, gid), [gid]);
  const [tab, setTab] = useState<"box" | "drives" | "plays">("box");
  if (!data) return <p className="muted">Loading...</p>;
  const { game: g, detail: d, defenders } = data;
  const H = team(g.home_id)!, A = team(g.away_id)!;
  if (!d) return <p className="muted">This game has not been played yet.</p>;
  const val = (b: any, k: string) =>
    k === "third" ? `${b.third_conv}-${b.third_att}` : k === "fourth" ? `${b.fourth_conv}-${b.fourth_att}` : k === "red" ? `${b.red_zone_tds}-${b.red_zone_trips}` :
    k === "top" ? `${Math.floor(b.top_seconds / 60)}:${String(b.top_seconds % 60).padStart(2, "0")}` : k === "penalties" ? `${b.penalties}-${b.penalty_yards}` : b[k];
  const quarters = Math.max(d.home_q.length, d.away_q.length);
  return (
    <div>
      <div className="scoreboard">
        {[[A, g.away_score, g.away_rank, g.away_seed], [H, g.home_score, g.home_rank, g.home_seed]].map(([t, s, r, seed]: any, i) => (
          <div key={i} className="sbteam" style={{ background: t.color, color: onColor(t.color) }}>
            <Logo team={t} size={56} /><div className="sbname">{r ? <span className="rank">{r}</span> : null}{seed ? `(${seed}) ` : ""}{t.school}</div><div className="sbscore">{s}</div>
          </div>
        ))}
        <div className="sbmeta">{g.label ? <b>{g.label}<br /></b> : null}{fmtDate(g.date, true)}{g.venue ? ` · ${g.venue}` : g.neutral ? " · neutral site" : ` · at ${H.venue.name}`}{g.overtime ? " · OT" : ""}</div>
        <table className="grid tight linescore">
          <thead><tr><th></th>{Array.from({ length: quarters }, (_, i) => <th key={i}>{i < 4 ? i + 1 : "OT"}</th>)}<th>T</th></tr></thead>
          <tbody>
            <tr><td>{A.abbr}</td>{d.away_q.map((q, i) => <td key={i}>{q}</td>)}<td><b>{g.away_score}</b></td></tr>
            <tr><td>{H.abbr}</td>{d.home_q.map((q, i) => <td key={i}>{q}</td>)}<td><b>{g.home_score}</b></td></tr>
          </tbody>
        </table>
      </div>
      <div className="seg">
        <button className={tab === "box" ? "on" : ""} onClick={() => setTab("box")}>Box score</button>
        <button className={tab === "drives" ? "on" : ""} onClick={() => setTab("drives")}>Drive chart</button>
        <button className={tab === "plays" ? "on" : ""} onClick={() => setTab("plays")} disabled={!d.plays}>Play-by-play{d.plays ? "" : " (not kept)"}</button>
      </div>
      {tab === "box" && (
        <div className="cols">
          <Panel title="Team stats">
            <table className="grid tight"><thead><tr><th></th><th className="num">{A.abbr}</th><th className="num">{H.abbr}</th></tr></thead>
              <tbody>{BOX_ROWS.map(([k, label]) => <tr key={k}><td>{label}</td><td className="num">{val(d.away_box, k)}</td><td className="num">{val(d.home_box, k)}</td></tr>)}</tbody></table>
          </Panel>
          <div>
            {[[A, d.away_players], [H, d.home_players]].map(([t, pl]: any) => <PlayerBox key={t.id} team={t} players={pl}
              defense={Object.entries(d.defense ?? {}).filter(([pid]) => defenders[pid]?.team_id === t.id).map(([pid, l]) => ({ pid: Number(pid), ...defenders[pid]!, ...l }))} />)}
            {!!d.injuries?.length && (
              <Panel title="Injuries">
                <table className="grid tight"><tbody>{d.injuries.map((x, i) => (
                  <tr key={i}><td>{team(x.team_id)?.abbr}</td><td><a href={`#/l/${id}/player/${x.pid}`}>{x.name}</a> <span className="muted small">{x.pos}</span></td>
                    <td className="muted small">Q{x.quarter > 4 ? "OT" : x.quarter} · {x.type}</td>
                    <td className="small">{x.days == null ? "returned" : x.days === 0 ? "out for the game" : x.days >= 90 ? "out for the season" : `out about ${Math.max(1, Math.round(x.days / 7))} wk`}</td></tr>
                ))}</tbody></table>
              </Panel>
            )}
          </div>
        </div>
      )}
      {tab === "drives" && (
        <table className="grid tight">
          <thead><tr><th>Team</th><th>Qtr</th><th>Start</th><th>Field</th><th className="num">Plays</th><th className="num">Yds</th><th>Time</th><th>Result</th></tr></thead>
          <tbody>{d.drives.map((dr) => {
            const t = dr.home ? H : A;
            return (
              <tr key={dr.num}><td><Logo team={t} size={16} /> {t.abbr}</td><td>{dr.quarter > 4 ? "OT" : dr.quarter}</td><td>{fmtClock(dr.clock, dr.quarter)}</td>
                <td>{dr.start_yl > 50 ? `Opp ${100 - dr.start_yl}` : `Own ${dr.start_yl}`}</td><td className="num">{dr.plays}</td><td className="num">{dr.yards}</td>
                <td>{Math.floor(dr.seconds / 60)}:{String(dr.seconds % 60).padStart(2, "0")}</td><td className={/TD|FG$/.test(dr.result) ? "win" : ""}>{dr.result}</td></tr>
            );
          })}</tbody>
        </table>
      )}
      {tab === "plays" && d.plays && (
        <table className="grid tight pbp">
          <thead><tr><th>Qtr</th><th>Clock</th><th>Off</th><th>Down</th><th>Spot</th><th>Play</th><th className="num">{A.abbr}</th><th className="num">{H.abbr}</th></tr></thead>
          <tbody>{d.plays.map((p, i) => (
            <tr key={i} className={/TOUCHDOWN|GOOD|SAFETY/.test(p.description) ? "score" : ""}>
              <td>{p.quarter > 4 ? "OT" : p.quarter}</td><td>{fmtClock(p.clock, p.quarter)}</td><td>{p.offense}</td>
              <td className="nowrap">{p.down ? `${p.down}-${p.distance}` : ""}</td><td className="nowrap">{p.yardline}</td><td>{p.description}</td>
              <td className="num">{p.away_score}</td><td className="num">{p.home_score}</td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </div>
  );
}

type DefRow = { pid: number; name: string; pos: string; tkl?: number; tfl?: number; sacks?: number; def_int?: number; pd?: number; ff?: number };

function PlayerBox({ team, players, defense }: { team: any; players: Record<string, any>; defense: DefRow[] }) {
  const { id } = useLeague();
  const def = defense.filter((x) => x.tkl || x.sacks || x.def_int || x.ff).sort((a, b) => (b.tkl ?? 0) - (a.tkl ?? 0) || (b.sacks ?? 0) - (a.sacks ?? 0)).slice(0, 6);
  const rows = Object.entries(players);
  const passing = rows.filter(([, p]) => p.att), rushing = rows.filter(([, p]) => p.car).sort((a, b) => b[1].rush_yds - a[1].rush_yds);
  const receiving = rows.filter(([, p]) => p.rec).sort((a, b) => b[1].rec_yds - a[1].rec_yds), kicking = rows.filter(([, p]) => p.fga || p.xpa);
  return (
    <Panel title={team.school}>
      <table className="grid tight"><tbody>
        {passing.map(([n, p]) => <tr key={"p" + n}><td>{n}</td><td>{p.cmp}/{p.att}, {p.pass_yds} yds, {p.pass_td ?? 0} TD, {p.int ?? 0} INT</td></tr>)}
        {rushing.map(([n, p]) => <tr key={"r" + n}><td>{n}</td><td>{p.car} car, {p.rush_yds} yds{p.rush_td ? `, ${p.rush_td} TD` : ""}, long {p.rush_long}</td></tr>)}
        {receiving.map(([n, p]) => <tr key={"c" + n}><td>{n}</td><td>{p.rec} rec, {p.rec_yds} yds{p.rec_td ? `, ${p.rec_td} TD` : ""} ({p.tgt} tgt)</td></tr>)}
        {kicking.map(([n, p]) => <tr key={"k" + n}><td>{n}</td><td>FG {p.fgm ?? 0}/{p.fga ?? 0}{p.fg_long ? ` (long ${p.fg_long})` : ""}, XP {p.xpm ?? 0}/{p.xpa ?? 0}</td></tr>)}
        {def.map((x) => <tr key={"d" + x.pid}><td><a href={`#/l/${id}/player/${x.pid}`}>{x.name}</a> <span className="muted small">{x.pos}</span></td>
          <td>{[`${x.tkl ?? 0} tkl`, x.tfl ? `${x.tfl} TFL` : "", x.sacks ? `${x.sacks} sack${x.sacks > 1 ? "s" : ""}` : "", x.def_int ? `${x.def_int} INT` : "", x.pd ? `${x.pd} PD` : "", x.ff ? `${x.ff} FF` : ""].filter(Boolean).join(", ")}</td></tr>)}
      </tbody></table>
    </Panel>
  );
}
