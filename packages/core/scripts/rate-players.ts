/**
 * Rates every player on a season's FBS and FCS rosters and writes data/seed/<season>wk1/players.json.
 *
 *   npx tsx packages/core/scripts/rate-players.ts [season]      (default 2026)
 *
 * Inputs are the CFBD pulls in importer/.cache (the last eight recruiting classes, player season stats,
 * usage and PPA for the two seasons before) plus the seed's rosters and preseason team ratings. Nothing
 * from the rated season is used except who started at QB in its first game (see below). For 2026 that
 * is recruiting 2019-2026 and stats from 2025 and 2024.
 *
 * 1. Prior from who the player is: recruiting composite (z within his class), seasons in college and
 *    position, fit on players with large last-season samples.
 * 2. Evidence from stats: last season, plus the season before at half weight, standardized against regulars at the position
 *    and discounted by level (Group of Five, FCS).
 * 3. Shrink: z = prior + (evidence - prior) * n / (n + k), with k per stat by how noisy it is.
 * 4. Team anchor: compile each team's auto depth chart and move its starters' unit ratings (bounded)
 *    so the team plays at its preseason prior strength; what's left becomes the team's scheme offset.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LEAGUE, Rng, type TeamRatings } from "@cfb/engine";
import {
  autoDepth, compileTeam, kickerSkill, lineup, punterSkill, residual, RATES, shifts, units, OFFENSE_TERMS, DEFENSE_TERMS,
  type Lineup, type Rate, type SchemeOffsets, type Slot,
} from "../src/compiler.ts";
import { ATTRS, fromZ, overall, z as toZ, type Pos, type RatedPlayer } from "../src/players.ts";
import { mixSeed } from "../src/hash.ts";
import { packPlayer } from "../src/seed.ts";
import { seedPotential } from "../src/rollover.ts";

const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const SEASON = Number(process.argv[2] || 2026);
const LAST = SEASON - 1;
const SEED = join(ROOT, `data/seed/${SEASON}wk1`);
const CACHE = join(ROOT, "importer/.cache");
const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));

const teams: { id: number; school: string; level: string; conference: string }[] = read(join(SEED, "teams.json"));
const rosters: Record<string, any[]> = read(join(SEED, "rosters.json"));
const priors: Record<string, { ratings: TeamRatings }> = read(join(SEED, "team_ratings_all.json")).teams;

// ---- recruiting -----------------------------------------------------------------------------------
interface Recruit { year: number; stars: number; rating: number; rank: number | null; position: string; rz: number }
const recruitById = new Map<string, Recruit>(), recruitByAthlete = new Map<string, Recruit>();
for (let y = SEASON - 7; y <= SEASON; y++) {
  const rows: any[] = read(join(CACHE, `recruiting_players__year-${y}_classification-HighSchool.json`));
  const rs = rows.map((r) => r.rating).filter((x) => x != null);
  const m = rs.reduce((a, b) => a + b, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((a, b) => a + (b - m) ** 2, 0) / rs.length);
  for (const r of rows) {
    if (r.rating == null) continue;
    const rec: Recruit = { year: y, stars: r.stars, rating: r.rating, rank: r.ranking ?? null, position: r.position, rz: (r.rating - m) / sd };
    recruitById.set(String(r.id), rec);
    if (r.athleteId) recruitByAthlete.set(String(r.athleteId), rec);
  }
}

// ---- stats ----------------------------------------------------------------------------------------
const P4 = new Set(["SEC", "Big Ten", "Big 12", "ACC", "B1G", "B12"]);
type Line = Record<string, number>;
const stats = new Map<string, { line: Line; tier: number }>();
const usage = new Map<string, { pass: number; rush: number }>();
const ppa = new Map<string, { pass: number | null; rush: number | null }>();
const fbsNames = new Set(teams.filter((t) => t.level === "fbs").map((t) => t.school));
for (const [year, w] of [[LAST, 1], [LAST - 1, 0.5]] as const) {
  for (const r of read(join(CACHE, `stats_player_season__year-${year}.json`)) as any[]) {
    const id = String(r.playerId);
    const tier = P4.has(r.conference) || r.team === "Notre Dame" ? 0 : fbsNames.has(r.team) ? -0.35 : -1.0;
    const e = stats.get(id) ?? { line: {}, tier: 0 };
    const key = `${r.category}.${r.statType}`;
    const v = Number(r.stat);
    if (!Number.isFinite(v)) continue;
    // Rates (PCT, YPC, AVG, LONG) are recomputed from counts; LONG keeps the best season.
    if (/\.(PCT|YPC|YPA|YPR|AVG|YPP)$/.test(key)) continue;
    if (key.endsWith(".LONG")) e.line[key] = Math.max(e.line[key] ?? 0, v);
    else e.line[key] = (e.line[key] ?? 0) + w * v;
    if (year === LAST || !stats.has(id)) e.tier = tier;
    stats.set(id, e);
  }
  for (const r of read(join(CACHE, `player_usage__year-${year}.json`)) as any[]) {
    if (year === LAST || !usage.has(String(r.id))) usage.set(String(r.id), { pass: r.usage.pass ?? 0, rush: r.usage.rush ?? 0 });
  }
  for (const r of read(join(CACHE, `ppa_players_season__year-${year}.json`)) as any[]) {
    if (year === LAST || !ppa.has(String(r.id))) ppa.set(String(r.id), { pass: r.averagePPA?.pass ?? null, rush: r.averagePPA?.rush ?? null });
  }
}

// ---- positions ------------------------------------------------------------------------------------
function gamePos(listed: string, rec: Recruit | undefined, weight: number | null): Pos {
  const rp = rec?.position;
  switch (listed) {
    case "QB": case "RB": case "WR": case "TE": case "OL": case "LB": case "CB": case "S": case "K": case "P": case "LS": return listed;
    case "FB": return "RB";
    case "EDGE": return "DE";
    case "DL": return rp === "DT" ? "DT" : rp && ["SDE", "WDE", "EDGE", "OLB"].includes(rp) ? "DE" : (weight ?? 280) >= 285 ? "DT" : "DE";
    case "DB": return rp === "S" ? "S" : rp === "CB" ? "CB" : (weight ?? 190) >= 198 ? "S" : "CB";
    case "ATH": return rp === "QB" || rp === "DUAL" || rp === "PRO" ? "QB" : rp === "RB" || rp === "APB" ? "RB" : rp === "CB" ? "CB" : rp === "S" ? "S" : "WR";
    default: return "WR";
  }
}

// ---- evidence -------------------------------------------------------------------------------------
/** One stat signal: metric value, its sample size, and k (sample at which evidence and prior weigh equally). */
interface Signal { v: number; n: number }
type Metrics = Record<string, Signal | null>;
const g = (l: Line, k: string) => l[k] ?? 0;

function metrics(pos: Pos, id: string, l: Line): Metrics {
  const pp = ppa.get(id), us = usage.get(id);
  const att = g(l, "passing.ATT"), comp = g(l, "passing.COMPLETIONS"), car = g(l, "rushing.CAR"), rec = g(l, "receiving.REC");
  const fum = g(l, "fumbles.FUM");
  switch (pos) {
    case "QB": return {
      comp: att ? { v: comp / att, n: att } : null,
      ypa: att ? { v: g(l, "passing.YDS") / att, n: att } : null,
      ypc: comp ? { v: g(l, "passing.YDS") / comp, n: comp } : null,
      int: att ? { v: -(g(l, "passing.INT") - 0.25 * g(l, "passing.TD")) / att, n: att } : null,
      ppa: pp?.pass != null && att ? { v: pp.pass, n: att } : null,
      run: car ? { v: g(l, "rushing.YDS") / car, n: car } : null,
      fum: att + car ? { v: -fum / (att + car), n: att + car } : null,
    };
    case "RB": return {
      ypc: car ? { v: g(l, "rushing.YDS") / car, n: car } : null,
      ppa: pp?.rush != null && car ? { v: pp.rush, n: car } : null,
      long: car ? { v: Math.log(1 + g(l, "rushing.LONG")), n: car } : null,
      td: car ? { v: g(l, "rushing.TD") / car, n: car } : null,
      fum: car + rec ? { v: -fum / (car + rec), n: car + rec } : null,
      ypr: rec ? { v: g(l, "receiving.YDS") / rec, n: rec } : null,
      vol: { v: car, n: Math.max(car, 1) },
    };
    case "WR": case "TE": return {
      share: us && rec ? { v: us.pass, n: rec } : null,
      ppa: pp?.pass != null && rec ? { v: pp.pass, n: rec } : null,
      ypr: rec ? { v: g(l, "receiving.YDS") / rec, n: rec } : null,
      long: rec ? { v: Math.log(1 + g(l, "receiving.LONG")), n: rec } : null,
      td: rec ? { v: g(l, "receiving.TD") / rec, n: rec } : null,
      vol: { v: rec, n: Math.max(rec, 1) },
    };
    case "DE": case "DT": case "LB": case "CB": case "S": {
      const tot = g(l, "defensive.TOT"), sk = g(l, "defensive.SACKS"), hur = g(l, "defensive.QB HUR"), tfl = g(l, "defensive.TFL");
      const pd = g(l, "defensive.PD"), ints = g(l, "interceptions.INT"), n = tot + 4;
      return {
        rush: { v: sk + 0.5 * hur, n }, tfl: { v: tfl - sk, n }, tot: { v: tot, n },
        cover: { v: pd + 2 * ints, n }, ints: { v: ints, n }, solo: tot ? { v: g(l, "defensive.SOLO") / tot, n: tot } : null,
      };
    }
    case "K": return {
      fg: g(l, "kicking.FGA") ? { v: g(l, "kicking.FGM") / g(l, "kicking.FGA"), n: g(l, "kicking.FGA") } : null,
      long: g(l, "kicking.FGA") ? { v: g(l, "kicking.LONG"), n: g(l, "kicking.FGA") } : null,
    };
    case "P": return {
      ypp: g(l, "punting.NO") ? { v: g(l, "punting.YDS") / g(l, "punting.NO"), n: g(l, "punting.NO") } : null,
      in20: g(l, "punting.NO") ? { v: (g(l, "punting.In 20") - g(l, "punting.TB")) / g(l, "punting.NO"), n: g(l, "punting.NO") } : null,
    };
    default: return {};
  }
}

/** Per position: which metrics feed each attribute (weight), and k for each metric. */
const MAP: Partial<Record<Pos, { k: Record<string, number>; min: number; attr: Record<string, [string, number][]> }>> = {
  QB: { min: 150, k: { comp: 150, ypa: 200, ypc: 150, int: 350, ppa: 200, run: 60, fum: 400 }, attr: {
    acc_short: [["comp", 0.8], ["ppa", 0.2]], acc_deep: [["ypa", 0.6], ["ypc", 0.4]], arm: [["ypc", 0.7], ["ypa", 0.3]],
    decisions: [["int", 0.7], ["ppa", 0.3]], pocket: [["ppa", 0.6], ["comp", 0.2], ["int", 0.2]], speed: [["run", 1]], security: [["fum", 1]] } },
  RB: { min: 60, k: { ypc: 120, ppa: 150, long: 100, td: 200, fum: 300, ypr: 25, vol: 40 }, attr: {
    vision: [["ypc", 0.5], ["ppa", 0.3], ["vol", 0.2]], elusive: [["ppa", 0.4], ["ypc", 0.3], ["long", 0.3]], power: [["td", 0.5], ["ypc", 0.3], ["vol", 0.2]],
    speed: [["long", 0.7], ["ypc", 0.3]], security: [["fum", 1]], hands: [["ypr", 1]] } },
  WR: { min: 20, k: { share: 25, ppa: 40, ypr: 30, long: 30, td: 60, vol: 15 }, attr: {
    route: [["share", 0.5], ["vol", 0.3], ["ppa", 0.2]], hands: [["ppa", 0.6], ["vol", 0.4]], speed: [["long", 0.6], ["ypr", 0.4]],
    contested: [["td", 0.6], ["ypr", 0.4]], rac: [["ypr", 0.5], ["ppa", 0.5]] } },
  TE: { min: 12, k: { share: 25, ppa: 40, ypr: 30, long: 30, td: 60, vol: 15 }, attr: {
    route: [["share", 0.5], ["vol", 0.3], ["ppa", 0.2]], hands: [["ppa", 0.6], ["vol", 0.4]], speed: [["long", 0.6], ["ypr", 0.4]] } },
  DE: { min: 15, k: { rush: 25, tfl: 30, tot: 20, cover: 40, ints: 80, solo: 40 }, attr: {
    pass_rush: [["rush", 1]], run_def: [["tfl", 0.6], ["tot", 0.4]], shed: [["tot", 0.6], ["tfl", 0.4]] } },
  DT: { min: 12, k: { rush: 25, tfl: 30, tot: 20, cover: 40, ints: 80, solo: 40 }, attr: {
    pass_rush: [["rush", 1]], run_def: [["tfl", 0.5], ["tot", 0.5]], shed: [["tot", 0.6], ["tfl", 0.4]] } },
  LB: { min: 25, k: { rush: 30, tfl: 30, tot: 20, cover: 30, ints: 80, solo: 40 }, attr: {
    run_fit: [["tfl", 0.6], ["tot", 0.4]], tackle: [["tot", 0.6], ["solo", 0.4]], coverage: [["cover", 0.8], ["ints", 0.2]], blitz: [["rush", 1]] } },
  CB: { min: 20, k: { rush: 60, tfl: 60, tot: 25, cover: 20, ints: 50, solo: 40 }, attr: {
    man: [["cover", 0.8], ["ints", 0.2]], zone: [["cover", 0.6], ["ints", 0.4]], ball: [["ints", 0.6], ["cover", 0.4]], tackle: [["tot", 0.6], ["solo", 0.4]] } },
  S: { min: 25, k: { rush: 60, tfl: 40, tot: 20, cover: 25, ints: 50, solo: 40 }, attr: {
    zone: [["cover", 0.7], ["ints", 0.3]], range: [["cover", 0.5], ["tot", 0.5]], ball: [["ints", 0.6], ["cover", 0.4]],
    tackle: [["tot", 0.6], ["solo", 0.4]], run_sup: [["tfl", 0.5], ["tot", 0.5]] } },
  K: { min: 10, k: { fg: 25, long: 12 }, attr: { k_acc: [["fg", 1]], k_power: [["long", 1]] } },
  P: { min: 20, k: { ypp: 25, in20: 40 }, attr: { p_power: [["ypp", 1]], hang: [["in20", 0.6], ["ypp", 0.4]] } },
};

// ---- build the player list ------------------------------------------------------------------------
const teamOf = new Map(teams.map((t) => [t.id, t]));
interface Work { p: RatedPlayer; id: string; rec?: Recruit; m: Metrics; tier: number }
const work: Work[] = [];
for (const [tid, list] of Object.entries(rosters)) {
  for (const r of list) {
    const rec = (r.recruit_ids ?? []).map((x: any) => recruitById.get(String(x))).find(Boolean) ?? recruitByAthlete.get(String(r.id));
    const pos = gamePos(r.pos, rec, r.weight);
    const classYears: Record<string, number> = { FR: 0.5, SO: 1.5, JR: 2.5, SR: 3.5 };
    const years = rec ? Math.max(0, Math.min(5, SEASON - rec.year)) : classYears[r.class] ?? 1.5;
    const st = stats.get(String(r.id));
    work.push({
      id: String(r.id), rec, tier: st?.tier ?? (teamOf.get(Number(tid))?.level === "fbs" ? -0.35 : -1),
      m: st ? metrics(pos, String(r.id), st.line) : {},
      p: {
        id: Number(r.id), team_id: Number(tid), first: r.first, last: r.last, pos, listed: r.pos, class: r.class, years,
        jersey: r.jersey, height: r.height, weight: r.weight, home: r.home,
        stars: rec?.stars ?? null, composite: rec?.rating ?? null, natl_rank: rec?.rank ?? null,
        attrs: {}, traits: { stamina: 75, injury: 50, toughness: 75, discipline: 75 }, hidden: { potential: 75, work_ethic: 75 },
        tend: {}, ovr: 0, basis: "prior", sample: 0,
      },
    });
  }
}

// Standardize each metric against regulars at the position (sample at or above the position minimum).
const norm = new Map<string, { m: number; sd: number }>();
for (const [pos, spec] of Object.entries(MAP) as [Pos, NonNullable<typeof MAP[Pos]>][]) {
  for (const key of Object.keys(spec.k)) {
    const xs = work.filter((w) => w.p.pos === pos && w.m[key] && w.m[key]!.n >= spec.min && w.tier === 0).map((w) => w.m[key]!.v);
    if (xs.length < 10) continue;
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) || 1;
    norm.set(`${pos}.${key}`, { m, sd });
  }
}
const evidenceZ = (w: Work, key: string) => {
  const s = w.m[key], nm = norm.get(`${w.p.pos}.${key}`);
  if (!s || !nm) return null;
  return { z: Math.max(-3, Math.min(3, (s.v - nm.m) / nm.sd)) + w.tier, n: s.n };
};

// Prior: fit z_general ~ a + b * recruit z + c * min(years, 4) on players with big samples, per position.
const priorFit = new Map<Pos, [number, number, number]>();
for (const [pos, spec] of Object.entries(MAP) as [Pos, NonNullable<typeof MAP[Pos]>][]) {
  const rows: [number, number, number][] = [];
  for (const w of work) {
    if (w.p.pos !== pos) continue;
    const zs = Object.keys(spec.attr).flatMap((a) => spec.attr[a].map(([k, wt]) => {
      const e = evidenceZ(w, k);
      return e && e.n >= spec.min * 2 ? e.z * wt : null;
    })).filter((x): x is number => x != null);
    if (zs.length < 3) continue;
    rows.push([w.rec ? w.rec.rz : -2.5, Math.min(4, w.p.years), zs.reduce((a, b) => a + b, 0) / zs.length]);
  }
  // Ordinary least squares with three unknowns.
  const X = rows.map(([rz, y]) => [1, rz, y]), Y = rows.map((r) => r[2]);
  const A = [0, 1, 2].map((i) => [0, 1, 2].map((j) => X.reduce((a, x) => a + x[i] * x[j], 0) + (i === j ? 1 : 0)));
  const B = [0, 1, 2].map((i) => X.reduce((a, x, n) => a + x[i] * Y[n], 0));
  priorFit.set(pos, solve(A, B) as [number, number, number]);
}

function solve(A: number[][], b: number[]): number[] {
  const n = b.length, M = A.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    [M[c], M[p]] = [M[p], M[c]];
    if (Math.abs(M[c][c]) < 1e-12) continue;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((r, i) => (Math.abs(r[i]) < 1e-12 ? 0 : r[n] / r[i]));
}

const PRIOR: [number, number, number] = [-1.1, 0.3, 0.25];

// ---- rate ------------------------------------------------------------------------------------------
for (const w of work) {
  const { p } = w;
  const rng = new Rng(mixSeed(SEASON, "player", p.id));
  const spec = MAP[p.pos];
  // The fit above only sees players who played, so recruiting looks weaker than it is; the prior uses
  // fixed weights instead (a 5-star true freshman starts near 73, an average recruit grows about
  // 2 points a season) and the fit is printed for reference.
  const [a, b, c] = PRIOR;
  const rz = w.rec ? w.rec.rz : -2.5;
  const levelPrior = teamOf.get(p.team_id)?.level === "fbs" ? 0 : -1.0;
  // Players with no stats are mostly depth: below what their recruiting alone suggests.
  const hasStats = Object.values(w.m).some((s) => s && s.n >= (spec?.min ?? 1) * 0.3);
  // Seasons only count as growth when the player got on the field; a long-time backup is a signal too.
  const played = Math.min(1, Object.values(w.m).reduce((mx, s) => Math.max(mx, s ? s.n : 0), 0) / (spec?.min ?? 1));
  const benched = p.years >= 2 && played < 0.2 ? 0.3 : 0;
  const prior = a + b * rz + c * Math.min(4, p.years) * (0.3 + 0.7 * played) + (w.rec ? 0 : levelPrior) - (hasStats ? 0 : 0.35) - benched;
  let nTot = 0;
  for (const attr of ATTRS[p.pos]) {
    let zAttr = prior;
    const feeds = spec?.attr[attr];
    if (feeds) {
      let num = 0, den = 0;
      for (const [k, wt] of feeds) {
        const e = evidenceZ(w, k);
        if (!e) continue;
        const kk = spec!.k[k];
        const sh = e.n / (e.n + kk);
        num += wt * sh * (e.z - prior);
        den += wt;
        nTot = Math.max(nTot, e.n);
      }
      if (den) zAttr = prior + num / den;
    }
    // Unmeasured attributes and individual variety: the player's level plus seeded noise.
    zAttr += rng.gauss(0, feeds ? 0.25 : 0.45);
    p.attrs[attr] = fromZ(zAttr);
  }
  // Size shapes the unmeasured: heavier tight ends block better, lighter receivers are quicker.
  if (p.pos === "TE" && p.weight) { const d = (p.weight - 245) / 12; p.attrs.run_block = fromZ(toZ(p.attrs.run_block) + 0.3 * d); p.attrs.speed = fromZ(toZ(p.attrs.speed) - 0.2 * d); }
  if (p.pos === "OL") { const e = Math.min(4, p.years); p.attrs.discipline = fromZ(toZ(p.attrs.discipline) + 0.1 * (e - 2)); }
  p.basis = nTot >= (spec?.min ?? Infinity) ? "stats" : "prior";
  p.sample = Math.round(nTot);

  // Traits: no public data, so realistic draws; toughness and stamina lean on position.
  p.traits = {
    stamina: fromZ(rng.gauss(p.pos === "DT" ? -0.5 : p.pos === "QB" || p.pos === "OL" ? 0.3 : 0, 0.8)),
    injury: Math.max(1, Math.min(99, Math.round(50 + 15 * rng.gauss(0, 1)))),
    toughness: fromZ(rng.gauss(0, 0.8)),
    discipline: p.pos === "OL" ? p.attrs.discipline : fromZ(rng.gauss(0, 0.8)),
  };
  // Potential is set from his final overall once the team anchor has moved it (below). The draw that
  // used to place it stays so work ethic keeps its value.
  rng.gauss(0, 1);
  p.hidden = { potential: 0, work_ethic: fromZ(rng.gauss(0, 1)) };

  // Tendencies.
  const l = stats.get(w.id)?.line ?? {};
  if (p.pos === "QB") {
    const att = g(l, "passing.ATT"), car = g(l, "rushing.CAR");
    const raw = att + car > 0 ? car / (att + car) : 0.1;
    const n = att + car;
    p.tend.scramble = Math.round(Math.max(0.03, Math.min(0.35, 0.71 * ((raw * n + 0.12 * 120) / (n + 120)))) * 1000) / 1000;
  }
  const us = usage.get(w.id);
  if (us && ["RB", "QB", "WR"].includes(p.pos) && us.rush > 0.02) p.tend.carry = us.rush;
  if (us && ["WR", "TE", "RB"].includes(p.pos) && us.pass > 0.02) p.tend.target = us.pass;
}

// ---- scale ----------------------------------------------------------------------------------------
// Averaging several stat signals and shrinking narrows the spread, so each attribute is rescaled to the
// rating scale's definition: FBS regulars (rated from stats) have a median of 75 and an SD of 8.
for (const pos of Object.keys(ATTRS) as Pos[]) {
  const regs = work.filter((w) => w.p.pos === pos && w.p.basis === "stats" && teamOf.get(w.p.team_id)?.level === "fbs");
  if (regs.length < 30) continue;
  for (const attr of ATTRS[pos]) {
    const zs = regs.map((w) => toZ(w.p.attrs[attr])).sort((x, y) => x - y);
    const med = zs[Math.floor(zs.length / 2)];
    const m = zs.reduce((x, y) => x + y, 0) / zs.length;
    const sd = Math.sqrt(zs.reduce((x, y) => x + (y - m) ** 2, 0) / zs.length) || 1;
    for (const w of work) if (w.p.pos === pos) w.p.attrs[attr] = fromZ((toZ(w.p.attrs[attr]) - med) / sd);
  }
}

// Line and long snappers have no individual stats: center each FBS team's top five (or one) on 75.
for (const [pos, n] of [["OL", 5], ["LS", 1]] as const) {
  const top: number[] = [];
  for (const t of teams.filter((x) => x.level === "fbs")) {
    const ps = work.filter((w) => w.p.team_id === t.id && w.p.pos === pos).map((w) => w.p);
    ps.sort((a, b) => overall(pos, b.attrs) - overall(pos, a.attrs));
    top.push(...ps.slice(0, n).map((p) => toZ(overall(pos, p.attrs))));
  }
  top.sort((a, b) => a - b);
  const med = top[Math.floor(top.length / 2)];
  for (const w of work) if (w.p.pos === pos) for (const a of ATTRS[pos]) w.p.attrs[a] = fromZ(toZ(w.p.attrs[a]) - med);
}

// ---- team anchor ----------------------------------------------------------------------------------
/** Which slot attributes feed each unit input, so a unit's bias can be put on its players. */
const FEEDS: Record<string, [Slot[], string[]]> = {
  qb_short: [["QB"], ["acc_short"]], qb_deep: [["QB"], ["acc_deep"]], qb_arm: [["QB"], ["arm"]], qb_decisions: [["QB"], ["decisions"]], qb_pocket: [["QB"], ["pocket"]],
  recv_route: [["WR_X", "WR_Z", "WR_SLOT", "TE1"], ["route"]], recv_hands: [["WR_X", "WR_Z", "WR_SLOT", "TE1"], ["hands"]],
  recv_speed: [["WR_X", "WR_Z", "WR_SLOT", "TE1"], ["speed"]], recv_rac: [["WR_X", "WR_Z", "WR_SLOT"], ["rac"]],
  recv_contested: [["WR_X", "WR_Z", "WR_SLOT"], ["contested"]],
  pass_pro: [["LT", "LG", "C", "RG", "RT"], ["pass_block"]], run_block: [["LT", "LG", "C", "RG", "RT", "TE1"], ["run_block"]],
  rb_vision: [["RB1"], ["vision"]], rb_power: [["RB1"], ["power"]], rb_speed: [["RB1"], ["speed"]], rb_elusive: [["RB1"], ["elusive"]],
  ball_security: [["RB1", "RB2", "QB"], ["security"]],
  pass_rush: [["DE1", "DE2", "DT1", "DT2"], ["pass_rush"]], run_def: [["DE1", "DE2", "DT1", "DT2"], ["run_def", "shed"]],
  lb_run_fit: [["LB1", "LB2"], ["run_fit"]], lb_speed: [["LB1", "LB2"], ["speed"]],
  coverage: [["CB1", "CB2", "NB", "S1", "S2", "LB1", "LB2"], ["man", "zone", "coverage"]], ball_skills: [["CB1", "CB2", "NB", "S1", "S2"], ["ball"]],
  range: [["S1", "S2"], ["range"]], tackling: [["LB1", "LB2", "S1", "S2", "CB1", "CB2", "NB"], ["tackle"]],
};
const MAX_BIAS = 0.9;

function anchor(target: TeamRatings, l: Lineup): Record<string, number> {
  const bias: Record<string, number> = {};
  for (const [side, terms, tgt] of [["offense", OFFENSE_TERMS, target.offense], ["defense", DEFENSE_TERMS, target.defense]] as const) {
    const u = units(l);
    const sh = shifts(u, terms);
    // Residual each rate needs, in its own linear scale.
    const need = RATES.map((r) => residual(r, tgt[r], applyBase(r, sh[r])));
    const keys = [...new Set(RATES.flatMap((r) => terms[r].map(([k]) => k)))];
    // Ridge least squares for the unit biases: minimize |need - C b|^2 + lambda |b|^2.
    const C = RATES.map((r) => keys.map((k) => terms[r].find(([kk]) => kk === k)?.[1] ?? 0));
    const lam = 0.004;
    const A = keys.map((_, i) => keys.map((__, j) => C.reduce((a, row) => a + row[i] * row[j], 0) + (i === j ? lam : 0)));
    const B = keys.map((_, i) => C.reduce((a, row, r) => a + row[i] * need[r], 0));
    const b = solve(A, B);
    keys.forEach((k, i) => { bias[k] = (bias[k] ?? 0) + Math.max(-MAX_BIAS, Math.min(MAX_BIAS, b[i])); });
    void side;
  }
  // Put each unit's bias on the starters who make up the unit.
  const done = new Set<string>();
  for (const [k, b] of Object.entries(bias)) {
    const [slots, attrs] = FEEDS[k];
    for (const s of slots) {
      const p = l.slot[s];
      if (!p) continue;
      for (const a of attrs) {
        if (p.attrs[a] == null) continue;
        const key = `${p.id}.${a}.${k}`;
        if (done.has(key)) continue;
        done.add(key);
        p.attrs[a] = fromZ(toZ(p.attrs[a]) + b);
      }
    }
  }
  return bias;
}

/** Whatever the bounded player moves could not explain stays with the team as its scheme offset. */
function schemeFor(target: TeamRatings, l: Lineup): SchemeOffsets {
  const u = units(l);
  const so = shifts(u, OFFENSE_TERMS), sd = shifts(u, DEFENSE_TERMS);
  const scheme: SchemeOffsets = { offense: {}, defense: {} };
  for (const r of RATES) {
    scheme.offense[r] = residual(r, target.offense[r], applyBase(r, so[r]));
    scheme.defense[r] = residual(r, target.defense[r], applyBase(r, sd[r]));
  }
  return scheme;
}
const round4 = (x: number) => Math.round(x * 10000) / 10000;

const LOG = new Set<Rate>(["yds_per_comp", "rush_ypc"]);
function applyBase(r: Rate, shift: number): number {
  return LOG.has(r) ? LEAGUE[r] * Math.exp(shift) : 1 / (1 + Math.exp(-(Math.log(LEAGUE[r] / (1 - LEAGUE[r])) + shift)));
}

// The dynasty opens (Aug 24, 2026) with each team's real starting QB (from its first game's passing line
// that season) at the top of the depth chart; the auto depth chart's own pick is kept as the backup.
const realQb = new Map<number, number>();
const schoolId = new Map(teams.map((t) => [t.school, t.id]));
for (const wk of [2, 1]) {
  for (const gm of read(join(CACHE, `games_players__year-${SEASON}_week-${wk}_category-passing.json`)) as any[]) {
    for (const t of gm.teams) {
      const ca = t.categories.flatMap((c: any) => c.types).find((ty: any) => ty.name === "C/ATT");
      const best = ca?.athletes.map((a: any) => ({ id: Number(a.id), att: Number(String(a.stat).split("/")[1] ?? 0) })).sort((a: any, b: any) => b.att - a.att)[0];
      const tid = schoolId.get(t.team);
      if (best && tid != null) realQb.set(tid, best.id);
    }
  }
}
let realQbUsed = 0, autoQbAgrees = 0;
function withRealQb(d: ReturnType<typeof autoDepth>, tid: number) {
  const q = realQb.get(tid);
  if (q == null || !rosterIds.has(q) || work.find((w) => w.p.id === q)?.p.team_id !== tid) return d;
  if (d.QB?.[0] === q) autoQbAgrees++;
  realQbUsed++;
  d.QB = [q, ...(d.QB ?? []).filter((x) => x !== q)].slice(0, 3);
  return d;
}
const rosterIds = new Set(work.map((w) => w.p.id));

const out: Record<string, { scheme: SchemeOffsets; kicking: { fg_skill: number; punt_gross: number }; depth: ReturnType<typeof autoDepth>; players: unknown[] }> = {};
const report: string[] = [];
for (const [tid, list] of Object.entries(rosters)) {
  const prior = priors[tid]?.ratings;
  if (!prior) { report.push(`no prior for team ${tid}`); continue; }
  const ps = work.filter((w) => w.p.team_id === Number(tid)).map((w) => w.p);
  for (const p of ps) p.ovr = overall(p.pos, p.attrs);
  const byId = new Map(ps.map((p) => [p.id, p]));
  anchor(prior, lineup(withRealQb(autoDepth(ps), Number(tid)), byId));
  for (const p of ps) p.ovr = overall(p.pos, p.attrs);
  // Where each player tops out: room above his own overall by age, so young starters keep theirs.
  for (const p of ps) p.hidden.potential = seedPotential(p, SEASON);
  const depth = withRealQb(autoDepth(ps), Number(tid));
  const l = lineup(depth, byId);
  const scheme = schemeFor(prior, l);
  // Kicking base: the team's measured kicking minus what its kicker and punter ratings add.
  const k = l.slot.K, pu = l.slot.P;
  const kz = kickerSkill(k), pz = punterSkill(pu);
  const kicking = { fg_skill: round4(prior.fg_skill - kz), punt_gross: round4(prior.punt_gross - pz) };
  // Check the compile reproduces the prior's unit rates.
  const compiled = compileTeam(prior, l, scheme, kicking);
  const err = Math.max(...RATES.map((r) => Math.abs(compiled.offense[r] / prior.offense[r] - 1)), ...RATES.map((r) => Math.abs(compiled.defense[r] / prior.defense[r] - 1)));
  if (err > 1e-6) report.push(`${prior.name}: compile differs from prior by ${(err * 100).toFixed(4)}%`);
  out[tid] = { scheme, kicking, depth, players: ps.map(packPlayer) };
  void list;
}

writeFileSync(join(SEED, "players.json"), JSON.stringify({ as_of: read(join(SEED, "manifest.json")).start_date, format: 1, teams: out }));
process.stdout.on("error", () => {});
console.log(`rated ${work.length} players on ${Object.keys(out).length} teams; ${work.filter((w) => w.p.basis === "stats").length} from stats`);
console.log("prior fits (a, b recruit z, c years):", JSON.stringify(Object.fromEntries([...priorFit].map(([k, v]) => [k, v.map((x) => +x.toFixed(3))]))));
console.log(`real starting QB placed for ${realQbUsed / 2} teams; the auto depth chart already had him first for ${autoQbAgrees / 2}`);
if (report.length) console.log(report.slice(0, 20).join("\n"));
