/**
 * M2 gates that one season can show: budgets in the right order by conference, every payroll under its
 * budget all season, the biggest spenders, fair-market-value cuts rare and at the top of the market, and
 * what an unhappy locker room costs. Speed is in `npm run check:m1` (full seasons with money on).
 *
 *   npm run check:m2 -- [seasons=3] [pcsa]
 */
import { readFileSync } from "node:fs";
import { loadSeed, mixSeed, Season } from "../src/index.ts";

const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
// The Athletic's 2026 roster budgets (revenue share and program-controlled NIL), and its 12 biggest.
const ATHLETIC = new Map(readFileSync(new URL("../../../importer/roster_budgets_2026.csv", import.meta.url), "utf8").split("\n")
  .filter((l) => l && !l.startsWith("#") && !l.startsWith("school,"))
  .map((l) => { const [school, lo, hi] = l.split(","); return [school, [Number(lo) * 1e6, Number(hi) * 1e6]] as const; }));
const REAL_TOP = [...ATHLETIC].sort((a, b) => b[1][0] + b[1][1] - a[1][0] - a[1][1]).slice(0, 12).map(([s]) => s);
const CONF_AVG: Record<string, number> = { SEC: 35.5e6, "Big Ten": 29e6, ACC: 23e6, "Big 12": 20e6 };
const seed = loadSeed();
const seasons = Number(process.argv[2] || 3);
const pcsa = process.argv[3] === "pcsa";
let inRange = 0, ranged = 0;
const confSpend = new Map<string, number[]>();
const rows: [string, string, string, boolean][] = [];
let cuts = 0, deals = 0, overCap = 0, topHits = 0;
const cutVals: number[] = [], dealVals: number[] = [];
const confRev = new Map<string, number[]>();
for (let i = 0; i < seasons; i++) {
  const s = Season.create(seed, { seed: mixSeed("m2-gates", i), settings: { keep_pbp: "none", pcsa } as never });
  const fbs = s.teams.filter((t) => t.level === "fbs");
  while (!s.done) {
    s.advanceDay();
    if (s.state.date.endsWith("-15")) for (const t of fbs) if (s.payroll(t.id) > (s.state.pools?.[t.id] ?? 0) + (s.state.retention?.[t.id] ?? 0)) overCap++;
  }
  for (const [pid, d] of Object.entries(s.state.nil!)) {
    deals++;
    (d.status === "cut" ? cutVals : dealVals).push(s.value(Number(pid)));
    if (d.status === "cut") cuts++;
  }
  for (const t of fbs) {
    const b = s.budget(t.id)!;
    const conf = P4.has(t.conference) ? t.conference : t.school === "Notre Dame" ? "Notre Dame" : t.conference;
    confRev.set(conf, [...(confRev.get(conf) ?? []), Object.values(b.revenue).reduce((a, x) => a + x, 0)]);
  }
  const all = fbs.map((t) => ({ s: t.school, c: t.conference, x: s.roster(t.id).reduce((a, p) => a + s.pay(p.id), 0) })).sort((a, b) => b.x - a.x);
  const spend = all.slice(0, 10);
  topHits += spend.filter((x) => REAL_TOP.includes(x.s)).length;
  for (const x of all) {
    const r = ATHLETIC.get(x.s);
    if (r) { ranged++; if (x.x >= 0.9 * r[0] && x.x <= 1.1 * r[1]) inRange++; }
    if (CONF_AVG[x.c]) confSpend.set(x.c, [...(confSpend.get(x.c) ?? []), x.x]);
  }
  if (i === 0) console.log("Top 10 roster spending:", spend.map((x) => `${x.s} $${(x.x / 1e6).toFixed(1)}M`).join(", "));
}
const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const order = [...confRev].map(([c, v]) => [c, avg(v)] as const).sort((a, b) => b[1] - a[1]);
console.log("Football revenue by conference:", order.map(([c, v]) => `${c} $${(v / 1e6).toFixed(0)}M`).join(", "));
const p4Low = Math.min(...order.filter(([c]) => P4.has(c)).map(([, v]) => v)), g5High = Math.max(...order.filter(([c]) => !P4.has(c) && c !== "Notre Dame").map(([, v]) => v));
rows.push(["Budgets: every power conference above every other", `${(p4Low / 1e6).toFixed(0)}M vs ${(g5High / 1e6).toFixed(0)}M`, "P4 > G5", p4Low > g5High]);
rows.push(["Budgets: within 10% of Knight-Newhouse", "not loaded", "real finances needed", false]);
rows.push(["Payrolls: over budget on any 15th of the month", String(overCap), "0", overCap === 0]);
rows.push(["Payrolls: within 10% of The Athletic's range", `${inRange / seasons} of ${ranged / seasons}`, "75%+", inRange / ranged >= 0.75]);
const confOff = Object.entries(CONF_AVG).map(([c, v]) => avg(confSpend.get(c)!) / v - 1);
rows.push(["Payrolls: power conferences vs The Athletic's averages", confOff.map((x) => `${x >= 0 ? "+" : ""}${Math.round(100 * x)}%`).join(" "), "each within 10%", confOff.every((x) => Math.abs(x) <= 0.1)]);
rows.push(["Payrolls: top 10 spenders among the reported top 12", `${(topHits / seasons).toFixed(1)} of 10`, "6+", topHits / seasons >= 6]);
rows.push(["Fair value: AI deals cut back (egregious only)", `${(100 * cuts / deals).toFixed(1)}%`, "under 1%", cuts / deals < 0.01]);
rows.push(["Fair value: any cuts at the top of the market", cuts ? `median $${(median(cutVals) / 1000).toFixed(0)}K vs $${(median(dealVals) / 1000).toFixed(0)}K` : "none cut", "2x the median deal", !cuts || median(cutVals) >= 2 * median(dealVals)]);

// Morale: stop paying one team's starters and compare its chemistry with the same season paid.
const unpaid = (cut: boolean) => {
  const s = Season.create(seed, { seed: 7, user_team_id: 2509, settings: { keep_pbp: "none", pcsa } as never });
  if (cut) for (const id of new Set(Object.values(s.depthChart(2509)).map((x) => x[0]))) s.setContract(id, 0, 1);
  while (s.state.date < "2026-11-01") s.advanceDay();
  const h = s.hiddenStrength(2509)!;
  return h.h.chem.off + h.h.chem.def;
};
const cost = unpaid(false) - unpaid(true);
rows.push(["Morale: an unpaid starting lineup costs chemistry", `${cost.toFixed(1)} pts/game`, "about 1", cost >= 0.6 && cost <= 1.6]);

const w = Math.max(...rows.map((r) => r[0].length));
for (const [name, got, want, ok] of rows) console.log(`${ok ? "pass" : "FAIL"}  ${name.padEnd(w)}  ${got.padStart(22)}   ${want}`);
