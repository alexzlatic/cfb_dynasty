import { useEffect, useState } from "react";
import { useLeague } from "../App.tsx";
import { api, type BoxRow, type LiveBox, type Team } from "../api.ts";
import type { TeamBox } from "@cfb/engine";
import type { Col } from "../sort.tsx";
import { StatsTable, playerCat, type Line, type StatCat } from "../stats.tsx";
import { Logo } from "../util.tsx";
import { Panel } from "./common.tsx";

const BOX_ROWS: [string, string][] = [
  ["first_downs", "First downs"], ["total_yards", "Total yards"], ["rush_att", "Rushes"], ["rush_yards", "Rushing yards"],
  ["completions", "Completions"], ["pass_att", "Pass attempts"], ["net_pass_yards", "Passing yards (net)"], ["sacks_taken", "Sacked"],
  ["ypp", "Yards per play"], ["third", "Third down"], ["fourth", "Fourth down"], ["red", "Red zone TDs"], ["turnovers", "Turnovers"],
  ["penalties", "Penalties"], ["punts", "Punts"], ["top", "Time of possession"],
];

const boxVal = (b: TeamBox, k: string) =>
  k === "third" ? `${b.third_conv}-${b.third_att}` : k === "fourth" ? `${b.fourth_conv}-${b.fourth_att}` : k === "red" ? `${b.red_zone_tds}-${b.red_zone_trips}` :
  k === "top" ? `${Math.floor(b.top_seconds / 60)}:${String(b.top_seconds % 60).padStart(2, "0")}` : k === "penalties" ? `${b.penalties}-${b.penalty_yards}` : (b as unknown as Record<string, number>)[k];

/** The season stat categories trimmed to what a single game's box shows (no per-100 rates). */
const DROP = new Set(["td_pct", "int_pct"]);
const trim = (key: string): StatCat => { const c = playerCat(key); return { ...c, cols: c.cols.filter((x) => !DROP.has(x.key)) }; };
export const BOX_CATS: StatCat[] = ["passing", "rushing", "receiving", "defense", "kicking"].map(trim);

export interface BoxSides { away: Team; home: Team; away_box: TeamBox; home_box: TeamBox; awayRows: BoxRow[]; homeRows: BoxRow[] }

/** Both teams' totals side by side (two numbers per row reads best as one table). */
export function TeamStatsTable({ s }: { s: BoxSides }) {
  return (
    <table className="grid tight boxteam"><thead><tr><th></th><th className="num"><Logo team={s.away} size={18} /> {s.away.abbr}</th><th className="num"><Logo team={s.home} size={18} /> {s.home.abbr}</th></tr></thead>
      <tbody>{BOX_ROWS.map(([k, label]) => <tr key={k}><td>{label}</td><td className="num">{boxVal(s.away_box, k)}</td><td className="num">{boxVal(s.home_box, k)}</td></tr>)}</tbody></table>
  );
}

/** Punting and returns are kept per team, not per player. */
function SpecialTable({ s }: { s: BoxSides }) {
  const rows = [s.away, s.home].map((t, i) => ({ t, b: i ? s.home_box : s.away_box }));
  return (
    <table className="grid tight stats"><thead><tr><th>Team</th><th className="num">Punts</th><th className="num">Yds</th><th className="num">Avg</th><th className="num">KR yds</th><th className="num">PR yds</th><th className="num">Ret TD</th></tr></thead>
      <tbody>{rows.map(({ t, b }) => (
        <tr key={t.id}><td><Logo team={t} size={16} /> {t.school}</td><td className="num">{b.punts}</td><td className="num">{b.punt_yards}</td>
          <td className="num">{b.punts ? (b.punt_yards / b.punts).toFixed(1) : "-"}</td><td className="num">{b.kick_return_yards}</td><td className="num">{b.punt_return_yards}</td><td className="num">{b.return_tds}</td></tr>
      ))}</tbody></table>
  );
}

/** One category for both teams, away then home, each its own sortable table. */
export function CatSection({ s, cat }: { s: BoxSides; cat: StatCat }) {
  const { id } = useLeague();
  const lead: Col<BoxRow>[] = [{
    key: "name", label: "Player", by: (r) => r.name,
    cell: (r) => <>{r.pid != null ? <a href={`#/l/${id}/player/${r.pid}`}>{r.name}</a> : r.name}{r.pos ? <span className="muted small"> {r.pos}</span> : null}</>,
  }];
  return (
    <>
      {([[s.away, s.awayRows], [s.home, s.homeRows]] as const).map(([t, rows]) => (
        <div key={t.id} className="boxteam-cat">
          <div className="boxteam-name"><Logo team={t} size={18} /> {t.school}</div>
          <StatsTable rows={rows} line={(r) => r as Line} cat={cat} lead={lead} rowKey={(r) => r.pid ?? r.name} rank={false} gp={false} limit={50} empty="None." />
        </div>
      ))}
    </>
  );
}

/** A finished game's full box: team stats, then each category (passing, rushing, ...) stacked down the page. */
export function FullBox({ s }: { s: BoxSides }) {
  return (
    <div className="boxscore">
      <Panel title="Team stats"><TeamStatsTable s={s} /></Panel>
      {BOX_CATS.map((cat) => <Panel key={cat.key} title={cat.label}><CatSection s={s} cat={cat} /></Panel>)}
      <Panel title="Punting and returns"><SpecialTable s={s} /></Panel>
    </div>
  );
}

/**
 * The box score during your game, as of the play on screen (so it never runs ahead of the field). One
 * category at a time keeps it compact next to the play-by-play.
 */
export function LiveBoxPanel({ home, away, at }: { home: Team; away: Team; at: number }) {
  const { id } = useLeague();
  const [box, setBox] = useState<LiveBox | null>(null);
  const [tab, setTab] = useState("team");
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!open) return;
    // Plays can come in quickly (instant pace, skip to now): wait for them to settle before asking.
    const t = setTimeout(() => api.liveBox(id, at).then(setBox).catch(() => {}), 200);
    return () => clearTimeout(t);
  }, [id, at, open]);
  const s: BoxSides | null = box && { away, home, away_box: box.away_box, home_box: box.home_box, awayRows: box.away, homeRows: box.home };
  const tabs = [{ key: "team", label: "Team" }, ...BOX_CATS.map((c) => ({ key: c.key, label: c.label })), { key: "special", label: "Punting" }];
  return (
    <Panel title="Box score" right={<button className="link" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</button>}>
      {open && <>
        <div className="stat-tabs"><span className="seg">{tabs.map((x) => <button key={x.key} className={x.key === tab ? "on" : ""} onClick={() => setTab(x.key)}>{x.label}</button>)}</span></div>
        {!s ? <p className="muted small">No plays yet.</p>
          : tab === "team" ? <TeamStatsTable s={s} />
          : tab === "special" ? <SpecialTable s={s} />
          : <CatSection s={s} cat={BOX_CATS.find((c) => c.key === tab)!} />}
      </>}
    </Panel>
  );
}
