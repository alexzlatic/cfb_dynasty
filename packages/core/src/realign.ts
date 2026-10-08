import { INDEPENDENT, PCSA_CAP, type ConferenceDef } from "./conferences.ts";
import { mixSeed } from "./hash.ts";
import { miles } from "./valuation.ts";
import type { Team } from "./types.ts";

/**
 * Conference realignment between seasons.
 *
 *  market:    the default. Every school has a media score (brand, fan base, recent winning, playoff
 *             trips). Each conference's TV deal pays every member the same and runs six to eight
 *             years; when it renews, the payout moves with how strong the membership is. A conference
 *             whose deal is up within two years, or that just lost schools, invites schools that
 *             would lift its average (so its payout), nearer ones first. A school says yes when the raise beats its
 *             exit fee. Moves are announced a year before they take effect. A conference that falls
 *             below 8 schools folds and its schools find new homes.
 *  promotion: promotion and relegation. Every season the worst school over two seasons in each power
 *             conference swaps places with the best Group of Six school.
 *  fixed:     conferences never change on their own.
 * Commissioner mode (a separate setting) lets the user rewrite the conferences in the offseason.
 */
export type RealignMode = "market" | "promotion" | "fixed";

export interface Deal {
  /** Dollars a year to each member, and the last season it covers. */
  per_school: number;
  expires: number;
  /** The membership's average media score when it was signed. */
  signed_score: number;
}

export interface Move {
  team_id: number; from: string; to: string;
  /** The season it was announced after, and the first season played in the new conference. */
  announced: number; effective: number;
  /** Exit fee owed to the old conference (dollars). */
  fee: number;
  reason: "invite" | "collapse" | "promotion" | "relegation" | "commissioner";
}

export interface RealignState {
  deals: Record<string, Deal>;
  pending: Move[];
  history: Move[];
  /** log(payout) = a + b * average media score, fit to the real 2026 conferences. */
  fit: { a: number; b: number };
}

/** The smallest a conference can be and keep its deal and automatic bid. */
export const MIN_MEMBERS = 8;
/** A conference's biggest size: the Act's cap with it on, a looser one without. */
export const capFor = (pcsa: boolean) => (pcsa ? PCSA_CAP : 24);
/** A conference paying each school this much or more plays as a power conference, and one paying under the floor drops out. */
const POWER_AT = 15_000_000, POWER_FLOOR = 10_000_000;
/** Real deals' last seasons (approximate, 2025 reporting). */
const EXPIRES: Record<string, number> = {
  "Big Ten": 2029, SEC: 2033, ACC: 2035, "Big 12": 2030, "Pac-12": 2031, "American Athletic": 2031,
  "Mountain West": 2031, "Sun Belt": 2031, "Mid-American": 2026, "Conference USA": 2028,
};

export interface SchoolInputs {
  /** Average home crowd. */
  fans: number;
  /** Winning percentage over the last three seasons. */
  win: number;
  /** Playoff trips in the last three seasons. */
  berths: number;
}

/** A school's media score: brand most, then fan base, recent winning and playoff runs. Roughly 0.5 (small Group of Six) to 3 (blue bloods). */
export function mediaScore(t: Pick<Team, "prestige">, x: SchoolInputs): number {
  return 1.6 * (t.prestige / 100) + 0.8 * Math.log10(Math.max(5_000, x.fans) / 20_000) + 1.0 * x.win + 0.25 * Math.min(3, x.berths);
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const cycle = (seed: number, name: string, year: number) => 6 + (mixSeed(seed, "deal", name, year) % 3);

/**
 * Deals for a league's conferences at the start: real payouts for real conferences (by name, from
 * `media`), and for any others the payout the fit gives their membership. Custom conferences sign a
 * new deal now.
 */
export function startDeals(confs: ConferenceDef[], score: Map<number, number>, media: Record<string, number>, year: number, seed: number): RealignState {
  const pts = confs.filter((c) => c.tier !== "independent" && media[c.name] != null && c.members.length)
    .map((c) => ({ x: avg(c.members.map((m) => score.get(m) ?? 0)), y: Math.log(media[c.name]) }));
  // Least squares; a flat fit falls back to doubling the payout per point of score.
  const mx = avg(pts.map((p) => p.x)), my = avg(pts.map((p) => p.y));
  const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0), sxy = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const b = sxx > 0 && pts.length >= 3 ? sxy / sxx : Math.LN2;
  const fit = { a: my - b * mx, b };
  const deals: Record<string, Deal> = {};
  for (const c of confs) {
    if (c.tier === "independent") continue;
    const s = avg(c.members.map((m) => score.get(m) ?? 0));
    deals[c.name] = { per_school: Math.round(media[c.name] ?? Math.exp(fit.a + fit.b * s)), expires: EXPIRES[c.name] ?? year + cycle(seed, c.name, year) - 1, signed_score: s };
  }
  return { deals, pending: [], history: [], fit };
}

export interface RealignInputs {
  /** The season just played, its conferences and teams as placed in them. */
  year: number;
  conferences: ConferenceDef[];
  teams: Team[];
  state: RealignState;
  score: Map<number, number>;
  /** What an independent school earns on its own (dollars a year). */
  solo: (t: Team) => number;
  mode: RealignMode;
  pcsa: boolean;
  seed: number;
  /** Two seasons' winning percentage (promotion and relegation), by team. */
  form: Map<number, number>;
}

export interface RealignResult {
  conferences: ConferenceDef[];
  state: RealignState;
  /** Headlines for the news: [headline, body, team ids]. */
  news: [string, string, number[]][];
  /** Names of conferences that folded (their bowl tie-ins go away). */
  folded: string[];
}

/** Conferences for the season after `year`: moves taking effect, folds, deal renewals and the next round of invitations. */
export function realign(x: RealignInputs): RealignResult {
  const ny = x.year + 1;
  let confs: ConferenceDef[] = structuredClone(x.conferences);
  const st: RealignState = structuredClone(x.state);
  const news: RealignResult["news"] = [];
  const byId = new Map(x.teams.map((t) => [t.id, t]));
  const name = (id: number) => byId.get(id)?.school ?? String(id);
  const confOf = (id: number) => confs.find((c) => c.members.includes(id));
  const scoreOf = (c: ConferenceDef) => avg(c.members.map((m) => x.score.get(m) ?? 0));
  const at = (c: ConferenceDef) => {
    const ps = c.members.map((m) => byId.get(m)?.venue).filter((v) => v?.lat != null && v?.lon != null) as { lat: number; lon: number }[];
    return ps.length ? { lat: avg(ps.map((p) => p.lat)), lon: avg(ps.map((p) => p.lon)) } : null;
  };
  const dist = (id: number, c: ConferenceDef) => {
    const v = byId.get(id)?.venue, ctr = at(c);
    return v?.lat != null && v?.lon != null && ctr ? miles({ lat: v.lat, lon: v.lon }, ctr) : 1000;
  };
  const lost = new Set<string>();
  const move = (m: Move) => {
    const from = confs.find((c) => c.name === m.from), to = confs.find((c) => c.name === m.to);
    if (!to || !from?.members.includes(m.team_id)) return false;
    from.members = from.members.filter((t) => t !== m.team_id);
    from.divisions = null;
    to.members.push(m.team_id);
    to.divisions = null;
    lost.add(from.name);
    st.history.push(m);
    return true;
  };
  const fixGames = () => { for (const c of confs) if (c.tier !== "independent") c.conf_games = Math.min(c.conf_games, Math.max(0, c.members.length - 1)); };

  // 1. Announced moves take effect.
  for (const m of st.pending.filter((p) => p.effective === ny)) {
    if (move(m)) news.push([`${name(m.team_id)} joins the ${m.to}`, `${name(m.team_id)} plays its first ${m.to} season in ${ny}, leaving the ${m.from}${m.fee ? ` (exit fee ${money(m.fee)})` : ""}.`, [m.team_id]]);
  }
  st.pending = st.pending.filter((p) => p.effective > ny);

  // 2. Promotion and relegation.
  if (x.mode === "promotion") {
    const form = (id: number) => (x.form.get(id) ?? 0) + 0.001 * (x.score.get(id) ?? 0);
    const taken = new Set<number>();
    const groups = confs.filter((c) => c.tier === "group");
    const best = groups.flatMap((c) => c.members).sort((a, b) => form(b) - form(a) || a - b);
    for (const c of confs.filter((k) => k.tier === "power").sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const down = [...c.members].sort((a, b) => form(a) - form(b) || a - b)[0];
      const up = best.find((t) => !taken.has(t));
      if (down == null || up == null || form(up) <= form(down)) continue;
      taken.add(up);
      const home = confOf(up)!.name;
      move({ team_id: up, from: home, to: c.name, announced: x.year, effective: ny, fee: 0, reason: "promotion" });
      move({ team_id: down, from: c.name, to: home, announced: x.year, effective: ny, fee: 0, reason: "relegation" });
      news.push([`${name(up)} is promoted to the ${c.name}; ${name(down)} goes down`,
        `${name(up)} earned its place with the best record outside the power conferences; ${name(down)} finished last in the ${c.name} over two seasons and drops to the ${home}.`, [up, down]]);
    }
  }

  // 3. Conferences that lose schools and fall below the minimum fold; their schools go to the nearest conference with room.
  const folded: string[] = [];
  const cap = capFor(x.pcsa);
  for (const c of [...confs]) {
    if (c.tier === "independent" || c.members.length >= MIN_MEMBERS) continue;
    if (!lost.has(c.name)) continue;
    folded.push(c.name);
    confs = confs.filter((k) => k !== c);
    delete st.deals[c.name];
    for (const id of [...c.members]) {
      const options = confs.filter((k) => k.tier !== "independent" && k.members.length < cap);
      const to = options.sort((a, b) => dist(id, a) - dist(id, b))[0] ?? confs.find((k) => k.tier === "independent");
      if (!to) continue;
      to.members.push(id);
      to.divisions = null;
      st.history.push({ team_id: id, from: c.name, to: to.name, announced: x.year, effective: ny, fee: 0, reason: "collapse" });
    }
    news.push([`The ${c.name} folds`, `Down to ${c.members.length} schools, the ${c.name} loses its TV deal and its automatic bid. Its schools land in new conferences for ${ny}.`, c.members]);
  }

  // 4. Deals that ran out renew at what the membership is worth now; payouts decide each conference's tier.
  for (const c of confs) {
    if (c.tier === "independent") continue;
    const d = st.deals[c.name];
    const s = scoreOf(c);
    if (!d) { st.deals[c.name] = { per_school: Math.round(Math.exp(st.fit.a + st.fit.b * s)), expires: ny + cycle(x.seed, c.name, ny) - 1, signed_score: s }; continue; }
    if (d.expires > x.year) continue;
    const per = Math.round(d.per_school * Math.exp(st.fit.b * (s - d.signed_score)) / 10_000) * 10_000;
    news.push([`The ${c.name} signs a new TV deal`, `${money(per)} a school a year through ${ny + cycle(x.seed, c.name, ny) - 1} (was ${money(d.per_school)}).`, []]);
    st.deals[c.name] = { per_school: per, expires: ny + cycle(x.seed, c.name, ny) - 1, signed_score: s };
    const tier = per >= POWER_AT ? "power" : per < POWER_FLOOR ? "group" : c.tier;
    if (tier !== c.tier) news.push([tier === "power" ? `The ${c.name} joins the power conferences` : `The ${c.name} drops out of the power conferences`, "", []]);
    c.tier = tier;
  }

  // 5. Invitations (market only): conferences renewing soon or replacing schools they lost.
  if (x.mode === "market") {
    const moving = new Set(st.pending.map((p) => p.team_id));
    const recent = new Set(st.history.filter((h) => h.effective > ny - 4).map((h) => h.team_id));
    const pay = (t: Team) => { const c = confOf(t.id); return !c || c.tier === "independent" ? x.solo(t) : st.deals[c.name]?.per_school ?? 0; };
    const open = confs.filter((c) => c.tier !== "independent" && st.deals[c.name] && (st.deals[c.name].expires <= ny + 1 || lost.has(c.name)))
      .sort((a, b) => st.deals[b.name].per_school - st.deals[a.name].per_school || (a.name < b.name ? -1 : 1));
    for (const c of open) {
      const d = st.deals[c.name];
      const room = cap - c.members.length - st.pending.filter((p) => p.to === c.name).length + st.pending.filter((p) => p.from === c.name).length;
      if (room <= 0) continue;
      // A school has to lift the membership's average (more so the bigger the conference already is) and be worth the travel.
      const size = c.members.length + st.pending.filter((p) => p.to === c.name).length;
      const bar = scoreOf(c) + 0.05 + 0.05 * Math.max(0, size - 16);
      const cands = x.teams.filter((t) => t.level === "fbs" && !c.members.includes(t.id) && !moving.has(t.id) && !recent.has(t.id) && pay(t) < d.per_school)
        .map((t) => ({ t, s: x.score.get(t.id) ?? 0, mi: dist(t.id, c) }))
        .filter((k) => k.s >= bar + 0.15 * (k.mi / 1000))
        .sort((a, b) => b.s - a.s || a.t.id - b.t.id);
      let invited = 0;
      for (const k of cands) {
        if (invited >= Math.min(2, room)) break;
        const cur = confOf(k.t.id);
        const indep = !cur || cur.tier === "independent";
        const now = pay(k.t);
        const curDeal = cur && !indep ? st.deals[cur.name] : null;
        // Exit fee: two years' payout leaving mid-deal, half a year when the deal is about to end.
        const fee = curDeal ? Math.round(now * (curDeal.expires - ny >= 2 ? 2 : 0.5)) : 0;
        const years = Math.max(1, d.expires - ny);
        // Independents and power schools like where they are; it takes a bigger raise to move them.
        const need = indep ? 1.5 : cur?.tier === "power" ? 1.3 : 1.15;
        if (d.per_school < now * need || (d.per_school - now) * years < fee) continue;
        const m: Move = { team_id: k.t.id, from: cur?.name ?? INDEPENDENT, to: c.name, announced: x.year, effective: ny + 1, fee, reason: "invite" };
        st.pending.push(m);
        moving.add(k.t.id);
        invited++;
        news.push([`${k.t.school} will join the ${c.name} in ${ny + 1}`,
          `The ${c.name} pays ${money(d.per_school)} a school a year against ${money(now)} where ${k.t.school} is now${fee ? `; it owes the ${m.from} ${money(fee)} to leave` : ""}.`, [k.t.id]]);
      }
    }
  }
  fixGames();
  return { conferences: confs, state: st, news, folded };
}

function money(x: number): string { return x >= 1_000_000 ? `$${(x / 1_000_000).toFixed(1)}M` : `$${Math.round(x / 1000)}K`; }
