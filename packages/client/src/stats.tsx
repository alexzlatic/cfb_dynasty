import React, { useMemo, useState } from "react";
import { SortTable, type Col } from "./sort.tsx";

/**
 * Stat books shared by every stats screen: the Stats section, team pages, the transfer portal and recruits'
 * high school lines. A line is any bag of counting stats keyed like the box score (`pass_yds`, `tkl`, ...),
 * with `gp` for games played; columns derive rates (completion %, yards per carry) from it.
 */
export type Line = { gp?: number };

/** One stat column: what it shows for a line, and whether it's a counting stat (divided by games in per-game views). */
export interface StatCol {
  key: string; label: string; title?: string;
  get: (l: Line) => number | null;
  /** Decimal places shown (counting stats show whole numbers unless per game). */
  dp?: number; pct?: boolean;
  /** A total that per-game views divide by games played. */
  count?: boolean;
  /** Lower is better: first click sorts low to high. */
  asc?: boolean;
}

/** A category of stats (Passing, Rushing, ...): its columns, the stat it's led by and who counts as having a line in it. */
export interface StatCat {
  key: string; label: string; cols: StatCol[]; lead: string;
  has: (l: Line) => boolean;
  /** Enough volume to rank on rates (per team game): NCAA-style minimums. */
  qualified?: (l: Line, teamGames: number) => boolean;
}

/** A stat from a line (0 when missing). */
export const v = (l: Line, k: string): number => ((l as Record<string, unknown>)[k] as number | undefined) ?? 0;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);
const c = (key: string, label: string, title?: string, extra: Partial<StatCol> = {}): StatCol => ({ key, label, title, get: (l) => v(l, key), count: true, ...extra });
const r = (key: string, label: string, get: (l: Line) => number | null, title?: string, extra: Partial<StatCol> = {}): StatCol => ({ key, label, title, get, dp: 1, ...extra });

/** NCAA passer efficiency: (8.4 yds + 330 TD + 100 cmp - 200 int) / att. */
export const passerRating = (l: Line) => ratio(8.4 * v(l, "pass_yds") + 330 * v(l, "pass_td") + 100 * v(l, "cmp") - 200 * v(l, "int"), v(l, "att"));

export const PLAYER_CATS: StatCat[] = [
  {
    key: "passing", label: "Passing", lead: "pass_yds", has: (l) => v(l, "att") > 0, qualified: (l, g) => v(l, "att") >= 15 * g,
    cols: [c("cmp", "Cmp", "Completions"), c("att", "Att", "Attempts"), r("cmp_pct", "Pct", (l) => ratio(100 * v(l, "cmp"), v(l, "att")), "Completion percentage", { pct: true }),
      c("pass_yds", "Yds", "Passing yards"), r("ypa", "Y/A", (l) => ratio(v(l, "pass_yds"), v(l, "att")), "Yards per attempt"),
      c("pass_td", "TD", "Touchdown passes"), c("int", "Int", "Interceptions thrown", { asc: true }),
      r("td_pct", "TD%", (l) => ratio(100 * v(l, "pass_td"), v(l, "att")), "Touchdown passes per 100 attempts", { pct: true }),
      r("int_pct", "Int%", (l) => ratio(100 * v(l, "int"), v(l, "att")), "Interceptions per 100 attempts", { pct: true, asc: true }),
      c("sacked", "Sck", "Times sacked", { asc: true }), r("rating", "Rate", passerRating, "NCAA passer efficiency rating")],
  },
  {
    key: "rushing", label: "Rushing", lead: "rush_yds", has: (l) => v(l, "car") > 0, qualified: (l, g) => v(l, "car") >= 6.25 * g,
    cols: [c("car", "Car", "Carries"), c("rush_yds", "Yds", "Rushing yards"), r("ypc", "Avg", (l) => ratio(v(l, "rush_yds"), v(l, "car")), "Yards per carry"),
      c("rush_td", "TD", "Rushing touchdowns"), c("rush_long", "Long", "Longest run", { count: false }), c("fum_lost", "FL", "Fumbles lost", { asc: true })],
  },
  {
    key: "receiving", label: "Receiving", lead: "rec_yds", has: (l) => v(l, "tgt") > 0 || v(l, "rec") > 0, qualified: (l, g) => v(l, "rec") >= 1.875 * g,
    cols: [c("tgt", "Tgt", "Targets"), c("rec", "Rec", "Receptions"), r("catch_pct", "Ctch%", (l) => ratio(100 * v(l, "rec"), v(l, "tgt")), "Catch rate", { pct: true }),
      c("rec_yds", "Yds", "Receiving yards"), r("ypr", "Y/R", (l) => ratio(v(l, "rec_yds"), v(l, "rec")), "Yards per reception"),
      r("ypt", "Y/Tgt", (l) => ratio(v(l, "rec_yds"), v(l, "tgt")), "Yards per target"), c("rec_td", "TD", "Receiving touchdowns"), c("rec_long", "Long", "Longest reception", { count: false })],
  },
  {
    key: "scrimmage", label: "Scrimmage", lead: "scrim_yds", has: (l) => v(l, "car") + v(l, "rec") > 0,
    cols: [c("touches", "Tch", "Carries plus receptions", { get: (l) => v(l, "car") + v(l, "rec") }),
      c("scrim_yds", "Yds", "Rushing plus receiving yards", { get: (l) => v(l, "rush_yds") + v(l, "rec_yds") }),
      r("ypt_s", "Y/Tch", (l) => ratio(v(l, "rush_yds") + v(l, "rec_yds"), v(l, "car") + v(l, "rec")), "Yards per touch"),
      c("scrim_td", "TD", "Rushing plus receiving touchdowns", { get: (l) => v(l, "rush_td") + v(l, "rec_td") }), c("fum_lost", "FL", "Fumbles lost", { asc: true })],
  },
  {
    key: "defense", label: "Defense", lead: "tkl", has: (l) => ["tkl", "tfl", "sacks", "def_int", "pd", "ff"].some((k) => v(l, k) > 0),
    cols: [c("tkl", "Tkl", "Tackles"), c("tfl", "TFL", "Tackles for loss", { dp: 1 }), c("sacks", "Sck", "Sacks", { dp: 1 }), c("def_int", "Int", "Interceptions"),
      c("pd", "PD", "Passes defended (interceptions plus breakups)"), c("ff", "FF", "Forced fumbles")],
  },
  {
    key: "kicking", label: "Kicking", lead: "fgm", has: (l) => v(l, "fga") + v(l, "xpa") > 0, qualified: (l, g) => v(l, "fga") >= 0.8 * g,
    cols: [c("fgm", "FGM", "Field goals made"), c("fga", "FGA", "Field goals tried"), r("fg_pct", "FG%", (l) => ratio(100 * v(l, "fgm"), v(l, "fga")), "Field goal percentage", { pct: true }),
      c("fg_long", "Long", "Longest field goal", { count: false }), c("xpm", "XPM", "Extra points made"), c("xpa", "XPA", "Extra points tried"),
      r("xp_pct", "XP%", (l) => ratio(100 * v(l, "xpm"), v(l, "xpa")), "Extra point percentage", { pct: true }),
      c("k_pts", "Pts", "Points kicked", { get: (l) => 3 * v(l, "fgm") + v(l, "xpm") })],
  },
];
export const playerCat = (key: string) => PLAYER_CATS.find((x) => x.key === key) ?? PLAYER_CATS[0];

/** The categories a set of lines has anything in, in catalog order. */
export const catsWith = (lines: Line[], cats: StatCat[] = PLAYER_CATS) => cats.filter((x) => lines.some((l) => x.has(l)));

/** A column's value: per game when asked and it's a total. */
export function statValue(col: StatCol, l: Line, perGame = false): number | null {
  const x = col.get(l);
  if (x == null) return null;
  return perGame && col.count ? (l.gp ? x / l.gp : null) : x;
}

/** Add lines together (longest plays keep the longest). */
export function sumLines<T extends Line>(lines: T[]): Line {
  const o: Record<string, number> = {};
  for (const l of lines) for (const [k, x] of Object.entries(l)) {
    if (typeof x !== "number" || k === "team_id" || k === "year" || k === "pid") continue;
    o[k] = k.endsWith("_long") ? Math.max(o[k] ?? 0, x) : (o[k] ?? 0) + x;
  }
  return o;
}

export function fmtStat(col: StatCol, x: number | null, perGame = false): string {
  if (x == null) return "-";
  const dp = perGame && col.count ? 1 : col.dp ?? 0;
  // Half sacks show as .5; whole ones without decimals.
  if (col.dp && col.count && !perGame && Number.isInteger(x)) return String(x);
  return dp ? x.toFixed(dp) : Math.round(x).toLocaleString();
}

/** A category's stat columns as SortTable columns (lead columns, like the player's name, come from the caller). */
export function statCols<T>(cat: StatCat, line: (r: T) => Line, opts: { perGame?: boolean; gp?: boolean } = {}): Col<T>[] {
  const pg = !!opts.perGame;
  const cols: Col<T>[] = opts.gp === false ? [] : [{ key: "gp", label: "G", className: "num", title: "Games played", cell: (r) => line(r).gp ?? 0, by: (r) => line(r).gp ?? 0 }];
  for (const col of cat.cols) {
    cols.push({
      key: col.key, label: col.label, title: col.title + (pg && col.count ? " per game" : ""), className: "num" + (col.key === cat.lead ? " lead" : ""), asc: col.asc,
      cell: (r) => fmtStat(col, statValue(col, line(r), pg), pg), by: (r) => statValue(col, line(r), pg),
    });
  }
  return cols;
}

/** Category tabs plus totals/per-game, as a compact segmented control. */
export function CatTabs({ cats, cat, setCat, perGame, setPerGame }: {
  cats: StatCat[]; cat: string; setCat: (k: string) => void; perGame?: boolean; setPerGame?: (b: boolean) => void;
}) {
  return (
    <div className="stat-tabs">
      <span className="seg">{cats.map((x) => <button key={x.key} className={x.key === cat ? "on" : ""} onClick={() => setCat(x.key)}>{x.label}</button>)}</span>
      {setPerGame && <span className="seg">
        <button className={!perGame ? "on" : ""} onClick={() => setPerGame(false)}>Totals</button>
        <button className={perGame ? "on" : ""} onClick={() => setPerGame(true)}>Per game</button>
      </span>}
    </div>
  );
}

/**
 * A sortable stats table for one category: `lead` columns identify the row (player, school, stars...), then the
 * category's stats. Rows with nothing in the category drop out; the table opens sorted by the category's lead stat.
 */
export function StatsTable<T>({ rows, line, cat, lead, rowKey, rowClass, perGame = false, limit = 200, rank = true, gp = true, keepOrder = false, empty = "No stats yet." }: {
  rows: T[]; line: (r: T) => Line; cat: StatCat; lead: Col<T>[]; rowKey: (r: T) => React.Key; rowClass?: (r: T) => string | undefined;
  perGame?: boolean; limit?: number; rank?: boolean; gp?: boolean; /** keep the incoming order (a career by season) instead of leading with the best */ keepOrder?: boolean; empty?: string;
}) {
  const [more, setMore] = useState(false);
  const leadCol = cat.cols.find((x) => x.key === cat.lead)!;
  const shown = useMemo(() => keepOrder ? rows.filter((x) => cat.has(line(x))) : rows.filter((x) => cat.has(line(x)))
    .map((x) => ({ x, k: statValue(leadCol, line(x), perGame) }))
    // Best first by the lead stat (lowest first when less is better); rows without it go last.
    .sort((a, b) => (a.k == null ? 1 : 0) - (b.k == null ? 1 : 0) || (leadCol.asc ? a.k! - b.k! : b.k! - a.k!)).map((y) => y.x), [rows, cat, perGame, keepOrder]); // eslint-disable-line react-hooks/exhaustive-deps
  const cols: Col<T>[] = [
    ...(rank ? [{ key: "_rank", label: "#", className: "num muted", cell: (_: T, i: number) => i + 1 } as Col<T>] : []),
    ...lead, ...statCols(cat, line, { perGame, gp }),
  ];
  if (!shown.length) return <p className="muted small">{empty}</p>;
  const cut = more ? shown : shown.slice(0, limit);
  return (
    <>
      <div className="scrollx"><SortTable key={cat.key + String(perGame)} rows={cut} cols={cols} rowKey={rowKey} rowClass={rowClass} className="grid tight stats" /></div>
      {shown.length > cut.length && <p className="small"><button className="link" onClick={() => setMore(true)}>Show all {shown.length}</button></p>}
    </>
  );
}

/** Text filters shared by stats screens: name search, position, class and minimum games. */
export interface StatFilter { q: string; pos: string; cls: string; minGp: number; qualified: boolean }
export const NO_FILTER: StatFilter = { q: "", pos: "", cls: "", minGp: 0, qualified: false };

export function useStatFilter(init: Partial<StatFilter> = {}) {
  const [f, setF] = useState<StatFilter>({ ...NO_FILTER, ...init });
  const set = (p: Partial<StatFilter>) => setF((x) => ({ ...x, ...p }));
  return { f, set };
}

/** Does a player row pass the filter? (`teamGames` for the qualified check, when the category has one.) */
export function passes(f: StatFilter, p: { name: string; pos: string; class?: string }, l: Line, cat: StatCat, teamGames?: number): boolean {
  if (f.q && !p.name.toLowerCase().includes(f.q.toLowerCase())) return false;
  if (f.pos && p.pos !== f.pos) return false;
  if (f.cls && p.class !== f.cls) return false;
  if ((l.gp ?? 0) < f.minGp) return false;
  if (f.qualified && cat.qualified && teamGames != null && !cat.qualified(l, teamGames)) return false;
  return true;
}

export function StatFilters({ f, set, positions, classes = ["FR", "SO", "JR", "SR"], qualified = true, children }: {
  f: StatFilter; set: (p: Partial<StatFilter>) => void; positions: string[]; classes?: string[]; qualified?: boolean; children?: React.ReactNode;
}) {
  return (
    <div className="toolbar small">
      <input type="text" placeholder="Search players" value={f.q} onChange={(e) => set({ q: e.target.value })} />
      <select value={f.pos} onChange={(e) => set({ pos: e.target.value })}><option value="">All positions</option>{positions.map((p) => <option key={p}>{p}</option>)}</select>
      {classes.length > 0 && <select value={f.cls} onChange={(e) => set({ cls: e.target.value })}><option value="">All classes</option>{classes.map((x) => <option key={x}>{x}</option>)}</select>}
      <label>Min games <input type="number" min={0} style={{ width: "4em" }} value={f.minGp} onChange={(e) => set({ minGp: Math.max(0, Number(e.target.value) || 0) })} /></label>
      {qualified && <label title="Enough volume to rank on rates: 15 attempts, 6.25 carries, 1.875 catches or 0.8 field goal tries per team game">
        <input type="checkbox" checked={f.qualified} onChange={(e) => set({ qualified: e.target.checked })} /> Qualified only</label>}
      {children}
    </div>
  );
}

// ---- teams ----------------------------------------------------------------------------------------

/**
 * A team's season as one flat line: `gp`, `w`, `l`, `pf`, `pa`, its box score totals as `o_<field>` and its
 * opponents' as `d_<field>` (so the same columns read offense or defense).
 */
export function teamLine(t: { gp: number; w: number; l: number; pf: number; pa: number; off: object; def: object }): Line {
  const o: Record<string, number> = { gp: t.gp, w: t.w, l: t.l, pf: t.pf, pa: t.pa };
  for (const [k, x] of Object.entries(t.off)) o["o_" + k] = x as number;
  for (const [k, x] of Object.entries(t.def)) o["d_" + k] = x as number;
  return o;
}

const yds = (l: Line, s: string) => v(l, s + "rush_yards") + v(l, s + "pass_yards") - v(l, s + "sack_yards");
const plays = (l: Line, s: string) => v(l, s + "rush_att") + v(l, s + "pass_att") + v(l, s + "sacks_taken");

/** Offense (s = "o_") or the defense, read from what opponents did (s = "d_"; less is better). */
function sideCols(s: "o_" | "d_"): StatCol[] {
  const def = s === "d_", lo = { asc: def };
  return [
    c(s + "pts", def ? "PA" : "PF", def ? "Points allowed" : "Points scored", { get: (l) => v(l, def ? "pa" : "pf"), ...lo }),
    c(s + "plays", "Plays", "Scrimmage plays (runs, passes, sacks)", { get: (l) => plays(l, s) }),
    c(s + "yds", "Yds", "Total yards", { get: (l) => yds(l, s), ...lo }),
    r(s + "ypp", "Y/P", (l) => ratio(yds(l, s), plays(l, s)), "Yards per play", { dp: 2, ...lo }),
    c(s + "rush_att", "Rush", "Rushing attempts"),
    c(s + "rush_yards", "RYds", "Rushing yards", lo),
    r(s + "ypc", "YPC", (l) => ratio(v(l, s + "rush_yards"), v(l, s + "rush_att")), "Yards per carry", lo),
    c(s + "completions", "Cmp", "Completions", lo), c(s + "pass_att", "Att", "Pass attempts"),
    r(s + "cmp_pct", "Pct", (l) => ratio(100 * v(l, s + "completions"), v(l, s + "pass_att")), "Completion percentage", lo),
    c(s + "net_pass", "PYds", "Net passing yards (less sack yards)", { get: (l) => v(l, s + "pass_yards") - v(l, s + "sack_yards"), ...lo }),
    r(s + "ypa", "Y/A", (l) => ratio(v(l, s + "pass_yards"), v(l, s + "pass_att")), "Yards per pass attempt", lo),
    c(s + "first_downs", "1st", "First downs", lo),
    r(s + "success", "Succ%", (l) => ratio(100 * v(l, s + "success"), plays(l, s)), "Success rate: plays that gain enough to stay on schedule", { pct: true, ...lo }),
    c(s + "explosive", "Expl", "Explosive plays (runs of 12+, passes of 20+)", lo),
    c(s + "tds", "TD", "Touchdowns", lo),
  ];
}
const pctOf = (key: string, label: string, made: string, att: string, title: string, asc = false) => r(key, label, (l) => ratio(100 * v(l, made), v(l, att)), title, { pct: true, asc });

export const TEAM_CATS: StatCat[] = [
  { key: "offense", label: "Offense", lead: "o_yds", has: () => true, cols: sideCols("o_") },
  { key: "defense", label: "Defense", lead: "d_yds", has: () => true, cols: sideCols("d_") },
  {
    key: "scoring", label: "Scoring", lead: "margin", has: () => true,
    cols: [c("w", "W", "Wins", { count: false }), c("l", "L", "Losses", { asc: true, count: false }), c("pf", "PF", "Points scored"), c("pa", "PA", "Points allowed", { asc: true }),
      c("margin", "Diff", "Point differential", { get: (l) => v(l, "pf") - v(l, "pa") }), c("o_tds", "TD", "Touchdowns"),
      c("o_fgm", "FG", "Field goals made"), c("o_def_tds", "DefTD", "Defensive touchdowns"), c("o_return_tds", "RetTD", "Kick and punt return touchdowns"),
      c("d_tds", "TD allowed", "Touchdowns allowed", { asc: true })],
  },
  {
    key: "downs", label: "Situational", lead: "third_pct", has: () => true,
    cols: [c("o_third_conv", "3rd", "Third downs converted"), c("o_third_att", "3rdAtt", "Third downs"),
      pctOf("third_pct", "3rd%", "o_third_conv", "o_third_att", "Third-down conversion rate"),
      pctOf("fourth_pct", "4th%", "o_fourth_conv", "o_fourth_att", "Fourth-down conversion rate"), c("o_fourth_att", "4thAtt", "Fourth downs gone for"),
      c("o_red_zone_trips", "RZ", "Red zone trips"), pctOf("rz_pct", "RZ TD%", "o_red_zone_tds", "o_red_zone_trips", "Red zone trips ending in a touchdown"),
      pctOf("d_third_pct", "Opp 3rd%", "d_third_conv", "d_third_att", "Opponents' third-down conversion rate", true),
      pctOf("d_rz_pct", "Opp RZ TD%", "d_red_zone_tds", "d_red_zone_trips", "Opponents' red zone touchdown rate", true),
      r("top", "TOP", (l) => ratio(v(l, "o_top_seconds") / 60, v(l, "gp") || 0), "Time of possession per game (minutes)")],
  },
  {
    key: "turnovers", label: "Turnovers", lead: "to_margin", has: () => true,
    cols: [c("o_takeaways", "Take", "Takeaways"), c("o_turnovers", "Give", "Giveaways", { asc: true }),
      c("to_margin", "Margin", "Turnover margin", { get: (l) => v(l, "o_takeaways") - v(l, "o_turnovers") }),
      c("o_ints_thrown", "Int", "Interceptions thrown", { asc: true }), c("d_ints_thrown", "DefInt", "Interceptions made"),
      c("fum", "FumL", "Fumbles lost", { get: (l) => Math.max(0, v(l, "o_turnovers") - v(l, "o_ints_thrown")), asc: true }),
      c("o_sacks", "Sacks", "Sacks made"), c("o_sacks_taken", "SacksA", "Sacks allowed", { asc: true })],
  },
  {
    key: "special", label: "Special teams", lead: "fg_pct", has: () => true,
    cols: [c("o_fgm", "FGM", "Field goals made"), c("o_fga", "FGA", "Field goals tried"), pctOf("fg_pct", "FG%", "o_fgm", "o_fga", "Field goal percentage"),
      c("o_xpm", "XPM", "Extra points made"), pctOf("xp_pct", "XP%", "o_xpm", "o_xpa", "Extra point percentage"),
      c("o_two_pt_made", "2PT", "Two-point conversions"), c("o_punts", "Punts", "Punts", { asc: true }),
      r("punt_avg", "Avg", (l) => ratio(v(l, "o_punt_yards"), v(l, "o_punts")), "Yards per punt"),
      c("o_kick_return_yards", "KR yds", "Kickoff return yards"), c("o_punt_return_yards", "PR yds", "Punt return yards"), c("o_return_tds", "RetTD", "Return touchdowns")],
  },
  {
    key: "penalties", label: "Penalties", lead: "o_penalty_yards", has: () => true,
    cols: [c("o_penalties", "Pen", "Penalties", { asc: true }), c("o_penalty_yards", "Yds", "Penalty yards", { asc: true }),
      c("d_penalties", "Opp pen", "Opponents' penalties"), c("d_penalty_yards", "Opp yds", "Opponents' penalty yards"),
      c("o_penalty_first_downs", "1st by pen", "First downs gained on opponents' penalties")],
  },
];
export const teamCat = (key: string) => TEAM_CATS.find((x) => x.key === key) ?? TEAM_CATS[0];

/** A team's national rank in a column (1 = best, by the column's direction), among `lines`. */
export function rankIn(col: StatCol, mine: Line, lines: Line[], perGame = false): number | null {
  const x = statValue(col, mine, perGame);
  if (x == null) return null;
  const better = lines.filter((l) => { const y = statValue(col, l, perGame); return y != null && (col.asc ? y < x : y > x); }).length;
  return better + 1;
}

/** A one-glance season line for a player's position: "2,410 yds, 18 TD, 6 INT" or "54 tkl, 6.5 sacks". */
export function statSummary(l: Line | null | undefined, pos: string): string {
  if (!l || !l.gp) return "";
  const n = (k: string) => v(l, k).toLocaleString();
  const by: Record<string, string> = { QB: "passing", RB: "rushing", WR: "receiving", TE: "receiving", K: "kicking" };
  const order = [by[pos], "passing", "rushing", "receiving", "defense", "kicking"].filter(Boolean);
  const cat = order.map((k) => playerCat(k)).find((x) => x.has(l));
  const g = `${l.gp} g`;
  switch (cat?.key) {
    case "passing": return `${n("pass_yds")} yds, ${n("pass_td")} TD, ${n("int")} INT · ${g}`;
    case "rushing": return `${n("car")} car, ${n("rush_yds")} yds, ${n("rush_td")} TD · ${g}`;
    case "receiving": return `${n("rec")} rec, ${n("rec_yds")} yds, ${n("rec_td")} TD · ${g}`;
    case "defense": return `${n("tkl")} tkl${v(l, "tfl") ? `, ${n("tfl")} TFL` : ""}${v(l, "sacks") ? `, ${n("sacks")} sck` : ""}${v(l, "def_int") ? `, ${n("def_int")} INT` : ""} · ${g}`;
    case "kicking": return `${n("fgm")}/${n("fga")} FG, long ${n("fg_long")} · ${g}`;
    default: return g;
  }
}
