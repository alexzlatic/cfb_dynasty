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
export function StatsTable<T>({ rows, line, cat, lead, rowKey, rowClass, perGame = false, limit = 200, rank = true, gp = true, empty = "No stats yet." }: {
  rows: T[]; line: (r: T) => Line; cat: StatCat; lead: Col<T>[]; rowKey: (r: T) => React.Key; rowClass?: (r: T) => string | undefined;
  perGame?: boolean; limit?: number; rank?: boolean; gp?: boolean; empty?: string;
}) {
  const [more, setMore] = useState(false);
  const leadCol = cat.cols.find((x) => x.key === cat.lead)!;
  const shown = useMemo(() => rows.filter((x) => cat.has(line(x)))
    .map((x) => ({ x, k: statValue(leadCol, line(x), perGame) ?? -Infinity }))
    .sort((a, b) => b.k - a.k).map((y) => y.x), [rows, cat, perGame]); // eslint-disable-line react-hooks/exhaustive-deps
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
