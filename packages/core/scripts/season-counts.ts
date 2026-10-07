/**
 * Season counts gate: sim full seasons and count FBS players reaching real season marks (the design
 * plan's 2023 and 2024 counts), with rated lineups and, for comparison, with team ratings only.
 *
 *   npx tsx packages/core/scripts/season-counts.ts [seasons]
 */
import { loadSeed, Season, type SeedBundle } from "../src/index.ts";

const seasons = Number(process.argv[2] || 2);
const REAL = { "3500+ pass": [14, 13], "3000+ pass": [34, 32], "1000+ rush": [44, 52], "1000+ rec": [33, 28] };

function run(seed: SeedBundle, s: number) {
  const season = Season.create(seed, { seed: s, settings: { keep_pbp: "none" } as never });
  const fbs = new Set(seed.teams.filter((t) => t.level === "fbs").map((t) => t.id));
  const tot = new Map<string, Record<string, number>>();
  let pts = 0, games = 0;
  while (!season.done) {
    const r = season.advanceDay();
    for (const d of r.details) {
      const g = r.played.find((x) => x.id === d.game_id)!;
      for (const [tid, players, score] of [[g.home_id, d.home_players, g.home_score], [g.away_id, d.away_players, g.away_score]] as const) {
        if (!fbs.has(tid)) continue;
        if (g.kind === "regular") { pts += score!; games++; }
        for (const [name, line] of Object.entries(players as Record<string, Record<string, number>>)) {
          const k = `${tid}:${name}`, t = tot.get(k) ?? {};
          for (const [s2, v] of Object.entries(line)) t[s2] = (t[s2] ?? 0) + v;
          tot.set(k, t);
        }
      }
    }
  }
  const lines = [...tot.values()];
  const count = (f: (l: Record<string, number>) => boolean) => lines.filter(f).length;
  const best = (k: string) => Math.max(...lines.map((l) => l[k] ?? 0));
  return {
    "3500+ pass": count((l) => (l.pass_yds ?? 0) >= 3500), "3000+ pass": count((l) => (l.pass_yds ?? 0) >= 3000),
    "1000+ rush": count((l) => (l.rush_yds ?? 0) >= 1000), "1000+ rec": count((l) => (l.rec_yds ?? 0) >= 1000),
    "best pass": best("pass_yds"), "best rush": best("rush_yds"), "best rec": best("rec_yds"), "best rec catches": best("rec"),
    "pts/team-game": +(pts / games).toFixed(2),
  };
}

const seed = loadSeed();
for (const [label, sd] of [["rated lineups", seed], ["team ratings only", { ...seed, players: undefined }]] as const) {
  const runs = Array.from({ length: seasons }, (_, i) => run(sd, 7000 + i));
  const avg = Object.fromEntries(Object.keys(runs[0]).map((k) => [k, +(runs.reduce((a, r) => a + (r as any)[k], 0) / runs.length).toFixed(1)]));
  console.log(label.padEnd(18), JSON.stringify(avg));
}
console.log("real 2023 / 2024  ", JSON.stringify(REAL));
