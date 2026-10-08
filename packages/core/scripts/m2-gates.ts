/**
 * M2 gates that one season can show: budgets in the right order by conference, every payroll under its
 * budget all season, the biggest spenders, fair-market-value cuts rare and at the top of the market, and
 * what an unhappy locker room costs. Speed is in `npm run check:m1` (full seasons with money on).
 *
 *   npm run check:m2 -- [seasons=3]
 */
import { loadSeed, mixSeed, Season } from "../src/index.ts";

const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
// Reported 2025-26 roster spending leaders (revenue share and NIL; On3 and The Athletic estimates).
const REAL_TOP = ["Texas", "Ohio State", "Texas Tech", "LSU", "Oregon", "Miami", "Georgia", "Alabama", "Tennessee", "Ole Miss", "Michigan", "Texas A&M"];
const seed = loadSeed();
const seasons = Number(process.argv[2] || 3);
const rows: [string, string, string, boolean][] = [];
let cuts = 0, deals = 0, overCap = 0, topHits = 0;
const cutVals: number[] = [], dealVals: number[] = [];
const confRev = new Map<string, number[]>();
for (let i = 0; i < seasons; i++) {
  const s = Season.create(seed, { seed: mixSeed("m2-gates", i), settings: { keep_pbp: "none" } as never });
  const fbs = s.teams.filter((t) => t.level === "fbs");
  while (!s.done) {
    s.advanceDay();
    if (s.state.date.endsWith("-15")) for (const t of fbs) if (s.payroll(t.id) > (s.state.pools?.[t.id] ?? 0)) overCap++;
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
  const spend = fbs.map((t) => ({ s: t.school, x: s.roster(t.id).reduce((a, p) => a + s.pay(p.id), 0) })).sort((a, b) => b.x - a.x).slice(0, 10);
  topHits += spend.filter((x) => REAL_TOP.includes(x.s)).length;
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
rows.push(["Payrolls: top 10 spenders among the reported top 12", `${(topHits / seasons).toFixed(1)} of 10`, "6+", topHits / seasons >= 6]);
rows.push(["Fair value: AI deals cut back", `${(100 * cuts / deals).toFixed(1)}%`, "under 5%", cuts / deals < 0.05]);
rows.push(["Fair value: cuts at the top of the market", `median $${(median(cutVals) / 1000).toFixed(0)}K vs $${(median(dealVals) / 1000).toFixed(0)}K`, "2x the median deal", median(cutVals) >= 2 * median(dealVals)]);

// Morale: stop paying one team's starters and compare its chemistry with the same season paid.
const unpaid = (cut: boolean) => {
  const s = Season.create(seed, { seed: 7, user_team_id: 2509, settings: { keep_pbp: "none" } as never });
  if (cut) for (const id of new Set(Object.values(s.depthChart(2509)).map((x) => x[0]))) s.setContract(id, 0, 1);
  while (s.state.date < "2026-11-01") s.advanceDay();
  const h = s.hiddenStrength(2509)!;
  return h.h.chem.off + h.h.chem.def;
};
const cost = unpaid(false) - unpaid(true);
rows.push(["Morale: an unpaid starting lineup costs chemistry", `${cost.toFixed(1)} pts/game`, "about 1", cost >= 0.6 && cost <= 1.6]);

const w = Math.max(...rows.map((r) => r[0].length));
for (const [name, got, want, ok] of rows) console.log(`${ok ? "pass" : "FAIL"}  ${name.padEnd(w)}  ${got.padStart(22)}   ${want}`);
