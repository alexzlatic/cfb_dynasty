import { hashGauss } from "./recruiting.ts";
import type { Pos } from "./players.ts";

/**
 * The NFL draft (M3 step 4). In January, players with eligibility left decide whether to declare: the
 * higher the NFL would take them and the less they're paid to stay, the likelier. In April, the 257 picks
 * come from everyone leaving college (seniors and graduates plus the early entrants), by their true
 * ratings with what the NFL values at each position and a little disagreement among teams. A school's
 * picks over the last three drafts add to how recruits see it.
 */

/** Picks in each round (2025's, with compensatory picks): 257 in all. */
export const ROUND_SIZES = [32, 32, 38, 36, 38, 40, 41];
export const PICKS = ROUND_SIZES.reduce((a, b) => a + b, 0);

/**
 * What the NFL adds to an overall at each position (points). Set so the drafted positions match real
 * drafts (2020-2026: offensive linemen about 19%, receivers 14%, defensive tackles, edge rushers and
 * corners about 10% each, then linebackers, tight ends and safeties; few running backs and quarterbacks;
 * a kicker or punter or two).
 */
export const POS_VALUE: Record<Pos, number> = { QB: 1, RB: -1, WR: 2.2, TE: 3, OL: 4, DE: 0.5, DT: 0.5, LB: -1.5, CB: 0, S: -2, K: -14, P: -13, LS: -25 };
/**
 * What the NFL takes off for the level he played at (power, Group of Five, FCS), set so the share of picks
 * from power programs (80-92% in 2023-2026) and from FCS schools (5-15) match. FCS ratings are already on
 * their own level's scale, so only the Group of Five is discounted.
 */
export const LEVEL_VALUE = [0, -3, 0];

/** The 32 NFL teams; each year's order is shuffled (stand-in for last season's standings). */
export const NFL_TEAMS = ["Arizona", "Atlanta", "Baltimore", "Buffalo", "Carolina", "Chicago", "Cincinnati", "Cleveland", "Dallas", "Denver",
  "Detroit", "Green Bay", "Houston", "Indianapolis", "Jacksonville", "Kansas City", "Las Vegas", "LA Chargers", "LA Rams", "Miami", "Minnesota",
  "New England", "New Orleans", "NY Giants", "NY Jets", "Philadelphia", "Pittsburgh", "San Francisco", "Seattle", "Tampa Bay", "Tennessee", "Washington"];

/** A draft prospect: anyone leaving college for the draft, with what the NFL sees. */
export interface DraftEntrant { pid: number; team_id: number; name: string; pos: Pos; ovr: number; potential: number; years: number; early: boolean; tier: 0 | 1 | 2 }
export interface DraftPick { pick: number; round: number; nfl: string; pid: number; team_id: number; name: string; pos: Pos; ovr: number; early: boolean }

/**
 * How the NFL grades a player: his overall, what his position is worth, some of his remaining upside
 * (more for the young), and teams' own disagreement about him.
 */
export function draftGrade(e: { pid: number; pos: Pos; ovr: number; potential: number; years: number; tier: 0 | 1 | 2 }, seed: number, year: number): number {
  const upside = Math.max(0, e.potential - e.ovr) * (e.years <= 3 ? 0.35 : 0.15);
  return e.ovr + POS_VALUE[e.pos] + LEVEL_VALUE[e.tier] + upside + 2 * hashGauss(seed, year, e.pid, 77);
}

/**
 * The chance a player with eligibility left (a junior, or a fourth-year player with a redshirt year) declares: by where he'd be drafted (his place among this
 * year's draft-eligible players) and what staying pays against an NFL rookie's pay at that slot.
 */
export function declareChance(slot: number, pay: number): number {
  const base = slot <= 32 ? 0.95 : slot <= 100 ? 0.8 : slot <= PICKS ? 0.5 : slot <= 400 ? 0.12 : 0.02;
  const rookie = slot <= 32 ? 4_000_000 : slot <= 64 ? 1_900_000 : slot <= PICKS ? 1_100_000 : 900_000;
  // College pay at half a rookie deal or more starts to keep him (a bird in hand, and another year to rise).
  const keep = 1 / (1 + 1.5 * Math.max(0, pay / rookie - 0.5));
  return base * keep;
}

/** The draft: the year's NFL order, and every pick in grade order. */
export function runDraft(entrants: DraftEntrant[], seed: number, year: number): DraftPick[] {
  const graded = entrants.map((e) => ({ e, g: draftGrade(e, seed, year) })).sort((a, b) => b.g - a.g || a.e.pid - b.e.pid);
  const order = NFL_TEAMS.map((t, i) => ({ t, k: hashGauss(seed, year, i, 32) })).sort((a, b) => a.k - b.k).map((x) => x.t);
  const out: DraftPick[] = [];
  let round = 1, inRound = 0;
  for (const { e } of graded.slice(0, PICKS)) {
    if (inRound >= ROUND_SIZES[round - 1]) { round++; inRound = 0; }
    out.push({ pick: out.length + 1, round, nfl: order[inRound % 32], pid: e.pid, team_id: e.team_id, name: e.name, pos: e.pos, ovr: e.ovr, early: e.early });
    inRound++;
  }
  return out;
}

/**
 * What a school's recent drafts add to its standing with recruits (prestige points): picks a year over the
 * last three drafts against an average power program's (about 3), up to 4 points for the top factories.
 */
export function draftPrestige(history: number[] | undefined): number {
  if (!history?.length) return 0;
  const avg = history.reduce((a, b) => a + b, 0) / history.length;
  return Math.round(Math.max(-1.5, Math.min(4, 0.5 * (avg - 3))) * 10) / 10;
}
