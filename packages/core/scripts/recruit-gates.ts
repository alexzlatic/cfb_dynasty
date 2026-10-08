/**
 * The M3 recruiting gates: play a dynasty a few seasons with no user team and check each signing class
 * against real ones (docs/recruiting.md). Classes from 2028 on are generated and recruited by the AI.
 *
 *   npx tsx packages/core/scripts/recruit-gates.ts [seasons (default 3)] [league seed]
 */
import { loadSeed, Season, miles, classPoints, starsOf, type Prospect } from "../src/index.ts";

const seasons = Number(process.argv[2] || 3), leagueSeed = Number(process.argv[3] || 7);
const seed = loadSeed();
const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
const fbs = new Map(seed.teams.filter((t) => t.level === "fbs").map((t) => [t.id, t]));
const isP4 = (id: number) => { const t = fbs.get(id); return !!t && (P4.has(t.conference) || t.school === "Notre Dame"); };
const pct = (a: number, b: number) => +(100 * a / Math.max(1, b)).toFixed(1);
const q = (xs: number[], f: number) => { const s = [...xs].sort((a, b) => a - b); return s[Math.round(f * (s.length - 1))]; };
const corr = (a: number[], b: number[]) => { const m = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length; const ma = m(a), mb = m(b); let n = 0, da = 0, db = 0; a.forEach((x, i) => { n += (x - ma) * (b[i] - mb); da += (x - ma) ** 2; db += (b[i] - mb) ** 2; }); return n / Math.sqrt(da * db); };
// Real 2025 FBS signees in game positions (CFBD DL as DT, EDGE as DE, athletes split the way gamePos does).
const REAL_MIX: Record<string, number> = { QB: 6, RB: 8.2, WR: 15.2, TE: 6, OL: 17, DE: 8, DT: 10, LB: 10, CB: 10, S: 9.6 };

let season = Season.create(seed, { seed: leagueSeed, settings: { keep_pbp: "none" } as never });
let prevPts: Map<number, number> | null = null;
for (let n = 1; n <= seasons; n++) {
  const t0 = Date.now();
  while (!season.done) season.advanceDay();
  const st = season.state.recruiting!, cls = season.state.year + 1;
  const signed = st.prospects.filter((p) => p.cls === cls && p.commit);
  const toFbs = signed.filter((p) => fbs.has(p.commit!.team));
  const by = new Map<number, Prospect[]>();
  for (const p of toFbs) (by.get(p.commit!.team) ?? by.set(p.commit!.team, []).get(p.commit!.team)!).push(p);
  const pts = new Map([...fbs.keys()].map((id) => [id, classPoints((by.get(id) ?? []).map((p) => p.svc?.r ?? 0.75))]));
  const top10 = new Set([...pts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([id]) => id));
  const stars = (k: number) => signed.filter((p) => p.svc && starsOf(p.svc.r) === k);
  const five = stars(5), four = stars(4), three = stars(3);
  const near = toFbs.filter((p) => { const t = fbs.get(p.commit!.team)!; return t.venue?.lat != null && miles(p.home, { lat: t.venue.lat, lon: t.venue.lon! }) <= 300; });
  const ids0 = [...fbs.keys()];
  const sizes = [...fbs.keys()].map((id) => (by.get(id) ?? []).length);
  const mix: Record<string, number> = {};
  for (const p of toFbs) mix[p.pos] = (mix[p.pos] ?? 0) + 1;
  const mixOff = Object.fromEntries(Object.entries(REAL_MIX).map(([k, v]) => [k, +(pct(mix[k] ?? 0, toFbs.length) - v).toFixed(1)]));
  const big = [...by.values()].filter((c) => c.length >= 15);
  const ids = [...fbs.keys()];
  console.log(JSON.stringify({
    class: cls, secs: Math.round((Date.now() - t0) / 1000),
    "5* to top-10 class % (70-90)": pct(five.filter((p) => top10.has(p.commit!.team)).length, five.length),
    "4* to P4 % (95+)": pct(four.filter((p) => isP4(p.commit!.team)).length, four.length),
    // Real 2024-25: 41-42% of all signed three-stars, 48% of those who signed with FBS schools.
    "3* to P4 % of all (38-48)": pct(three.filter((p) => isP4(p.commit!.team)).length, three.length),
    "3* to P4 % of FBS (42-55)": pct(three.filter((p) => isP4(p.commit!.team)).length, three.filter((p) => fbs.has(p.commit!.team)).length),
    "within 300 mi % (45-60)": pct(near.length, toFbs.length),
    "class size p10/50/90 (12/20/29)": [q(sizes, 0.1), q(sizes, 0.5), q(sizes, 0.9)],
    "P4 / G5 median size": [q(ids0.filter(isP4).map((id) => (by.get(id) ?? []).length), 0.5), q(ids0.filter((id) => !isP4(id)).map((id) => (by.get(id) ?? []).length), 0.5)],
    "P4 / G5 fill % of target": (() => { const sc = season.schools(); const f = (ok: (id: number) => boolean) => { const ts = sc.filter((t) => fbs.has(t.id) && ok(t.id)); const tg = ts.reduce((a, t) => a + Object.values(t.target).reduce((x, y) => x + (y ?? 0), 0), 0); return pct(ts.reduce((a, t) => a + (by.get(t.id) ?? []).length, 0), tg); }; return [f(isP4), f((id) => !isP4(id))]; })(),
    "mix vs real (pts, within 2)": mixOff,
    "15+ classes: no OL / no QB / 3+ QB": [big.filter((c) => !c.some((p) => p.pos === "OL")).length, big.filter((c) => !c.some((p) => p.pos === "QB")).length, big.filter((c) => c.filter((p) => p.pos === "QB").length >= 3).length, big.length],
    "class pts corr vs last year (0.8-0.92)": prevPts ? +corr(ids.map((id) => prevPts!.get(id)!), ids.map((id) => pts.get(id)!)).toFixed(2) : null,
    "stars 5/4 (25-40, 380-520)": [five.length, four.length], signed: signed.length, to_fbs: toFbs.length,
    fbs_target: season.schools().filter((t) => fbs.has(t.id)).reduce((a, t) => a + Object.values(t.target).reduce((x, y) => x + (y ?? 0), 0), 0),
    "top classes": [...pts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, v]) => `${fbs.get(id)!.school} ${v}`),
  }));
  prevPts = pts;
  if (n < seasons) season = season.nextSeason(seed.coaches).next;
}
