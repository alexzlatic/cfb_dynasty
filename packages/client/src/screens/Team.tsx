import { useMemo, useState } from "react";
import { useLeague, useData } from "../App.tsx";
import { api, type Player, type StatRow } from "../api.ts";
import { Logo, heightStr, onColor } from "../util.tsx";
import { GameTable, NewsList, Panel } from "./common.tsx";
import { CatTabs, StatsTable, TEAM_CATS, catsWith, fmtStat, rankIn, statValue, teamLine } from "../stats.tsx";
import { usePlayerLead } from "./Stats.tsx";
import { SortTable } from "../sort.tsx";
import { go } from "../router.ts";
import { RosterTable, outUntil, playerLink } from "./Players.tsx";

const POS_ORDER = ["QB", "RB", "WR", "TE", "OL", "DL", "EDGE", "LB", "DB", "CB", "S", "K", "P", "LS", "ATH"];
const ROLE = { HC: "Head coach", OC: "Offensive coordinator", DC: "Defensive coordinator", STC: "Special teams coordinator" } as const;

/** The team page's Stats tab: the team's season against the nation (and its opponents'), then every player's stats. */
function TeamStatsTab({ tid, level }: { tid: number; level: string }) {
  const { id, state } = useLeague();
  const [year, setYear] = useState(state.year);
  const [perGame, setPerGame] = useState(true);
  const [cat, setCat] = useState("passing");
  const years = useData(() => api.statYears(id), []);
  const teams = useData(() => api.statTeams(id, { year: String(year), level }), [year, level]);
  const players = useData(() => api.statPlayers(id, { year: String(year), team: String(tid) }), [year, tid]);
  const lead = usePlayerLead(false);
  const lines = useMemo(() => (teams ?? []).map(teamLine), [teams]);
  const me = teams?.find((x) => x.team_id === tid);
  const pcats = catsWith(players ?? []);
  const pc = pcats.find((x) => x.key === cat) ?? pcats[0];
  return (
    <div>
      <div className="toolbar small">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>{(years ?? [year]).map((y) => <option key={y} value={y}>{y} season</option>)}</select>
        <span className="seg" style={{ marginBottom: 0 }}><button className={!perGame ? "on" : ""} onClick={() => setPerGame(false)}>Totals</button><button className={perGame ? "on" : ""} onClick={() => setPerGame(true)}>Per game</button></span>
        <span className="muted">Ranks are among {lines.length} {level.toUpperCase()} teams.</span>
      </div>
      {!teams ? <p className="muted">Loading...</p> : !me ? <Panel title="Team stats"><p className="muted">No games played yet.</p></Panel> : (
        <div className="stat-cards">
          {TEAM_CATS.map((c) => (
            <Panel key={c.key} title={c.label} right={<a href={`#/l/${id}/stats/teams`}>All teams</a>}>
              <table className="grid tight"><thead><tr><th>Stat</th><th className="num">{perGame ? "Per game" : "Total"}</th><th className="num" title="National rank">Rank</th></tr></thead>
                <tbody>{c.cols.map((col) => {
                  const mine = teamLine(me), x = statValue(col, mine, perGame), rk = rankIn(col, mine, lines, perGame);
                  return <tr key={col.key}><td title={col.title}>{col.title ?? col.label}</td><td className="num">{fmtStat(col, x, perGame)}</td>
                    <td className={"num " + (rk != null && rk <= lines.length / 4 ? "win" : rk != null && rk > (3 * lines.length) / 4 ? "loss" : "muted")}>{rk ?? "-"}</td></tr>;
                })}</tbody></table>
            </Panel>
          ))}
        </div>
      )}
      <YearByYear tid={tid} />
      <Panel title="Player stats">
        {!players ? <p className="muted">Loading...</p> : !pc ? <p className="muted">No stats yet.</p> : <>
          <CatTabs cats={pcats} cat={pc.key} setCat={setCat} />
          <StatsTable rows={players} line={(r) => r} cat={pc} lead={lead} rowKey={(r) => r.pid} perGame={perGame} />
        </>}
      </Panel>
    </div>
  );
}

/** The school's seasons in this save: record, finish, points and yards for and against; a season opens its stats. */
function YearByYear({ tid }: { tid: number }) {
  const { id } = useLeague();
  const rows = useData(() => api.teamHistory(id, tid), [tid]);
  if (!rows?.length) return null;
  const per = (x: number, g: number) => (g ? (x / g).toFixed(1) : "-");
  return (
    <Panel title="Year by year" right={<a href={`#/l/${id}/stats/history`}>League history</a>}>
      <SortTable rows={[...rows].reverse()} rowKey={(r) => r.year} cols={[
        { key: "year", label: "Season", cell: (r) => <a href={`#/l/${id}/stats/teams/${r.year}`}>{r.year}</a>, by: (r) => r.year },
        { key: "rec", label: "W-L", className: "num", cell: (r) => `${r.w}-${r.l}`, by: (r) => r.w - r.l },
        { key: "rank", label: "Final AP", className: "num", cell: (r) => (r.champion ? <b>Champion</b> : r.final_rank ?? ""), by: (r) => (r.champion ? 0 : r.final_rank), asc: true },
        { key: "pf", label: "PF/G", className: "num", cell: (r) => per(r.pf, r.gp), by: (r) => r.pf / r.gp },
        { key: "pa", label: "PA/G", className: "num", cell: (r) => per(r.pa, r.gp), by: (r) => r.pa / r.gp, asc: true },
        { key: "oy", label: "Yds/G", className: "num", title: "Total yards per game", cell: (r) => per(yardsOf(r.off), r.gp), by: (r) => yardsOf(r.off) / r.gp },
        { key: "dy", label: "Opp yds/G", className: "num", title: "Yards allowed per game", cell: (r) => per(yardsOf(r.def), r.gp), by: (r) => yardsOf(r.def) / r.gp, asc: true },
        { key: "to", label: "TO margin", className: "num", cell: (r) => (r.off.takeaways ?? 0) - (r.off.turnovers ?? 0), by: (r) => (r.off.takeaways ?? 0) - (r.off.turnovers ?? 0) },
      ]} />
    </Panel>
  );
}
const yardsOf = (b: Partial<Record<string, number>>) => (b.rush_yards ?? 0) + (b.pass_yards ?? 0) - (b.sack_yards ?? 0);

/** The team's season stats by category, sortable. */
function TeamStats({ rows }: { rows: StatRow[] }) {
  const { id } = useLeague();
  const cats = catsWith(rows);
  const [cat, setCat] = useState("passing");
  const cur = cats.find((x) => x.key === cat) ?? cats[0];
  if (!cur) return null;
  return (
    <Panel title="Season stats">
      <CatTabs cats={cats} cat={cur.key} setCat={setCat} />
      <StatsTable rows={rows} line={(r) => r} cat={cur} rowKey={(r) => r.pid} rank={false} limit={12}
        lead={[{ key: "name", label: "Player", cell: (r) => <><a href={`#/l/${id}/player/${r.pid}`}>{r.name}</a> <span className="muted small">{r.pos}</span></>, by: (r) => r.name }]} />
    </Panel>
  );
}

export function TeamPage({ tid, tab = "home" }: { tid: number; tab?: string }) {
  const { id } = useLeague();
  const data = useData(() => api.team(id, tid), [tid]);
  const stories = useData(() => api.news(id, { team: String(tid), kind: "story", limit: "6" }), [tid]);
  const [sort, setSort] = useState<"pos" | "name" | "class" | "jersey">("pos");
  const roster = useMemo(() => {
    const r = (data?.roster ?? []).slice();
    const cls = ["FR", "SO", "JR", "SR"];
    r.sort((a: Player, b: Player) =>
      sort === "name" ? a.last.localeCompare(b.last) :
      sort === "class" ? cls.indexOf(b.class) - cls.indexOf(a.class) :
      sort === "jersey" ? (a.jersey ?? 999) - (b.jersey ?? 999) :
      (POS_ORDER.indexOf(a.pos) + 99) % 99 - (POS_ORDER.indexOf(b.pos) + 99) % 99 || a.last.localeCompare(b.last));
    return r;
  }, [data, sort]);
  if (!data) return <p className="muted">Loading...</p>;
  const t = data.team;
  const fin = data.games.filter((g) => g.status === "final");
  const w = fin.filter((g) => (g.home_id === tid) === (g.home_score! > g.away_score!)).length;
  return (
    <div>
      <div className="teamhead" style={{ background: t.color, color: onColor(t.color), borderBottomColor: t.alt_color }}>
        <Logo team={t} size={72} />
        <div>
          <h1>{data.rank ? <span className="rank big">{data.rank}</span> : null}{t.school} {t.mascot}</h1>
          <div>{t.conference}{t.division ? ` (${t.division})` : ""} · {w}-{fin.length - w} · {t.level.toUpperCase()}</div>
          <div className="small">{t.venue.name}, {t.venue.city}, {t.venue.state}{t.venue.capacity ? ` · capacity ${t.venue.capacity.toLocaleString()}` : ""}{t.venue.elevation_m ? ` · elevation ${Math.round(t.venue.elevation_m * 3.281).toLocaleString()} ft` : ""}</div>
        </div>
        <div className="power" title="Expected margin against an average FBS team on a neutral field">Strength {data.power >= 0 ? "+" : ""}{data.power?.toFixed(1)}</div>
      </div>
      <div className="pagetabs">
        <button className={tab !== "stats" ? "on" : ""} onClick={() => go("l", id, "team", tid)}>Overview</button>
        <button className={tab === "stats" ? "on" : ""} onClick={() => go("l", id, "team", tid, "stats")}>Stats</button>
      </div>
      {tab === "stats" ? <TeamStatsTab tid={tid} level={t.level} /> : <div className="cols">
        <div>
          <Panel title="Schedule"><GameTable games={data.games} showDate /></Panel>
          {data.players.length ? (
            <Panel title={`Roster (${data.players.length})`} right={<a href={`#/l/${id}/depth/${tid}`}>Depth chart</a>}>
              <RosterTable players={data.players} depth={data.depth} injuries={data.injuries} personas={data.personas} />
            </Panel>
          ) : (
            <Panel title={`Roster (${data.roster.length})`} right={
              <select value={sort} onChange={(e) => setSort(e.target.value as never)}>
                <option value="pos">By position</option><option value="name">By name</option><option value="class">By class</option><option value="jersey">By number</option>
              </select>}>
              <table className="grid tight">
                <thead><tr><th>#</th><th>Name</th><th>Pos</th><th>Class</th><th>Ht</th><th>Wt</th><th>Hometown</th></tr></thead>
                <tbody>{roster.map((p) => (
                  <tr key={String(p.id)}><td className="num muted">{p.jersey ?? ""}</td><td>{p.first} {p.last}</td><td>{p.pos}</td><td>{p.class}</td>
                    <td>{heightStr(p.height)}</td><td>{p.weight ?? ""}</td><td className="muted">{[p.home.city, p.home.state].filter(Boolean).join(", ")}</td></tr>
                ))}</tbody>
              </table>
            </Panel>
          )}
        </div>
        <div>
          <Panel title="Staff">
            {data.staff ? (
              <table className="grid tight"><tbody>{data.staff.map((c) => (
                <tr key={c.id}><td>{ROLE[c.role!]}</td><td><a href={`#/l/${id}/coach/${c.id}`}>{c.first} {c.last}</a>{c.user && <span className="muted small"> (you)</span>}</td>
                  <td className="muted small">{c.role === "HC" && c.hc_record.w + c.hc_record.l ? `${c.hc_record.w}-${c.hc_record.l} career` : `since ${c.since}`}</td></tr>
              ))}</tbody></table>
            ) : <table className="grid tight"><tbody>{data.coaches.map((c, i) => {
              const recs = c.career.reduce((a, s) => ({ w: a.w + s.wins, l: a.l + s.losses }), { w: 0, l: 0 });
              return (
                <tr key={i}><td>{ROLE[c.role]}</td><td>{c.first} {c.last}</td>
                  <td className="muted small">{(c.source as string) === "you" ? "you" : c.role === "HC" && c.career.length ? `${recs.w}-${recs.l} career` : c.source === "generated" ? "generated" : c.source_url ? <a href={c.source_url} target="_blank" rel="noreferrer">source</a> : ""}</td></tr>
              );
            })}</tbody></table>}
          </Panel>
          {data.stats.length > 0 && <TeamStats rows={data.stats} />}
          {data.injuries.length > 0 && (
            <Panel title={`Injuries (${data.injuries.length})`}>
              <table className="grid tight"><tbody>{data.injuries.map((i) => (
                <tr key={i.pid}><td>{i.pos}</td><td>{playerLink(id, { id: i.pid, first: i.name, last: "" })}</td><td className="muted small">{i.type}, {outUntil(i)}</td></tr>
              ))}</tbody></table>
            </Panel>
          )}
          <Panel title="Beat coverage">{stories && <NewsList items={stories} />}</Panel>
        </div>
      </div>}
    </div>
  );
}
