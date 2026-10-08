/**
 * What real transfer portals looked like, for the M3 portal gates: the January 2026 window's entrants
 * matched to their 2025 rosters (name and school), so entry rates can be read by depth chart, rating and
 * class, and where entrants landed by their rating.
 *
 *   npx tsx packages/core/scripts/portal-real.ts
 */
import { readFileSync } from "node:fs";
import { loadSeed, seedDir } from "../src/index.ts";

const s25 = loadSeed(seedDir(2025)), s26 = loadSeed(seedDir(2026));
const portal = JSON.parse(readFileSync(new URL("../../../importer/.cache/player_portal__year-2026.json", import.meta.url), "utf8")) as
  { firstName: string; lastName: string; position: string; origin: string; destination: string | null; eligibility: string; stars: number | null }[];
const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
const bySchool = new Map(s25.teams.map((t) => [t.school, t]));
const tier = (t: { conference: string; school: string; level: string } | undefined) => !t ? "none" : t.level !== "fbs" ? "fcs" : P4.has(t.conference) || t.school === "Notre Dame" ? "p4" : "g5";
const norm = (x: string) => x.toLowerCase().replace(/[^a-z]/g, "").replace(/(jr|sr|ii|iii|iv)$/, "");
const entries = new Map<string, (typeof portal)[number]>();
for (const e of portal) if (e.eligibility !== "Withdrawn") entries.set(`${e.origin}|${norm(e.firstName + e.lastName)}`, e);
const pct = (a: number, b: number) => +(100 * a / Math.max(1, b)).toFixed(1);

const rows: { tier: string; starter: boolean; rank: number; rel: number; years: number; ovr: number; entered: boolean; dest: string | null }[] = [];
let matched = 0;
for (const t of s25.teams) {
  if (t.level !== "fbs") continue;
  const tp = s25.players![t.id];
  if (!tp) continue;
  const starters = new Set(Object.values(tp.depth).map((ids) => ids[0]));
  const ovrs = tp.players.map((p) => p.ovr).sort((a, b) => b - a);
  const median = ovrs[Math.floor(ovrs.length / 2)];
  for (const p of tp.players) {
    const e = entries.get(`${t.school}|${norm(p.first + p.last)}`);
    if (e) matched++;
    rows.push({ tier: tier(t), starter: starters.has(p.id), rank: ovrs.indexOf(p.ovr) / ovrs.length, rel: p.ovr - median, years: Math.floor(p.years), ovr: p.ovr, entered: !!e, dest: e ? e.destination : null });
  }
}
const fbsEntries = portal.filter((e) => e.eligibility !== "Withdrawn" && ["p4", "g5"].includes(tier(bySchool.get(e.origin)))).length;
console.log({ fbs_entries: fbsEntries, per_team: +(fbsEntries / s25.teams.filter((t) => t.level === "fbs").length).toFixed(1), matched_to_2025_rosters: matched });
const rate = (f: (r: (typeof rows)[number]) => boolean) => { const xs = rows.filter(f); return `${pct(xs.filter((r) => r.entered).length, xs.length)}% of ${xs.length}`; };
console.log("entry rate (matched only, a lower bound)");
for (const ti of ["p4", "g5"]) {
  console.log(ti, { all: rate((r) => r.tier === ti), starters: rate((r) => r.tier === ti && r.starter), backups: rate((r) => r.tier === ti && !r.starter) });
  for (const [lo, hi] of [[-99, -6], [-6, -2], [-2, 2], [2, 6], [6, 99]]) console.log(`  vs median ${lo}..${hi}`, rate((r) => r.tier === ti && r.rel >= lo && r.rel < hi));
  for (const y of [0, 1, 2, 3, 4]) console.log(`  years ${y}`, rate((r) => r.tier === ti && r.years === y));
}
// Where entrants went, by origin tier and their standing on their old team.
const dest = (d: string | null) => d == null ? "none" : tier(s26.teams.find((t) => t.school === d) ?? bySchool.get(d));
const moved = rows.filter((r) => r.entered);
for (const ti of ["p4", "g5"]) {
  const xs = moved.filter((r) => r.tier === ti), c: Record<string, number> = {};
  for (const r of xs) c[dest(r.dest)] = (c[dest(r.dest)] ?? 0) + 1;
  console.log(`from ${ti}`, c, "no school:", pct(c.none ?? 0, xs.length) + "%");
  for (const [lo, hi] of [[-99, -6], [-6, 0], [0, 6], [6, 99]]) {
    const ys = xs.filter((r) => r.rel >= lo && r.rel < hi), d: Record<string, number> = {};
    for (const r of ys) d[dest(r.dest)] = (d[dest(r.dest)] ?? 0) + 1;
    console.log(`  vs median ${lo}..${hi} (n ${ys.length})`, Object.fromEntries(Object.entries(d).map(([k, v]) => [k, pct(v, ys.length)])));
  }
}
// All entries (not just matched) by direction.
const dir: Record<string, number> = {};
for (const e of portal) { if (e.eligibility === "Withdrawn") continue; const k = `${tier(bySchool.get(e.origin))}>${dest(e.destination)}`; dir[k] = (dir[k] ?? 0) + 1; }
console.log("all entries by direction", dir);
