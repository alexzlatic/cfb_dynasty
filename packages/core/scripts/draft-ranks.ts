/**
 * Busts and sleepers: where each NFL draft's picks ranked as high school recruits, against real drafts.
 * Real (CFBD, drafts 2018-2025 matched to their recruiting classes): first-rounders were national No. 1-25
 * 21%, 26-100 18%, 101-300 17%, 301-1000 26%, below 1000 or unranked 18%; about half of top-25 recruits are
 * ever drafted (53%), 19% in the first round.
 *
 *   npx tsx packages/core/scripts/draft-ranks.ts [seasons (default 8)] [league seed]
 */
import { loadSeed, Season } from "../src/index.ts";

const seasons = Number(process.argv[2] || 8), leagueSeed = Number(process.argv[3] || 7);
const seed = loadSeed();
const bucket = (r: number | null) => (r == null ? "1000+" : r <= 25 ? "1-25" : r <= 100 ? "26-100" : r <= 300 ? "101-300" : r <= 1000 ? "301-1000" : "1000+");
const B = ["1-25", "26-100", "101-300", "301-1000", "1000+"];
let season = Season.create(seed, { seed: leagueSeed, settings: { keep_pbp: "none" } as never });
// Draftees have left their rosters by draft day (they go at the rollover), so remember everyone's rank.
const ranks = new Map<number, number | null>();
for (let n = 1; n <= seasons; n++) {
  for (const p of season.playerById.values()) ranks.set(p.id, p.natl_rank ?? null);
  while (!season.done) season.advanceDay();
  const d = season.state.draft;
  if (d) {
    const r1 = d.picks.filter((p) => p.round === 1), all = d.picks;
    const rank = (pid: number) => ranks.get(pid) ?? null;
    const share = (ps: typeof all) => Object.fromEntries(B.map((b) => [b, Math.round(100 * ps.filter((p) => bucket(rank(p.pid)) === b).length / ps.length)]));
    console.log(JSON.stringify({ draft: d.year, "R1 by HS rank %": share(r1), "all rounds %": share(all), "top-25 drafted": all.filter((p) => bucket(rank(p.pid)) === "1-25").length, "top-25 R1": r1.filter((p) => bucket(rank(p.pid)) === "1-25").length }));
  }
  for (const p of season.playerById.values()) ranks.set(p.id, p.natl_rank ?? null);
  if (n < seasons) season = season.nextSeason(seed.coaches).next;
}
