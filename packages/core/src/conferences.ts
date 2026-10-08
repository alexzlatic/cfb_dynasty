import { BOWLS, NY6, type Bowl } from "./bowls.ts";
import { mixSeed } from "./hash.ts";
import { Rng } from "@cfb/engine";
import type { ScheduledGame, Team } from "./types.ts";

/**
 * Conferences as a league defines them. A league starts with the real 2026 lineup or with the user's
 * own (any FBS school in any conference, new conferences, renamed ones), and each conference sets its
 * own rules: whether it plays a title game, how many conference games, and any playoff spots it is
 * guaranteed. Bowl tie-ins name conferences, so they follow whatever the league calls them.
 */
export type Tier = "power" | "group" | "independent";

export interface ConferenceDef {
  name: string;
  /** Power conferences get the money, exposure and neutral-site title games the P4 have; group ones play like the Group of Five. */
  tier: Tier;
  /** FBS team ids. */
  members: number[];
  /** Two divisions whose winners meet in the title game (null = the top two by conference record). */
  divisions: Record<string, number[]> | null;
  title_game: boolean;
  /** Conference games each member plays (a new or changed conference gets a schedule built to this). */
  conf_games: number;
  /** Playoff spots set aside for this conference's best teams in the committee's ranking (0 = none; its champion can still take an automatic bid). */
  cfp_bids: number;
}

/** A bowl's two sides as lists of conference names ([] = at-large), by bowl name. */
export type TieIns = Record<string, [string[], string[]]>;

/** What a new league is given: its conferences and, optionally, bowl tie-ins (bowls left out keep their real ones). */
export interface ConferenceSetup { conferences: ConferenceDef[]; tie_ins?: TieIns }

export const INDEPENDENT = "FBS Independents";
export const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
/** The Protect College Sports Act's cap on a conference's football members. */
export const PCSA_CAP = 20;

/** Every bowl in selection order (the New Year's Six first). */
export const ALL_BOWLS: Bowl[] = [...NY6, ...BOWLS];

/** Power program: in a power conference, or Notre Dame (an independent with a power conference's standing). */
export function isPower(t: Pick<Team, "conference" | "school"> & { power?: boolean }): boolean {
  return t.power ?? (P4.has(t.conference) || t.school === "Notre Dame");
}

/** The real conferences in a seed: its FBS teams by conference, divisions as listed, conference games as scheduled. */
export function realConferences(teams: Team[], schedule: Pick<ScheduledGame, "home_id" | "away_id" | "conference_game">[]): ConferenceDef[] {
  const fbs = teams.filter((t) => t.level === "fbs").sort((a, b) => a.id - b.id);
  const confOf = new Map(fbs.map((t) => [t.id, t.conference]));
  const games = new Map<number, number>();
  for (const g of schedule) {
    if (!g.conference_game || confOf.get(g.home_id) !== confOf.get(g.away_id)) continue;
    for (const id of [g.home_id, g.away_id]) games.set(id, (games.get(id) ?? 0) + 1);
  }
  const names = [...new Set(fbs.map((t) => t.conference))].sort();
  return names.map((name): ConferenceDef => {
    const ms = fbs.filter((t) => t.conference === name);
    const divs = [...new Set(ms.map((t) => t.division).filter(Boolean))] as string[];
    const counts = ms.map((t) => games.get(t.id) ?? 0).sort((a, b) => a - b);
    const ind = name === INDEPENDENT;
    return {
      name, tier: ind ? "independent" : P4.has(name) ? "power" : "group", members: ms.map((t) => t.id),
      divisions: divs.length === 2 ? Object.fromEntries(divs.sort().map((d) => [d, ms.filter((t) => t.division === d).map((t) => t.id)])) : null,
      title_game: !ind, conf_games: ind ? 0 : counts[Math.floor(counts.length / 2)], cfp_bids: 0,
    };
  });
}

/** Every bowl's tie-ins as the league plays them: the setup's where given, else the real ones minus conferences that don't exist. */
export function tieInsFor(confs: ConferenceDef[], given?: TieIns): TieIns {
  const names = new Set(confs.map((c) => c.name));
  const out: TieIns = {};
  for (const b of ALL_BOWLS) {
    const sides = given?.[b.name] ?? b.sides;
    out[b.name] = [sides[0].filter((n) => names.has(n)), sides[1].filter((n) => names.has(n))];
  }
  return out;
}

/** Why a setup can't start a league (null = it can). `teams` are the seed's. */
export function validateSetup(setup: ConferenceSetup, teams: Team[], opts: { pcsa?: boolean; playoff_teams?: number } = {}): string | null {
  const fbs = new Set(teams.filter((t) => t.level === "fbs").map((t) => t.id));
  const seen = new Set<number>(), names = new Set<string>();
  let bids = 0;
  for (const c of setup.conferences) {
    const name = c.name?.trim();
    if (!name) return "every conference needs a name";
    if (names.has(name)) return `two conferences are called ${name}`;
    names.add(name);
    if (!["power", "group", "independent"].includes(c.tier)) return `${name}: unknown tier`;
    for (const id of c.members) {
      if (!fbs.has(id)) return `${name}: team ${id} is not an FBS school`;
      if (seen.has(id)) return `team ${id} is in two conferences`;
      seen.add(id);
    }
    if (c.tier === "independent") continue;
    if (c.members.length < 4) return `${name} needs at least 4 members`;
    if (opts.pcsa && c.members.length > PCSA_CAP) return `${name} has ${c.members.length} members; the Protect College Sports Act caps conferences at ${PCSA_CAP}`;
    if (!Number.isInteger(c.conf_games) || c.conf_games < 0 || c.conf_games > Math.min(11, c.members.length - 1)) return `${name}: conference games must be between 0 and ${Math.min(11, c.members.length - 1)}`;
    if (!Number.isInteger(c.cfp_bids) || c.cfp_bids < 0) return `${name}: playoff spots must be 0 or more`;
    bids += c.cfp_bids;
    if (c.divisions) {
      const ds = Object.values(c.divisions);
      const all = ds.flat();
      if (ds.length !== 2 || ds.some((d) => d.length < 2) || all.length !== c.members.length || !c.members.every((id) => all.includes(id))) {
        return `${name}: divisions must split the members in two`;
      }
    }
  }
  for (const id of fbs) if (!seen.has(id)) return `team ${id} has no conference (put independents in ${INDEPENDENT})`;
  if (opts.playoff_teams != null && bids > opts.playoff_teams) return `conferences are guaranteed ${bids} playoff spots in a ${opts.playoff_teams}-team field`;
  for (const [bowl, sides] of Object.entries(setup.tie_ins ?? {})) {
    if (!ALL_BOWLS.some((b) => b.name === bowl)) return `unknown bowl ${bowl}`;
    for (const n of sides.flat()) if (!names.has(n)) return `${bowl}: no conference called ${n}`;
  }
  return null;
}

/** Teams as the league's conferences place them: conference, division, power standing and, with deals, the TV money each gets (FCS teams unchanged). */
export function placeTeams(teams: Team[], confs: ConferenceDef[], media?: Record<string, { per_school: number }>): Team[] {
  const at = new Map<number, { c: ConferenceDef; div: string | null }>();
  for (const c of confs) {
    for (const id of c.members) {
      const div = c.divisions ? Object.entries(c.divisions).find(([, ids]) => ids.includes(id))?.[0] ?? null : null;
      at.set(id, { c, div });
    }
  }
  return teams.map((t) => {
    const p = at.get(t.id);
    if (!p) return t;
    const power = p.c.tier === "power" || (p.c.tier === "independent" && t.school === "Notre Dame");
    const pay = media?.[p.c.name]?.per_school;
    return { ...t, conference: p.c.name, division: p.div, power, ...(pay != null ? { media: pay } : {}) };
  });
}

/**
 * The regular season for a league's conferences. Conferences whose members and number of conference
 * games match the real ones keep their real schedules. Every other conference loses its real conference games and gets new ones,
 * built into the weeks its members have free: each member plays `conf_games` different conference
 * opponents (division mates first), never more than 12 games in all, home and away kept even. A
 * scheduled non-conference game between two schools now in one conference counts as a conference game.
 */
export function conferenceSchedule(schedule: ScheduledGame[], before: Team[], after: Team[], confs: ConferenceDef[], seed: number, year: number, firstId: number): ScheduledGame[] {
  const was = new Map(before.map((t) => [t.id, t.conference]));
  const now = new Map(after.map((t) => [t.id, t]));
  const setOf = (ids: number[]) => [...ids].sort((a, b) => a - b).join(",");
  const real = new Map<string, number[]>();
  for (const t of before) if (t.level === "fbs") real.set(t.conference, [...(real.get(t.conference) ?? []), t.id]);
  const next = new Map(confs.map((c) => [c.name, c.members]));
  const realGames = new Map(realConferences(before, schedule).map((c) => [c.name, c.conf_games]));
  const want = new Map(confs.map((c) => [c.name, c.conf_games]));
  // A conference changed when the league's version of it has other members than the real one (or either
  // doesn't exist), or plays a different number of conference games.
  const changed = new Set([...real.keys(), ...next.keys()].filter((n) => n !== INDEPENDENT &&
    (setOf(real.get(n) ?? []) !== setOf(next.get(n) ?? []) || realGames.get(n) !== want.get(n))));
  const touched = (id: number) => changed.has(was.get(id) ?? "") || changed.has(now.get(id)?.conference ?? "");
  const confOf = (id: number) => {
    const t = now.get(id);
    return t && t.level === "fbs" && t.conference !== INDEPENDENT && confs.find((c) => c.name === t.conference)?.tier !== "independent" ? t.conference : null;
  };
  // Weeks a conference game can go in: the busy Saturdays of the regular season.
  const byWeek = new Map<number, Map<string, number>>();
  for (const g of schedule) {
    const m = byWeek.get(g.week) ?? new Map<string, number>();
    m.set(g.date, (m.get(g.date) ?? 0) + 1);
    byWeek.set(g.week, m);
  }
  const weeks = [...byWeek].filter(([, m]) => [...m.values()].reduce((a, b) => a + b, 0) >= 30)
    .map(([week, m]) => ({ week, date: [...m].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0] }))
    .sort((a, b) => a.week - b.week);
  // Drop the real conference games of every school whose conference changed (games after the busy
  // weeks, like Army-Navy, stay as they are).
  const open = new Set(weeks.map((w) => w.week));
  const kept = schedule.filter((g) => !(g.conference_game && open.has(g.week) && (touched(g.home_id) || touched(g.away_id))))
    .map((g) => ({ ...g, conference_game: confOf(g.home_id) != null && confOf(g.home_id) === confOf(g.away_id) }));
  if (changed.size === 0) return kept;


  const busy = new Map<number, Set<number>>(), total = new Map<number, number>(), home = new Map<number, number>();
  const pairs = new Set<string>();
  const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  for (const g of kept) {
    for (const id of [g.home_id, g.away_id]) {
      (busy.get(id) ?? busy.set(id, new Set()).get(id)!).add(g.week);
      total.set(id, (total.get(id) ?? 0) + 1);
    }
    home.set(g.home_id, (home.get(g.home_id) ?? 0) + 1);
    pairs.add(key(g.home_id, g.away_id));
  }
  const rng = new Rng(mixSeed(seed, "conference-schedule", year));
  const out = [...kept];
  let id = firstId;
  const add = (w: number, a: number, b: number, conf: boolean) => {
    const ha = home.get(a) ?? 0, hb = home.get(b) ?? 0;
    const [h, v] = ha < hb || (ha === hb && rng.random() < 0.5) ? [a, b] : [b, a];
    home.set(h, (home.get(h) ?? 0) + 1);
    for (const m of [a, b]) { (busy.get(m) ?? busy.set(m, new Set()).get(m)!).add(w); total.set(m, (total.get(m) ?? 0) + 1); }
    pairs.add(key(a, b));
    const ht = now.get(h)!;
    out.push({ id: id++, week: w, date: weeks.find((x) => x.week === w)!.date, kickoff_et: null, home_id: h, away_id: v, neutral: false,
      conference_game: conf, venue_id: ht.venue?.id ?? null, venue: ht.venue?.name ?? null, notes: null });
  };
  for (const c of confs.filter((x) => changed.has(x.name)).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const divOf = new Map<number, string>();
    for (const [d, ids] of Object.entries(c.divisions ?? {})) for (const x of ids) divOf.set(x, d);
    const have = new Map(c.members.map((m) => [m, kept.filter((g) => g.conference_game && (g.home_id === m || g.away_id === m)).length]));
    // A school without room for its new conference schedule drops non-conference games, mid-season ones
    // first and its last game (usually a rivalry) last, as schools do when they change conferences.
    const room = (m: number) => Math.min(weeks.filter((w) => !busy.get(m)?.has(w.week)).length, 12 - (total.get(m) ?? 0));
    const first = weeks.slice(0, 4).map((w) => w.week), last = weeks[weeks.length - 1]?.week;
    for (const m of c.members) {
      const drop = out.filter((g) => !g.conference_game && (g.home_id === m || g.away_id === m))
        .sort((a, b) => rank(a) - rank(b) || b.week - a.week);
      function rank(g: ScheduledGame) { return g.week === last ? 2 : first.includes(g.week) ? 1 : 0; }
      while (room(m) < c.conf_games - have.get(m)! && drop.length) {
        const g = drop.shift()!;
        out.splice(out.indexOf(g), 1);
        for (const x of [g.home_id, g.away_id]) { busy.get(x)?.delete(g.week); total.set(x, (total.get(x) ?? 1) - 1); }
        home.set(g.home_id, (home.get(g.home_id) ?? 1) - 1);
      }
    }
    const need0 = new Map(c.members.map((m) => [m, Math.max(0, Math.min(c.conf_games - have.get(m)!, 12 - (total.get(m) ?? 0)))]));
    // Randomized greedy, week by week, the tightest teams first; keep the best of several tries.
    let best: { games: [number, number, number][]; short: number } | null = null;
    for (let attempt = 0; attempt < 60 && (best == null || best.short > 0); attempt++) {
      const need = new Map(need0), played = new Set(pairs), games: [number, number, number][] = [];
      const free = (m: number, w: number) => !busy.get(m)?.has(w) && !games.some(([wk, a, b]) => wk === w && (a === m || b === m));
      const slack = (m: number, wi: number) => weeks.slice(wi).filter((w) => free(m, w.week)).length - need.get(m)!;
      const order = [...weeks.keys()];
      for (const wi of order) {
        const w = weeks[wi].week;
        const open = c.members.filter((m) => need.get(m)! > 0 && free(m, w)).map((m) => ({ m, s: slack(m, wi), r: rng.random() }))
          .sort((a, b) => a.s - b.s || a.r - b.r);
        const used = new Set<number>();
        for (const { m, s } of open) {
          if (used.has(m)) continue;
          // A team with room to spare can sit this week out when the draw is thin.
          const partners = open.filter((o) => o.m !== m && !used.has(o.m) && !played.has(key(m, o.m)))
            .sort((a, b) => Number(divOf.get(b.m) === divOf.get(m) && divOf.has(m)) - Number(divOf.get(a.m) === divOf.get(m) && divOf.has(m)) || a.s - b.s || a.r - b.r);
          if (!partners.length) continue;
          if (s > 1 && partners[0].s > 1 && rng.random() < 0.15) continue;
          const o = partners[0].m;
          used.add(m).add(o);
          played.add(key(m, o));
          need.set(m, need.get(m)! - 1); need.set(o, need.get(o)! - 1);
          games.push([w, m, o]);
        }
      }
      const short = [...need.values()].reduce((a, b) => a + b, 0);
      if (!best || short < best.short) best = { games, short };
    }
    for (const [w, a, b] of best!.games) add(w, a, b, true);
  }
  // Schools that lost games in the shuffle play each other in weeks both have open, up to their old count (at most 12).
  const target = new Map<number, number>();
  for (const g of schedule) for (const x of [g.home_id, g.away_id]) target.set(x, Math.min(12, (target.get(x) ?? 0) + 1));
  const short = () => after.filter((t) => t.level === "fbs" && (total.get(t.id) ?? 0) < (target.get(t.id) ?? 0)).map((t) => t.id);
  for (const w of weeks) {
    const open = short().filter((m) => !busy.get(m)?.has(w.week)).map((m) => ({ m, r: rng.random() })).sort((a, b) => a.r - b.r).map((x) => x.m);
    while (open.length >= 2) {
      const a = open.shift()!;
      const i = open.findIndex((b) => !pairs.has(key(a, b)));
      if (i < 0) continue;
      const [b] = open.splice(i, 1);
      add(w.week, a, b, confOf(a) != null && confOf(a) === confOf(b));
    }
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id - b.id));
}
