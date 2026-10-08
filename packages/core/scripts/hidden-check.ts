/**
 * Calibrates the hidden layer. `units`: how many points of margin one hidden point moves (offense and
 * defense apart), which sets POINTS_PER_UNIT. `spread`: the spread of every team's hidden strength at
 * the end of the season against the measured real surprise (reports/surprise-sizes.md).
 *   npx tsx packages/core/scripts/hidden-check.ts units [games] | spread [seasons]
 */
import { GameSim, Rng, averageTeam } from "@cfb/engine";
import { applyHidden, loadSeed, mixSeed, Season } from "../src/index.ts";

const mode = process.argv[2] ?? "units";
if (mode === "units") {
  const n = Number(process.argv[3] || 4000);
  for (const [off, def] of [[5, 0], [0, 5], [-5, 0], [0, -5]]) {
    let m = 0;
    for (let i = 0; i < n; i++) {
      const home = i % 2 === 0, t = applyHidden(averageTeam(), off, def);
      const g = new GameSim(home ? t : averageTeam(), home ? averageTeam() : t, { rng: new Rng(mixSeed("hid", i)), neutral: true, record: false }).play();
      m += home ? g.home.score - g.away.score : g.away.score - g.home.score;
    }
    console.log(`off ${off} def ${def}: margin ${(m / n).toFixed(2)} per game, ${(m / n / (off + def)).toFixed(3)} per hidden point`);
  }
} else {
  const seed = loadSeed();
  const k = Number(process.argv[3] || 3);
  const all: number[] = [], groups: Record<string, number[]> = {};
  for (let i = 0; i < k; i++) {
    const s = Season.create(seed, { seed: 500 + i });
    for (const t of s.teams) {
      if (t.level !== "fbs") continue;
      const h = s.hiddenStrength(t.id, `${s.state.year}-11-15`);
      if (!h) continue;
      const x = h.off + h.def;
      all.push(x);
      const c = s.teamContext(t.id);
      const key = c.continuity ? "continuity" : c.new_coach && c.new_qb ? "new coach + new QB" : c.new_coach ? "new coach" : c.new_qb ? "new QB" : "other";
      (groups[key] ??= []).push(x);
    }
  }
  const sd = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length); };
  console.log(`all FBS: SD ${sd(all).toFixed(2)} (target 6.6), n ${all.length}`);
  for (const [g, a] of Object.entries(groups)) console.log(`  ${g}: SD ${sd(a).toFixed(2)}, n ${a.length}`);
}
