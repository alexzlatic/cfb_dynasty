/**
 * The M3 drift gate: play a dynasty many seasons with no user team and check that college football
 * still looks like itself. Each season is played in full, then rolled over (rollover.ts); the table
 * shows, per season, the spread of team strength (preseason power), top-25 turnover against the
 * season before, the gap between power conferences and the Group of Five, roster sizes and how many
 * players left and arrived. Gate: spread, turnover and the gap stay within 10% of season 1.
 *
 *   npx tsx packages/core/scripts/drift.ts [seasons (default 20)] [league seed]
 */
import { loadSeed, Season, z, type SeedBundle } from "../src/index.ts";

const seasons = Number(process.argv[2] || 20);
const leagueSeed = Number(process.argv[3] || 7);
const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
const seed: SeedBundle = loadSeed();
const fbs = seed.teams.filter((t) => t.level === "fbs");
const isP4 = (id: number) => { const t = fbs.find((x) => x.id === id)!; return P4.has(t.conference) || t.school === "Notre Dame"; };
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };

let season = Season.create(seed, { seed: leagueSeed, settings: { keep_pbp: "none" } as never });
const rows: Record<string, number | string>[] = [];
let prevTop: Set<number> | null = null;
for (let n = 1; n <= seasons; n++) {
  const t0 = Date.now();
  const s = season.state;
  const pre = fbs.map((t) => s.preseason_power[t.id] ?? 0);
  const p4 = fbs.filter((t) => isP4(t.id)).map((t) => s.preseason_power[t.id] ?? 0), g5 = fbs.filter((t) => !isP4(t.id)).map((t) => s.preseason_power[t.id] ?? 0);
  const sizes = fbs.map((t) => season.roster(t.id).length);
  const starters = fbs.flatMap((t) => Object.values(season.depthChart(t.id)).map((ids) => ids?.[0]).filter((x): x is number => x != null).map((id) => season.playerById.get(id)!.ovr));
  while (!season.done) season.advanceDay();
  const top = new Set(season.latestPoll("ap")!.ranks.slice(0, 25).map((r) => r.team_id));
  const turnover = prevTop ? [...top].filter((id) => !prevTop!.has(id)).length : NaN;
  prevTop = top;
  const champ = season.state.champion != null ? season.team(season.state.champion).school : "-";
  const { next, left, added } = season.nextSeason(seed.coaches);
  const all = fbs.flatMap((t) => season.roster(t.id));
  rows.push({
    season: s.year, "power sd": +sd(pre).toFixed(2), "P4-G5": +(mean(p4) - mean(g5)).toFixed(2), "top25 new": turnover,
    "starter ovr": +mean(starters).toFixed(1), "all ovr z": +mean(all.map((p) => z(p.ovr))).toFixed(2), roster: +mean(sizes).toFixed(1), "min roster": Math.min(...sizes),
    left: left.length, nfl: left.filter((d) => d.reason === "nfl").length, added: added.length, champion: champ, secs: Math.round((Date.now() - t0) / 1000),
  });
  console.log(JSON.stringify(rows[rows.length - 1]));
  season = next;
}
console.table(rows);
const first = rows[0], tail = rows.slice(-5);
const within = (k: string, base: number) => {
  const v = mean(tail.map((r) => Number(r[k])));
  return { k, first: base, last5: +v.toFixed(2), ok: Math.abs(v / base - 1) <= 0.1 };
};
const turn = mean(rows.slice(1, 4).map((r) => Number(r["top25 new"])));
const checks = [within("power sd", Number(first["power sd"])), within("P4-G5", Number(first["P4-G5"])), within("top25 new", turn), within("starter ovr", Number(first["starter ovr"]))];
console.table(checks);
