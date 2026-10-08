/**
 * Preseason power ratings: each team's average neutral-site margin against a league-average team,
 * measured with the engine itself so polls and seeding agree with how games will actually play.
 * Writes data/seed/<season>wk1/power.json. Run: npx tsx packages/core/scripts/power.ts [games] [season (default 2026)]
 */
import { readFileSync, writeFileSync } from "node:fs";
import { GameSim, Rng, averageTeam, type TeamRatings } from "@cfb/engine";
import { seedDir } from "../src/seed.ts";
import { mixSeed } from "../src/hash.ts";

const n = Number(process.argv[2] || 400);
const DIR = seedDir(Number(process.argv[3] || 2026));
const ratings: Record<string, { ratings: TeamRatings }> = JSON.parse(readFileSync(DIR + "team_ratings_all.json", "utf8")).teams;
const out: Record<string, number> = {};
for (const [id, r] of Object.entries(ratings)) {
  let m = 0;
  for (let i = 0; i < n; i++) {
    const home = i % 2 === 0;
    const g = new GameSim(home ? r.ratings : averageTeam(), home ? averageTeam() : r.ratings, { rng: new Rng(mixSeed("power", id, i)), neutral: true, record: false }).play();
    m += home ? g.home.score - g.away.score : g.away.score - g.home.score;
  }
  out[id] = Math.round((m / n) * 10) / 10;
}
writeFileSync(DIR + "power.json", JSON.stringify({ games_per_team: n, note: "neutral-site margin vs a league-average team", teams: out }));
const top = Object.entries(out).sort((a, b) => b[1] - a[1]);
console.log("top", top.slice(0, 10), "bottom", top.slice(-3));
