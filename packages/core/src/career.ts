import { mixSeed } from "./hash.ts";
import type { ISODate } from "./dates.ts";
import type { Coach, Game, Team } from "./types.ts";

/**
 * Your career (M1 "Career start"): you take over as the school's real head coach or start fresh under
 * your own name. The athletic director sets expectations before the season from how good the team
 * looks, meets with you three times a year, and keeps a job-security meter. Nobody is fired in M1;
 * the meter and the meetings are the groundwork for offers and firings later.
 */
export type CareerMode = "real" | "fresh";

export interface CareerStart { mode: CareerMode; first?: string; last?: string }

export interface Expectations {
  /** Regular-season wins the AD expects (the sum of preseason win chances, rounded). */
  wins: number;
  games: number;
  /** Preseason power rank among FBS teams. */
  rank: number;
  goal: "playoff" | "conference" | "big_year" | "bowl" | "progress";
  text: string;
}

export interface Meeting { kind: "preseason" | "midseason" | "end"; date: ISODate; security: number; text: string }

export interface Career {
  mode: CareerMode;
  team_id: number;
  coach: { first: string; last: string; reputation: number };
  ad: { first: string; last: string; patience: number };
  expect: Expectations;
  /** Security when the season started, 0 to 100. */
  start: number;
  meetings: Meeting[];
  /** The day you took this job, when it was during the season (only games after it count). */
  hired?: ISODate;
  /** The day you were let go (you're out of work until a school hires you). */
  out?: ISODate;
}

/** Win chance from an expected margin (about a 15.5-point standard deviation). */
export const winChance = (margin: number) => 1 / (1 + Math.exp(-margin / 8.7));

const AD_FIRST = ["Mike", "Jennifer", "Ross", "Dan", "Chris", "Lisa", "Greg", "Troy", "Heather", "Mark", "Pat", "Whit", "Jim", "Karen", "Scott", "Desiree"];
const AD_LAST = ["Bjork", "Cohen", "Alleva", "Holder", "Garrett", "Bohn", "Byrne", "Manuel", "Coyle", "Hocutt", "Babers", "Harlan", "Stricklin", "Reed", "Moore", "Phillips"];

const clamp = (x: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, x));
const r1 = (x: number) => Math.round(x * 10) / 10;

/** A real coach's reputation from his record; a newcomer starts unknown. */
export function reputation(coach: Coach | undefined): number {
  if (!coach) return 30;
  const w = coach.career.reduce((a, c) => a + c.wins, 0), l = coach.career.reduce((a, c) => a + c.losses, 0);
  const years = coach.career.length;
  if (!(w + l)) return 35;
  const pct = w / (w + l);
  return Math.round(clamp(30 + 80 * (pct - 0.5) + 1.5 * Math.min(years, 15) + Math.min(w, 200) / 20, 15, 95));
}

/** What the AD expects from a team: expected regular-season wins from preseason power, and a goal from its rank. */
export function expectations(teamId: number, teams: Team[], games: Game[], power: Record<number, number>, hfa: number): Expectations {
  const mine = games.filter((g) => g.kind === "regular" && (g.home_id === teamId || g.away_id === teamId));
  let exp = 0;
  for (const g of mine) {
    const m = (power[g.home_id] ?? 0) - (power[g.away_id] ?? 0) + (g.neutral ? 0 : hfa);
    exp += g.home_id === teamId ? winChance(m) : 1 - winChance(m);
  }
  const fbs = teams.filter((t) => t.level === "fbs").sort((a, b) => (power[b.id] ?? 0) - (power[a.id] ?? 0) || a.id - b.id);
  const rank = fbs.findIndex((t) => t.id === teamId) + 1 || fbs.length;
  const wins = Math.round(exp);
  const [goal, text]: [Expectations["goal"], string] =
    rank <= 5 ? ["playoff", "Make the College Football Playoff."]
    : rank <= 15 ? ["conference", `Win ${wins} or more and compete for the conference title.`]
    : rank <= 35 ? ["big_year", `Win ${wins} or more and get to a good bowl.`]
    : wins >= 6 ? ["bowl", `Get to a bowl game, with ${wins} or more wins.`]
    : ["progress", `Show progress: ${wins} or more wins and a team that competes every week.`];
  return { wins, games: mine.length, rank, goal, text };
}

export function newCareer(start: CareerStart, teamId: number, coach: Coach | undefined, expect: Expectations, seed: number): Career {
  const fresh = start.mode === "fresh";
  const first = fresh ? (start.first?.trim() || "Coach") : coach?.first ?? "Coach";
  const last = fresh ? (start.last?.trim() || "You") : coach?.last ?? "";
  const rep = fresh ? 30 : reputation(coach);
  const h = mixSeed(seed, teamId, "ad");
  const ad = { first: AD_FIRST[h % AD_FIRST.length], last: AD_LAST[Math.floor(h / AD_FIRST.length) % AD_LAST.length], patience: r1(0.8 + rep / 250) };
  return { mode: start.mode, team_id: teamId, coach: { first, last, reputation: rep }, ad, expect, start: Math.round(55 + 0.3 * (rep - 50)), meetings: [] };
}

export interface SecurityStep { game_id: number; date: ISODate; delta: number; security: number; note: string }

/**
 * Job security after each of your games: a win you were expected to lose helps more than a win you
 * were expected to get, blowout losses hurt, titles and the playoff help. A patient AD (one who hired
 * a coach with a reputation) moves the meter less. End-of-season wins against the target count once
 * the regular season is over.
 */
export function securityTrail(c: Career, games: Game[], preseason: Record<number, number>, hfa: number): SecurityStep[] {
  const me = c.team_id;
  let sec = c.start;
  const out: SecurityStep[] = [];
  const mine = games.filter((g) => g.status === "final" && (g.home_id === me || g.away_id === me) && (!c.hired || g.date >= c.hired) && (!c.out || g.date < c.out)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
  let wins = 0, reg = 0;
  const regTotal = games.filter((g) => g.kind === "regular" && (g.home_id === me || g.away_id === me)).length;
  for (const g of mine) {
    const home = g.home_id === me;
    const m = (preseason[g.home_id] ?? 0) - (preseason[g.away_id] ?? 0) + (g.neutral ? 0 : hfa);
    const p = home ? winChance(m) : 1 - winChance(m);
    const diff = (home ? 1 : -1) * (g.home_score! - g.away_score!);
    const won = diff > 0;
    let d = 9 * ((won ? 1 : 0) - p);
    const notes: string[] = [];
    if (!won && diff <= -21) { d -= 2; notes.push("blowout loss"); }
    if (won && p < 0.3) notes.push("upset win");
    if (!won && p > 0.75) notes.push("upset loss");
    if (g.kind === "conf_champ" && won) { d += 5; notes.push("conference title"); }
    if (g.kind === "playoff") { d += won ? 4 : 1; notes.push(won ? "playoff win" : "playoff game"); }
    if (g.kind === "bowl") { d += won ? 2 : -1; notes.push(won ? "bowl win" : "bowl loss"); }
    if (g.kind === "regular") {
      reg++;
      if (won) wins++;
      if (reg === regTotal) {
        const v = 3 * (wins - c.expect.wins);
        d += v;
        notes.push(`${wins} regular-season wins against a target of ${c.expect.wins}`);
      }
    }
    d /= c.ad.patience;
    sec = clamp(sec + d);
    out.push({ game_id: g.id, date: g.date, delta: r1(d), security: r1(sec), note: notes.join(", ") });
  }
  return out;
}

export function securityLabel(x: number): string {
  return x >= 75 ? "Secure" : x >= 55 ? "Comfortable" : x >= 35 ? "Warm seat" : x >= 20 ? "Hot seat" : "On the brink";
}

/** What the AD says at a meeting. */
export function meetingText(c: Career, kind: Meeting["kind"], sec: number, rec: { w: number; l: number }, school: string): string {
  const ad = `${c.ad.first} ${c.ad.last}`;
  const coach = c.coach.last || c.coach.first;
  const label = securityLabel(sec).toLowerCase();
  if (kind === "preseason") {
    const intro = c.mode === "fresh" && c.meetings.length === 0
      ? `${ad} welcomes you to ${school}. "Nobody around here knows your name yet, Coach ${coach}. Let's change that."`
      : `${ad} sits down with you before the season.`;
    return `${intro} The preseason projection has ${school} at No. ${c.expect.rank} in the country. The expectation: ${c.expect.text} Job security: ${label}.`;
  }
  if (kind === "midseason") {
    const pace = rec.w >= Math.round(c.expect.wins * (rec.w + rec.l) / Math.max(1, c.expect.games));
    return `${ad} checks in at midseason with ${school} at ${rec.w}-${rec.l}. ${pace ? "\"We're right where we hoped to be. Keep it going.\"" : "\"This isn't where we expected to be. The second half matters.\""} Job security: ${label}.`;
  }
  const verdict = sec >= 75 ? "\"That's the kind of season this place expects. We'll talk about an extension.\""
    : sec >= 55 ? "\"Solid year. Let's build on it.\""
    : sec >= 35 ? "\"We need more next year. I'm behind you, but the fans are restless.\""
    : "\"I'm not making a change this year, but next season has to be better.\"";
  return `${ad} meets with you after the season. ${school} finished ${rec.w}-${rec.l} against a target of ${c.expect.wins} wins. ${verdict} Job security: ${label}.`;
}
