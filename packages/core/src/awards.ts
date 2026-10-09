import { TEAM_FIELDS, type PlayerLine, type TeamStats } from "@cfb/engine";
import type { DefLine } from "./gameday.ts";
import type { Pos } from "./players.ts";
import type { ISODate } from "./dates.ts";

/**
 * Season stats by player and the awards built on them (M1 season polish): players of the week,
 * conference players of the year, All-Americans and the Heisman. Everything here is computed from
 * results, with no random draws, so a replayed league hands out the same awards.
 */
export type StatKey = keyof PlayerLine | keyof DefLine;
export type StatLine = Partial<Record<StatKey, number>>;
export interface PlayerSeason extends StatLine { team_id: number; gp: number }

/** A team's season: games, wins, points, and its box score totals (`off`) and its opponents' (`def`). */
export interface TeamSeason { gp: number; w: number; l: number; pf: number; pa: number; off: Partial<TeamStats>; def: Partial<TeamStats> }

/** Add one game's box scores (the team's and its opponent's) to a team season. */
export function addTeamGame(into: TeamSeason, pf: number, pa: number, mine: Partial<TeamStats>, theirs: Partial<TeamStats>): void {
  into.gp++;
  if (pf > pa) into.w++; else if (pa > pf) into.l++;
  into.pf += pf; into.pa += pa;
  for (const f of TEAM_FIELDS) {
    if (mine[f]) into.off[f] = (into.off[f] ?? 0) + mine[f]!;
    if (theirs[f]) into.def[f] = (into.def[f] ?? 0) + theirs[f]!;
  }
}

/** A player's best game since the last players of the week. */
export interface WeekLine { pid: number; team_id: number; game_id: number; won: boolean; line: StatLine }

export type AwardType = "potw_off" | "potw_def" | "conf_potw_off" | "conf_potw_def" | "conf_poy_off" | "conf_poy_def" | "all_american" | "heisman" | "heisman_finalist";
export interface Award {
  type: AwardType; year: number; date: ISODate; pid: number; team_id: number; name: string; pos: Pos;
  conference?: string; /** All-Americans: first or second team. */ team?: 1 | 2; /** Heisman points. */ points?: number;
  line: string;
}

export const AWARD_NAMES: Record<AwardType, string> = {
  potw_off: "Offensive player of the week", potw_def: "Defensive player of the week",
  conf_potw_off: "Conference offensive player of the week", conf_potw_def: "Conference defensive player of the week",
  conf_poy_off: "Conference offensive player of the year", conf_poy_def: "Conference defensive player of the year",
  all_american: "All-American", heisman: "Heisman Trophy", heisman_finalist: "Heisman finalist",
};

export function addLine(into: StatLine, line: StatLine): void {
  for (const [k, v] of Object.entries(line) as [StatKey, number][]) {
    if (!v) continue;
    if (k === "rush_long" || k === "rec_long" || k === "fg_long") into[k] = Math.max(into[k] ?? 0, v);
    else into[k] = (into[k] ?? 0) + v;
  }
}

const n = (x: number | undefined) => x ?? 0;

/** Fantasy-style value of an offensive line, in points. */
export function offScore(l: StatLine): number {
  return 0.04 * n(l.pass_yds) + 4 * n(l.pass_td) - 2.5 * n(l.int) + 0.1 * n(l.rush_yds) + 6 * n(l.rush_td)
    + 0.1 * n(l.rec_yds) + 6 * n(l.rec_td) + 0.5 * n(l.rec) - 2 * n(l.fum_lost);
}
export function defScore(l: StatLine): number {
  return n(l.tkl) + 1.5 * n(l.tfl) + 3 * n(l.sacks) + 5 * n(l.def_int) + 1.5 * n(l.pd) + 3 * n(l.ff);
}
export function kickScore(l: StatLine): number {
  return 3 * n(l.fgm) - 2 * (n(l.fga) - n(l.fgm)) + 0.5 * n(l.xpm) + 0.05 * n(l.fg_long);
}

/** "24/31, 312 yds, 3 TD, 1 INT · 8 car, 41 yds" */
export function lineText(l: StatLine): string {
  const parts: string[] = [];
  if (n(l.att)) parts.push(`${n(l.cmp)}/${n(l.att)}, ${n(l.pass_yds)} pass yds${n(l.pass_td) ? `, ${n(l.pass_td)} TD` : ""}${n(l.int) ? `, ${n(l.int)} INT` : ""}`);
  if (n(l.car) && (n(l.rush_yds) >= 20 || n(l.rush_td) || !parts.length)) parts.push(`${n(l.car)} car, ${n(l.rush_yds)} rush yds${n(l.rush_td) ? `, ${n(l.rush_td)} TD` : ""}`);
  if (n(l.rec)) parts.push(`${n(l.rec)} rec, ${n(l.rec_yds)} yds${n(l.rec_td) ? `, ${n(l.rec_td)} TD` : ""}`);
  const d: string[] = [];
  if (n(l.tkl)) d.push(`${n(l.tkl)} tkl`);
  if (n(l.tfl)) d.push(`${n(l.tfl)} TFL`);
  if (n(l.sacks)) d.push(`${n(l.sacks)} sack${n(l.sacks) > 1 ? "s" : ""}`);
  if (n(l.def_int)) d.push(`${n(l.def_int)} INT`);
  if (n(l.pd) > n(l.def_int)) d.push(`${n(l.pd)} PD`);
  if (n(l.ff)) d.push(`${n(l.ff)} FF`);
  if (d.length) parts.push(d.join(", "));
  if (n(l.fga)) parts.push(`${n(l.fgm)}/${n(l.fga)} FG${n(l.fg_long) ? `, long ${n(l.fg_long)}` : ""}`);
  return parts.join(" · ");
}

export const DEF_POS = new Set<Pos>(["DE", "DT", "LB", "CB", "S"]);
export const OFF_POS = new Set<Pos>(["QB", "RB", "WR", "TE"]);

/** All-American slots, in the order the team is listed. */
export const AA_SLOTS: [Pos, number][] = [
  ["QB", 1], ["RB", 2], ["WR", 3], ["TE", 1], ["OL", 5], ["DE", 2], ["DT", 2], ["LB", 3], ["CB", 2], ["S", 2], ["K", 1], ["P", 1],
];
