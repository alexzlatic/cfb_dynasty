/**
 * High school stats check: production by position for an average starter and the best in a class, how well
 * stats line up with true potential, and whether they point to prospects the scouts underrate.
 * `npx tsx packages/core/scripts/hsstats-check.ts [seed]`
 */
import { loadSeed } from "../src/seed.ts";
import { Season } from "../src/season.ts";
import { gradeOf, schoolRead, truthAt, type SchoolEye } from "../src/recruiting.ts";
import { HS_LEAD, hsSeason, statRead } from "../src/hsstats.ts";
import type { Pos } from "../src/players.ts";

const seedN = Number(process.argv[2] ?? 7);
const s = Season.create(loadSeed(), { seed: seedN, settings: { keep_pbp: "none" } as never });
const st = s.state.recruiting!, year = s.state.year, end = `${year}-12-20`;
const corr = (a: number[], b: number[]) => {
  const m = (x: number[]) => x.reduce((q, v) => q + v, 0) / x.length;
  const ma = m(a), mb = m(b);
  let n = 0, da = 0, db = 0;
  a.forEach((x, i) => { n += (x - ma) * (b[i] - mb); da += (x - ma) ** 2; db += (b[i] - mb) ** 2; });
  return n / Math.sqrt(da * db);
};
const q = (xs: number[], f: number) => { const ys = [...xs].sort((a, b) => a - b); return ys[Math.min(ys.length - 1, Math.floor(f * ys.length))]; };

// Seniors' senior season (this fall), varsity starters only.
const seniors = st.prospects.filter((p) => gradeOf(p, year) === 3);
console.log(`Senior seasons, ${year} (varsity starters): median / 90th pct / best`);
for (const pos of ["QB", "RB", "WR", "TE", "OL", "DE", "DT", "LB", "CB", "S", "K", "P"] as Pos[]) {
  const lines = seniors.filter((p) => p.pos === pos).map((p) => hsSeason(seedN, p, 3, end)!).filter((x) => x.level === "varsity");
  const show = (k: string) => { const xs = lines.map((l) => l.stats[k] ?? 0); return `${k} ${q(xs, 0.5)} / ${q(xs, 0.9)} / ${Math.max(...xs)}`; };
  const keys = pos === "QB" ? ["pass_yds", "pass_td", "rush_yds"] : pos === "RB" ? ["rush_yds", "rush_td", "rec"] : pos === "DE" || pos === "DT" || pos === "LB" ? ["tackles", "tfl", "sacks"]
    : pos === "CB" || pos === "S" ? ["tackles", "ints", "pd"] : [HS_LEAD[pos]];
  console.log(`  ${pos.padEnd(2)} n=${lines.length}  ${keys.map(show).join("  ")}`);
}
const lv = (g: number) => { const ps = st.prospects.filter((p) => gradeOf(p, year) === g); const ss = ps.map((p) => hsSeason(seedN, p, g as never, end)!); return ["varsity", "backup", "jv"].map((l) => `${l} ${Math.round(100 * ss.filter((x) => x.level === l).length / ss.length)}%`).join(" "); };
console.log("Levels by grade:", [0, 1, 2, 3].map((g) => `${["FR", "SO", "JR", "SR"][g]}: ${lv(g)}`).join(" | "));

// How well stats line up with the truth, and whether they find the scouts' misses.
const eye: SchoolEye = { id: 2294, lat: 41.66, lon: -91.55, state: "IA", regions: [], national: false, width: 1 };
for (const g of [1, 2, 3]) {
  const ps = st.prospects.filter((p) => gradeOf(p, year) === g);
  const rows = ps.map((p) => ({ p, sr: statRead(seedN, p, end), truth: p.path[4], read: schoolRead(eye, p, end, seedN).est, svc: p.svc?.read ?? null })).filter((r) => r.sr);
  const c1 = corr(rows.map((r) => r.sr!.est), rows.map((r) => r.truth));
  const c2 = corr(rows.map((r) => r.read), rows.map((r) => r.truth));
  // Prospects whose stats beat their read by 6+: how often the truth beats the read too.
  const hot = rows.filter((r) => r.sr!.est - r.read >= 6);
  const up = hot.filter((r) => r.truth > r.read).length;
  const gain = hot.reduce((a, r) => a + r.truth - r.read, 0) / Math.max(1, hot.length);
  // How far stats move the staff's read (its read without them, from the inverse-variance weights).
  const shifts = rows.map((r) => { const rd = schoolRead(eye, r.p, end, seedN), w = 1 / rd.sd ** 2, ws = 1 / r.sr!.sd ** 2; return Math.abs(rd.est - (rd.est * w - r.sr!.est * ws) / (w - ws)); });
  // Against the service: prospects it rates below its top 300 whose stats put them 6+ above its read.
  const svcHot = rows.filter((r) => r.svc != null && r.p.svc!.rank > 300 && r.sr!.est - r.svc >= 6);
  const svcUp = svcHot.filter((r) => r.truth >= r.svc! + 3).length;
  const base = rows.filter((r) => r.svc != null && r.p.svc!.rank > 300);
  const baseUp = base.filter((r) => r.truth >= r.svc! + 3).length;
  console.log(`   stats move the read ${(shifts.reduce((a, x) => a + x, 0) / shifts.length).toFixed(2)} on average (90th pct ${q(shifts, 0.9).toFixed(2)}); outside the service's top 300, stats 6+ above its read: ${svcHot.length}, of whom ${Math.round(100 * svcUp / Math.max(1, svcHot.length))}% are truly 3+ better (vs ${Math.round(100 * baseUp / Math.max(1, base.length))}% of all)`);
  console.log(`${["FR", "SO", "JR", "SR"][g]} class: stats vs true arrival r=${c1.toFixed(2)}, staff read vs truth r=${c2.toFixed(2)}; stats 6+ above read: ${hot.length}, truth above read ${Math.round(100 * up / Math.max(1, hot.length))}%, by ${gain.toFixed(1)} on average`);
}
