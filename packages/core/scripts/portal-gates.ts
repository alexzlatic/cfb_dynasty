/**
 * The M3 portal gates: play a dynasty with no user team through each winter's portal and check it against
 * the January 2026 portal (scripts/portal-real.ts; docs/portal.md).
 *
 *   npx tsx packages/core/scripts/portal-gates.ts [winters (default 1)] [league seed]
 */
import { loadSeed, Season } from "../src/index.ts";

const winters = Number(process.argv[2] || 1), leagueSeed = Number(process.argv[3] || 7);
const pcsa = process.argv.includes("--pcsa");
const seed = loadSeed();
const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
const team = new Map(seed.teams.map((t) => [t.id, t]));
const tier = (id: number | undefined) => { const t = id == null ? undefined : team.get(id); return !t ? "none" : t.level !== "fbs" ? "fcs" : P4.has(t.conference) || t.school === "Notre Dame" ? "p4" : "g5"; };
const pct = (a: number, b: number) => +(100 * a / Math.max(1, b)).toFixed(1);

let season = Season.create(seed, { seed: leagueSeed, settings: { keep_pbp: "none", pcsa } as never });
for (let n = 1; n <= winters; n++) {
  const t0 = Date.now();
  // Rosters as they stood before the portal (for entry rates by year and tier).
  while (!season.state.portal) season.advanceDay();
  const roster = new Map(season.teams.flatMap((t) => season.roster(t.id).map((p) => [p.id, { years: Math.floor(p.years), tier: tier(t.id) }] as const)));
  while (!season.done) season.advanceDay();
  const es = season.state.portal!.entries;
  const fbsTeams = season.teams.filter((t) => t.level === "fbs").length;
  const fbs = es.filter((e) => tier(e.from) !== "fcs");
  const rate = (ti: string, y?: number) => {
    const all = [...roster.values()].filter((r) => r.tier === ti && (y == null || r.years === y)).length;
    const ent = es.filter((e) => tier(e.from) === ti && (y == null || roster.get(e.pid)!.years === y)).length;
    return pct(ent, all);
  };
  const dir: Record<string, number> = {};
  for (const e of es) { const k = `${tier(e.from)}>${e.status === "committed" ? tier(e.to) : "none"}`; dir[k] = (dir[k] ?? 0) + 1; }
  console.log(JSON.stringify({
    winter: season.state.year, secs: Math.round((Date.now() - t0) / 1000),
    "FBS entrants a team (20-30)": +(fbs.length / fbsTeams).toFixed(1),
    "entry rate P4 / G5 % (22 / 18)": [rate("p4"), rate("g5")],
    "P4 entry by year % (16, 28, 28, 21)": [0, 1, 2, 3].map((y) => rate("p4", y)),
    "no school % of FBS entrants (15-25)": pct(fbs.filter((e) => e.status !== "committed").length, fbs.length),
    "P4 / G5 no school % (15 / 30)": [pct(es.filter((e) => tier(e.from) === "p4" && e.status !== "committed").length, es.filter((e) => tier(e.from) === "p4").length), pct(es.filter((e) => tier(e.from) === "g5" && e.status !== "committed").length, es.filter((e) => tier(e.from) === "g5").length)],
    "G5>P4 (300-500), P4>P4 (850-873), P4>G5 (526-545)": [dir["g5>p4"] ?? 0, dir["p4>p4"] ?? 0, dir["p4>g5"] ?? 0],
    directions: dir,
  }));
  if (n < winters) { season = season.nextSeason([]).next; }
}
