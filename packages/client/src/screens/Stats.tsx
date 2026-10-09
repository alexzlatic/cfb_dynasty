import { useMemo, useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type StatsPlayer, type StatsTeam } from "../api.ts";
import { Logo } from "../util.tsx";
import type { Col } from "../sort.tsx";
import { CatTabs, PLAYER_CATS, StatFilters, StatsTable, TEAM_CATS, fmtStat, passes, playerCat, statValue, teamCat, teamLine, useStatFilter, type StatCol, type Line } from "../stats.tsx";
import { Panel } from "./common.tsx";
import { POS_ORDER } from "./Players.tsx";

type Scope = { year: number; level: string; conf: string; team: string };

/** Season, level, conference and team pickers shared by the Stats pages. */
function ScopeBar({ sc, set, teamPick = true }: { sc: Scope; set: (p: Partial<Scope>) => void; teamPick?: boolean }) {
  const { id, teams } = useLeague();
  const years = useData(() => api.statYears(id), []);
  const confs = useMemo(() => [...new Set([...teams.values()].filter((t) => t.level === sc.level && t.conference).map((t) => t.conference!))].sort(), [teams, sc.level]);
  const schools = useMemo(() => [...teams.values()].filter((t) => t.level === sc.level && (!sc.conf || t.conference === sc.conf)).sort((a, b) => a.school.localeCompare(b.school)), [teams, sc.level, sc.conf]);
  return (
    <div className="toolbar small">
      <select value={sc.year} onChange={(e) => set({ year: Number(e.target.value) })}>{(years ?? [sc.year]).map((y) => <option key={y} value={y}>{y} season</option>)}</select>
      <span className="seg" style={{ marginBottom: 0 }}>{["fbs", "fcs"].map((l) => <button key={l} className={sc.level === l ? "on" : ""} onClick={() => set({ level: l, conf: "", team: "" })}>{l.toUpperCase()}</button>)}</span>
      <select value={sc.conf} onChange={(e) => set({ conf: e.target.value, team: "" })}><option value="">All conferences</option>{confs.map((c) => <option key={c}>{c}</option>)}</select>
      {teamPick && <select value={sc.team} onChange={(e) => set({ team: e.target.value })}><option value="">All teams</option>{schools.map((t) => <option key={t.id} value={t.id}>{t.school}</option>)}</select>}
    </div>
  );
}

function useScope(year?: number) {
  const { state } = useLeague();
  const [sc, setSc] = useState<Scope>({ year: year ?? state.year, level: "fbs", conf: "", team: "" });
  return { sc, set: (p: Partial<Scope>) => setSc((x) => ({ ...x, ...p })) };
}

/** Player columns that lead every player stats table: name, team and (this season) his overall. */
export function usePlayerLead(withTeam = true): Col<StatsPlayer>[] {
  const { id, team } = useLeague();
  const cols: Col<StatsPlayer>[] = [
    { key: "name", label: "Player", cell: (r) => <><a href={`#/l/${id}/player/${r.pid}`}>{r.name}</a> <span className="muted small">{r.pos} · {r.class}</span></>, by: (r) => r.name, asc: true },
  ];
  if (withTeam) cols.push({ key: "team", label: "Team", cell: (r) => <span className="nowrap"><Logo team={team(r.team_id)} size={16} /> {team(r.team_id)?.abbr ?? team(r.team_id)?.school}</span>, by: (r) => team(r.team_id)?.school, asc: true });
  return cols;
}

/** Stats > Players: every player's season, by category, sortable and filterable. */
function PlayerStats({ year }: { year?: number }) {
  const { id, state, team } = useLeague();
  const { sc, set } = useScope(year);
  const { f, set: setF } = useStatFilter();
  const [cat, setCat] = useState("passing");
  const [perGame, setPerGame] = useState(false);
  const rows = useData(() => api.statPlayers(id, { year: String(sc.year), level: sc.level }), [sc.year, sc.level]);
  const c = playerCat(cat);
  const shown = useMemo(() => (rows ?? []).filter((r) => (!sc.conf || team(r.team_id)?.conference === sc.conf) && (!sc.team || r.team_id === Number(sc.team)) && passes(f, r, r, c, r.tgp)),
    [rows, sc.conf, sc.team, f, c, team]);
  const lead = usePlayerLead();
  return (
    <Panel title={`Player stats: ${c.label}`}>
      <ScopeBar sc={sc} set={set} />
      <StatFilters f={f} set={setF} positions={POS_ORDER}><span className="muted">{shown.filter((r) => c.has(r)).length} players</span></StatFilters>
      <CatTabs cats={PLAYER_CATS} cat={cat} setCat={setCat} perGame={perGame} setPerGame={setPerGame} />
      {!rows ? <p className="muted">Loading...</p> : <StatsTable rows={shown} line={(r) => r} cat={c} lead={lead} rowKey={(r) => r.pid} perGame={perGame}
        rowClass={(r) => (r.team_id === state.user_team_id ? "mine" : undefined)} empty="No one has stats in this category yet." />}
    </Panel>
  );
}

/** Stats > Teams: every team's season (and what its opponents did), by category. */
function TeamStatsPage({ year }: { year?: number }) {
  const { id, state, team } = useLeague();
  const { sc, set } = useScope(year);
  const [cat, setCat] = useState("offense");
  const [perGame, setPerGame] = useState(true);
  const rows = useData(() => api.statTeams(id, { year: String(sc.year), level: sc.level }), [sc.year, sc.level]);
  const c = teamCat(cat);
  const shown = useMemo(() => (rows ?? []).filter((r) => !sc.conf || team(r.team_id)?.conference === sc.conf).map((r) => ({ ...r, line: teamLine(r) })), [rows, sc.conf, team]);
  const lead: Col<StatsTeam & { line: Line }>[] = [
    { key: "team", label: "Team", cell: (r) => <a className="nowrap" href={`#/l/${id}/team/${r.team_id}`}><Logo team={team(r.team_id)} size={16} /> {team(r.team_id)?.school}</a>, by: (r) => team(r.team_id)?.school, asc: true },
    { key: "rec", label: "W-L", className: "num", cell: (r) => `${r.w}-${r.l}`, by: (r) => r.w - r.l },
  ];
  return (
    <Panel title={`Team stats: ${c.label}`}>
      <ScopeBar sc={sc} set={set} teamPick={false} />
      <CatTabs cats={TEAM_CATS} cat={cat} setCat={setCat} perGame={perGame} setPerGame={setPerGame} />
      {!rows ? <p className="muted">Loading...</p> : <StatsTable rows={shown} line={(r) => r.line} cat={c} lead={lead} rowKey={(r) => r.team_id} perGame={perGame} limit={300}
        rowClass={(r) => (r.team_id === state.user_team_id ? "mine" : undefined)} empty="No games played yet." />}
      {c.key === "defense" && <p className="small muted">Defense is what opponents gained against each team; lower is better and sorts first.</p>}
    </Panel>
  );
}

/** Leader boards: counting stats for everyone, rates for qualified players only. */
const BOARDS: { cat: string; col: string; rate?: boolean }[] = [
  { cat: "passing", col: "pass_yds" }, { cat: "passing", col: "pass_td" }, { cat: "passing", col: "rating", rate: true },
  { cat: "rushing", col: "rush_yds" }, { cat: "rushing", col: "rush_td" }, { cat: "rushing", col: "ypc", rate: true },
  { cat: "receiving", col: "rec" }, { cat: "receiving", col: "rec_yds" }, { cat: "receiving", col: "rec_td" },
  { cat: "scrimmage", col: "scrim_yds" }, { cat: "defense", col: "tkl" }, { cat: "defense", col: "tfl" },
  { cat: "defense", col: "sacks" }, { cat: "defense", col: "def_int" }, { cat: "defense", col: "pd" },
  { cat: "defense", col: "ff" }, { cat: "kicking", col: "fgm" }, { cat: "kicking", col: "fg_pct", rate: true },
];

/** Stats > Leaders: the top ten in each stat, nationally or in a conference. */
function Leaders({ year }: { year?: number }) {
  const { id, state, team } = useLeague();
  const { sc, set } = useScope(year);
  const [perGame, setPerGame] = useState(false);
  const rows = useData(() => api.statPlayers(id, { year: String(sc.year), level: sc.level }), [sc.year, sc.level]);
  const pool = useMemo(() => (rows ?? []).filter((r) => (!sc.conf || team(r.team_id)?.conference === sc.conf) && (!sc.team || r.team_id === Number(sc.team))), [rows, sc, team]);
  if (!rows) return <p className="muted">Loading...</p>;
  return (
    <div>
      <ScopeBar sc={sc} set={set} />
      <span className="seg"><button className={!perGame ? "on" : ""} onClick={() => setPerGame(false)}>Totals</button><button className={perGame ? "on" : ""} onClick={() => setPerGame(true)}>Per game</button></span>
      <div className="leaders">
        {BOARDS.map((b) => {
          const c = playerCat(b.cat), col = c.cols.find((x) => x.key === b.col)!;
          const top = pool.filter((r) => c.has(r) && (!b.rate || !c.qualified || c.qualified(r, r.tgp)))
            .map((r) => ({ r, x: statValue(col, r, perGame) })).filter((y) => y.x != null && (b.rate || y.x > 0))
            .sort((a, z) => (col.asc ? a.x! - z.x! : z.x! - a.x!) || a.r.pid - z.r.pid).slice(0, 10);
          return <Board key={b.col} title={`${c.label}: ${col.title ?? col.label}${b.rate ? " (qualified)" : ""}${perGame && col.count ? " per game" : ""}`} col={col} perGame={perGame} top={top} mine={state.user_team_id} />;
        })}
      </div>
    </div>
  );
}

function Board({ title, col, perGame, top, mine }: { title: string; col: StatCol; perGame: boolean; top: { r: StatsPlayer; x: number | null }[]; mine: number | null }) {
  const { id, team } = useLeague();
  return (
    <Panel title={title}>
      {!top.length ? <p className="muted small">No games yet.</p> : (
        <table className="grid tight"><tbody>{top.map(({ r, x }, i) => (
          <tr key={r.pid} className={r.team_id === mine ? "mine" : ""}><td className="num muted">{i + 1}</td>
            <td><a href={`#/l/${id}/player/${r.pid}`}>{r.name}</a> <span className="muted small">{r.pos}</span></td>
            <td className="nowrap small"><Logo team={team(r.team_id)} size={14} /> {team(r.team_id)?.abbr ?? team(r.team_id)?.school}</td>
            <td className="num"><b>{fmtStat(col, x, perGame)}</b></td><td className="num muted small">{r.gp} g</td></tr>
        ))}</tbody></table>
      )}
    </Panel>
  );
}

const HIST: [string, string][] = [["pass_yds", "Passing yds"], ["pass_td", "Pass TD"], ["rush_yds", "Rushing yds"], ["rush_td", "Rush TD"], ["rec", "Catches"],
  ["rec_yds", "Receiving yds"], ["tkl", "Tackles"], ["sacks", "Sacks"], ["def_int", "Interceptions"]];

/** Stats > History: every finished season in this save, with links into its full stats. */
function History() {
  const { id, state, team } = useLeague();
  const rows = useData(() => api.statHistory(id), []);
  if (!rows) return <p className="muted">Loading...</p>;
  if (!rows.length) return <Panel title="History"><p className="muted">Each season's stats are saved here when the league rolls into the next one. The {state.year} season is under Players, Teams and Leaders until then.</p></Panel>;
  const who = (x: { pid: number; name: string; team_id: number } | null, v?: number) => x
    ? <span className="nowrap"><Logo team={team(x.team_id)} size={14} /> <a href={`#/l/${id}/player/${x.pid}`}>{x.name}</a>{v != null && <span className="muted"> {v.toLocaleString()}</span>}</span> : <span className="muted">-</span>;
  return (
    <div>
      {rows.map((h) => (
        <Panel key={h.year} title={`${h.year} season`} right={<span className="small">
          <a href={`#/l/${id}/stats/players/${h.year}`}>Players</a> · <a href={`#/l/${id}/stats/teams/${h.year}`}>Teams</a> · <a href={`#/l/${id}/stats/leaders/${h.year}`}>Leaders</a></span>}>
          <div className="cols even">
            <table className="grid tight"><tbody>
              <tr><td>National champion</td><td>{h.champion ? <a href={`#/l/${id}/team/${h.champion}`}><Logo team={team(h.champion)} size={16} /> {team(h.champion)?.school}</a> : "-"}</td></tr>
              <tr><td>Heisman Trophy</td><td>{who(h.heisman)}</td></tr>
              {h.playoff.length > 0 && <tr><td>Playoff field</td><td className="small">{h.playoff.map((t) => team(t)?.abbr).join(", ")}</td></tr>}
              {h.user && <tr className="mine"><td>{team(h.user.team_id)?.school}</td><td>{h.user.w}-{h.user.l}{h.user.rank ? `, finished No. ${h.user.rank}` : ""} · <a href={`#/l/${id}/team/${h.user.team_id}/stats`}>year by year</a></td></tr>}
            </tbody></table>
            <table className="grid tight"><thead><tr><th>National leader</th><th></th></tr></thead><tbody>
              {HIST.map(([k, label]) => <tr key={k}><td>{label}</td><td>{who(h.leaders[k], h.leaders[k]?.value)}</td></tr>)}
            </tbody></table>
          </div>
        </Panel>
      ))}
    </div>
  );
}

/** The Stats section: Players, Teams, Leaders and History (a season in the route opens that year). */
export function StatsScreen({ sub, year }: { sub: string; year?: number }) {
  return sub === "teams" ? <TeamStatsPage year={year} /> : sub === "leaders" ? <Leaders year={year} /> : sub === "history" ? <History /> : <PlayerStats year={year} />;
}
