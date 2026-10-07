import { Rng } from "@cfb/engine";
import { formatDate, type ISODate } from "./dates.ts";
import { mixSeed } from "./hash.ts";
import type { Voter } from "./polls.ts";
import type { Game, Player, Poll, Team } from "./types.ts";

/**
 * AP poll voters are beat writers. Every Power 4 team has its own writer (plus Notre Dame's beat),
 * each smaller conference shares two or three, and three national columnists round out the panel.
 * Names and outlets are generated. A writer's voting style sets their biases; every writer leans
 * toward the team and conference they cover.
 */
export type WriterStyle = "homer" | "brand_loyalist" | "recency_chaser" | "numbers" | "contrarian" | "steady";

export const STYLE_LABELS: Record<WriterStyle, { label: string; blurb: string }> = {
  homer: { label: "Homer", blurb: "Votes with the heart. Their team is always a little better than you think." },
  brand_loyalist: { label: "Brand loyalist", blurb: "Trusts the big names until they prove otherwise, and then some." },
  recency_chaser: { label: "Recency chaser", blurb: "Whatever happened Saturday matters most. Big swings, week to week." },
  numbers: { label: "Numbers person", blurb: "Efficiency, schedule strength, quality wins. Ignores the logo on the helmet." },
  contrarian: { label: "Contrarian", blurb: "Ballots that start arguments. Rarely agrees with the consensus." },
  steady: { label: "Steady hand", blurb: "Slow to move teams up or down. Their ballot changes least week to week." },
};

export interface Writer {
  id: number;
  first: string;
  last: string;
  outlet: string;
  beat: { kind: "team"; team_id: number } | { kind: "conference"; conference: string } | { kind: "national" };
  conference: string | null;
  style: WriterStyle;
  years_voting: number;
  alma_mater: number | null;
  hometown: string | null;
  voter: Voter;
}

const P4 = ["SEC", "Big Ten", "ACC", "Big 12"];
const PAPERS = ["Courier", "Ledger", "Sentinel", "Herald", "Record", "Dispatch Weekly", "Daily Press", "Observer", "Bulletin", "Gazette Online"];
const SITES = ["Insider", "Report", "Nation", "Huddle", "Sideline", "Illustrated", "Digest", "Beat"];
const NATIONAL = ["The Gridiron Weekly", "College Football Desk", "Saturday Report", "The Long Snapper"];

export function generateWriters(teams: Team[], rosters: Record<string, Player[]>, seed: number): Writer[] {
  const rng = new Rng(mixSeed(seed, "writers"));
  const pick = <T,>(xs: T[]): T => xs[rng.int(xs.length)];
  const u = (a: number, b: number) => a + (b - a) * rng.random();
  const firsts = new Map<string, number>(), lasts = new Map<string, number>();
  for (const r of Object.values(rosters)) for (const p of r) {
    if (/^[A-Z][a-z]{2,}$/.test(p.first)) firsts.set(p.first, (firsts.get(p.first) ?? 0) + 1);
    if (/^[A-Z][a-z]{2,}$/.test(p.last)) lasts.set(p.last, (lasts.get(p.last) ?? 0) + 1);
  }
  const fpool = [...firsts].filter(([, n]) => n >= 6).map(([k]) => k).sort();
  const lpool = [...lasts].filter(([, n]) => n >= 3).map(([k]) => k).sort();
  const fbs = teams.filter((t) => t.level === "fbs");
  const beats: Writer["beat"][] = [];
  for (const t of fbs) if (P4.includes(t.conference) || t.school === "Notre Dame") beats.push({ kind: "team", team_id: t.id });
  const confs = [...new Set(fbs.map((t) => t.conference))].filter((c) => !P4.includes(c) && c !== "FBS Independents").sort();
  for (const c of confs) {
    const n = fbs.filter((t) => t.conference === c).length;
    for (let i = 0; i < (n >= 12 ? 3 : 2); i++) beats.push({ kind: "conference", conference: c });
  }
  for (let i = 0; i < 3; i++) beats.push({ kind: "national" });

  const styles: WriterStyle[] = ["homer", "brand_loyalist", "recency_chaser", "numbers", "contrarian", "steady"];
  const weights = [0.2, 0.2, 0.17, 0.15, 0.08, 0.2];
  const byId = new Map(teams.map((t) => [t.id, t]));
  return beats.map((beat, id) => {
    let x = rng.random(), style: WriterStyle = "steady";
    for (let i = 0; i < styles.length; i++) { if (x < weights[i]) { style = styles[i]; break; } x -= weights[i]; }
    if (beat.kind === "national" && style === "homer") style = "numbers";
    const team = beat.kind === "team" ? byId.get(beat.team_id)! : null;
    const conference = beat.kind === "team" ? team!.conference : beat.kind === "conference" ? beat.conference : null;
    const confTeams = conference ? fbs.filter((t) => t.conference === conference) : fbs;
    const anchor = team ?? pick(confTeams);
    const outlet = beat.kind === "national" ? NATIONAL[id % NATIONAL.length]
      : team ? (rng.random() < 0.5 ? `${anchor.venue.city ?? anchor.school} ${pick(PAPERS)}` : `${team.mascot ?? team.school} ${pick(SITES)}`)
      : `${conference} ${pick(["Wire", "Notebook", "Digest", "Report"])}`;
    const k = (s: WriterStyle) => (style === s ? 1 : 0);
    const voter: Voter = {
      noise: u(2, 3.5) * (1 + 0.6 * k("contrarian")),
      trust: k("numbers") ? u(0.75, 0.9) : u(0.45, 0.7),
      win: u(2.6, 3.4), loss: u(-5.5, -3.8) * (1 + 0.3 * k("recency_chaser")),
      sos: k("numbers") ? u(0.14, 0.2) : u(0.06, 0.12),
      brand: k("brand_loyalist") ? u(0.12, 0.18) : k("numbers") ? u(0, 0.02) : k("contrarian") ? u(-0.03, 0.02) : u(0.03, 0.08),
      recency: k("recency_chaser") ? u(0.45, 0.65) : k("steady") ? u(0.05, 0.12) : u(0.12, 0.3),
      inertia: k("steady") ? u(0.72, 0.82) : k("recency_chaser") ? u(0.2, 0.35) : u(0.4, 0.65),
      unbeaten: k("contrarian") ? u(0, 1) : u(1, 4), margin: k("numbers") ? u(0.06, 0.1) : u(0.02, 0.06), region: 0,
      lat: anchor.venue.lat ?? 39, lon: anchor.venue.lon ?? -95,
      team_id: team?.id ?? null, conference,
      homer: team ? (k("homer") ? u(4, 7) : u(1, 2.5)) : 0,
      conf_bias: conference ? (k("homer") ? u(1.5, 3) : u(0.5, 1.5)) : 0,
    };
    const alma = rng.random() < 0.35 && team ? team.id : pick(fbs).id;
    return {
      id: id + 1, first: pick(fpool), last: pick(lpool), outlet, beat, conference, style,
      years_voting: 1 + rng.int(24), alma_mater: alma, hometown: anchor.venue.city ? `${anchor.venue.city}, ${anchor.venue.state}` : null, voter,
    };
  });
}

// ---- weekly stories -----------------------------------------------------------------------------

export interface StoryContext {
  date: ISODate;
  teams: Map<number, Team>;
  games: Game[];
  poll: Poll;
  prev: Poll | null;
  ballot: number[];
  records: Map<number, { w: number; l: number; cw: number; cl: number }>;
  stars: Record<number, string>;
  seed: number;
}

export interface Story { headline: string; body: string; team_ids: number[] }

const rankIn = (p: Poll | null, id: number) => {
  if (!p) return null;
  const i = p.ranks.findIndex((r) => r.team_id === id);
  return i >= 0 && i < 25 ? i + 1 : null;
};

export function writeStory(w: Writer, c: StoryContext): Story {
  const rng = new Rng(mixSeed(c.seed, "story", w.id, c.date));
  const pick = <T,>(xs: T[]): T => xs[rng.int(xs.length)];
  const T = (id: number) => c.teams.get(id)!;
  const weekAgo = (d: string) => d < c.date && d >= addDaysIso(c.date, -7);
  const lastGame = (id: number) => c.games.filter((g) => g.status === "final" && (g.home_id === id || g.away_id === id) && weekAgo(g.date)).at(-1) ?? null;
  const nextGame = (id: number) => c.games.find((g) => g.status !== "final" && (g.home_id === id || g.away_id === id) && g.date >= c.date) ?? null;
  const rec = (id: number) => { const r = c.records.get(id)!; return `${r.w}-${r.l}`; };
  const myRank = (id: number) => { const i = c.ballot.indexOf(id); return i >= 0 ? i + 1 : null; };
  const byline = `${w.first} ${w.last}, ${w.outlet}`;

  if (w.beat.kind === "team") {
    const t = T(w.beat.team_id);
    const g = lastGame(t.id), n = nextGame(t.id);
    const now = rankIn(c.poll, t.id), before = rankIn(c.prev, t.id), mine = myRank(t.id);
    const r = c.records.get(t.id)!;
    const parts: string[] = [];
    let headline: string;
    if (!c.prev) {
      headline = now ? pick([`${t.school} opens at No. ${now}, and the bar is set`, `Preseason No. ${now}: what ${t.school} has to prove`])
        : pick([`${t.school} starts outside the poll, and that's fine`, `Unranked ${t.school} has a point to make`]);
      parts.push(now ? `${t.school} opens the season ranked No. ${now} in the AP poll.` : `${t.school} opens the season unranked.`);
    } else if (g) {
      const home = g.home_id === t.id, us = home ? g.home_score! : g.away_score!, them = home ? g.away_score! : g.home_score!;
      const opp = T(home ? g.away_id : g.home_id);
      const won = us > them;
      const margin = Math.abs(us - them);
      headline = won
        ? margin >= 21 ? pick([`${t.school} rolls past ${opp.school}`, `${t.mascot ?? t.school} cruise by ${opp.school}, ${us}-${them}`])
          : margin <= 7 ? pick([`${t.school} survives ${opp.school}`, `${t.mascot ?? t.school} hang on, ${us}-${them}`])
          : pick([`${t.school} handles ${opp.school}, ${us}-${them}`, `${t.mascot ?? t.school} take care of business against ${opp.school}`])
        : margin >= 21 ? pick([`${opp.school} routs ${t.school}`, `A long night for ${t.school} against ${opp.school}`])
          : pick([`${t.school} falls to ${opp.school}, ${them}-${us}`, `Questions mount after ${t.school}'s loss to ${opp.school}`]);
      parts.push(`${t.school} (${r.w}-${r.l}, ${r.cw}-${r.cl} ${t.conference}) ${won ? "beat" : "lost to"} ${opp.school} ${Math.max(us, them)}-${Math.min(us, them)}${g.overtime ? " in overtime" : ""} on ${formatDate(g.date, false)}.`);
      if (c.stars[t.id]) parts.push(c.stars[t.id]);
    } else {
      headline = pick([`${t.school} uses the open week to regroup`, `Bye week check-in: ${t.school} at ${rec(t.id)}`]);
      parts.push(`${t.school} was off this week and sits at ${rec(t.id)}.`);
    }
    if (c.prev) {
      if (now && before) parts.push(now < before ? `The ${t.mascot ?? "team"} moved up from No. ${before} to No. ${now} in this week's AP poll.` : now > before ? `They slipped from No. ${before} to No. ${now} in the AP poll.` : `They hold at No. ${now} in the AP poll.`);
      else if (now) parts.push(`They enter the AP poll at No. ${now}.`);
      else if (before) parts.push(`They fell out of the AP poll after sitting at No. ${before}.`);
    }
    parts.push(mine ? `On my ballot this week: No. ${mine}.` : `They are not on my ballot this week.`);
    if (n) parts.push(`Next: ${n.home_id === t.id ? "vs." : "at"} ${T(n.home_id === t.id ? n.away_id : n.home_id).school}, ${formatDate(n.date, false)}.`);
    return { headline, body: `By ${byline}. ` + parts.join(" "), team_ids: [t.id] };
  }

  if (w.beat.kind === "conference") {
    const conf = w.beat.conference;
    const members = [...c.teams.values()].filter((t) => t.level === "fbs" && t.conference === conf);
    const ids = new Set(members.map((t) => t.id));
    const results = c.games.filter((g) => g.status === "final" && weekAgo(g.date) && (ids.has(g.home_id) || ids.has(g.away_id)));
    const leader = [...members].sort((a, b) => {
      const ra = c.records.get(a.id)!, rb = c.records.get(b.id)!;
      return rb.cw - rb.cl - (ra.cw - ra.cl) || rb.w - ra.w;
    })[0];
    const top3 = c.ballot.filter((id) => ids.has(id)).slice(0, 3);
    const parts = [`By ${byline}.`];
    if (results.length) {
      const lines = results.slice(0, 6).map((g) => {
        const [wi, li, ws, ls] = g.home_score! > g.away_score! ? [g.home_id, g.away_id, g.home_score!, g.away_score!] : [g.away_id, g.home_id, g.away_score!, g.home_score!];
        return `${T(wi).school} ${ws}, ${T(li).school} ${ls}`;
      });
      parts.push(`This week: ${lines.join("; ")}.`);
    } else parts.push(c.prev ? `A quiet week around the ${conf}.` : `The ${conf} season is about to begin.`);
    parts.push(`${leader.school} (${rec(leader.id)}) sets the pace.`);
    parts.push(top3.length ? `My ${conf} teams on the ballot: ${top3.map((id) => `${T(id).school} (No. ${myRank(id)})`).join(", ")}.` : `No ${conf} team made my ballot this week.`);
    return { headline: pick([`${conf} notebook: ${leader.school} sets the pace`, `Around the ${conf}: ${results.length} games, one clear leader`, `${conf} roundup`]), body: parts.join(" "), team_ids: [...ids] };
  }

  const top5 = c.ballot.slice(0, 5);
  const body = [`By ${byline}.`, `My top five: ${top5.map((id, i) => `${i + 1}. ${T(id).school} (${rec(id)})`).join(", ")}.`];
  const consensus = c.poll.ranks[0].team_id;
  if (top5[0] !== consensus) body.push(`I'm off the consensus at No. 1: the poll has ${T(consensus).school}, I have ${T(top5[0]).school}.`);
  return { headline: pick([`${w.last}'s ballot: ${T(top5[0]).school} on top`, `The top five, and why ${T(top5[0]).school} is No. 1`]), body: body.join(" "), team_ids: top5 };
}

function addDaysIso(d: ISODate, n: number): ISODate {
  const x = new Date(d + "T12:00:00Z");
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** One line about a team's best player in a game, from the box score. */
export function starLine(players: Record<string, Record<string, number>>, school: string): string | null {
  let best: { name: string; score: number; line: string } | null = null;
  for (const [name, p] of Object.entries(players)) {
    const pass = p.pass_yds ?? 0, rush = p.rush_yds ?? 0, rec = p.rec_yds ?? 0;
    const tds = (p.pass_td ?? 0) + (p.rush_td ?? 0) + (p.rec_td ?? 0);
    const score = pass * 0.5 + rush + rec + tds * 20;
    let line: string;
    if (pass >= Math.max(rush, rec)) line = `${name} threw for ${pass} yards${p.pass_td ? ` and ${p.pass_td} touchdown${p.pass_td > 1 ? "s" : ""}` : ""}.`;
    else if (rush >= rec) line = `${name} ran for ${rush} yards on ${p.car ?? 0} carries${p.rush_td ? ` with ${p.rush_td} touchdown${p.rush_td > 1 ? "s" : ""}` : ""}.`;
    else line = `${name} caught ${p.rec ?? 0} passes for ${rec} yards${p.rec_td ? ` and ${p.rec_td} touchdown${p.rec_td > 1 ? "s" : ""}` : ""}.`;
    if (!best || score > best.score) best = { name, score, line };
  }
  void school;
  return best?.line ?? null;
}
