/**
 * Front office check: play a no-user dynasty for a few seasons and show how results move money. Prints each
 * season's budget classes, the biggest movers, and every Group of Five playoff team's roster budget the next year.
 *
 *   npx tsx packages/core/scripts/fortune-check.ts [seasons (default 2)] [league seed]
 */
import { loadSeed, Season } from "../src/index.ts";

const seasons = Number(process.argv[2] || 2), leagueSeed = Number(process.argv[3] || 7);
const seed = loadSeed();
const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
const M = (x: number) => +(x / 1e6).toFixed(1);
let season = Season.create(seed, { seed: leagueSeed, settings: { keep_pbp: "none" } as never });
const fbs = () => season.teams.filter((t) => t.level === "fbs");
const rb = (id: number) => { const p = season.rosterPool(id)!; return p.revenue_share + p.retention + (season.state.collectives?.[id]?.base ?? 0); };
const classes = () => { const c: Record<string, number> = {}; for (const t of fbs()) { const k = season.budgetClassOf(t.id)!.label; c[k] = (c[k] ?? 0) + 1; } return c; };
console.log(JSON.stringify({ year: season.state.year, classes: classes() }));
for (let n = 1; n <= seasons; n++) {
  const t0 = Date.now();
  while (!season.done) season.advanceDay();
  const before = new Map(fbs().map((t) => [t.id, rb(t.id)]));
  const cfp = new Set(season.state.games.filter((g) => g.kind === "playoff").flatMap((g) => [g.home_id, g.away_id]));
  const out = new Map(fbs().map((t) => [t.id, season.outcome(t.id)]));
  const post = new Map(fbs().map((t) => [t.id, season.postseasonMoney(t.id)]));
  season = season.nextSeason(seed.coaches ?? []).next;
  const moves = fbs().map((t) => ({ school: t.school, g5: !P4.has(t.conference) && t.school !== "Notre Dame", rec: `${out.get(t.id)!.wins}-${out.get(t.id)!.losses}`, exp: +out.get(t.id)!.exp.toFixed(1),
    cfp: cfp.has(t.id), from: M(before.get(t.id)!), to: M(rb(t.id)), pct: Math.round(100 * (rb(t.id) / before.get(t.id)! - 1)), f: season.fortune(t.id), post: post.get(t.id), cls: season.budgetClassOf(t.id)!.label }));
  moves.sort((a, b) => b.pct - a.pct);
  console.log(JSON.stringify({ year: season.state.year, secs: Math.round((Date.now() - t0) / 1000), classes: classes() }));
  console.log("up:", moves.slice(0, 6).map((m) => `${m.school} ${m.rec} (exp ${m.exp}) ${m.from}->${m.to}M ${m.pct}% ${m.cls}`).join("; "));
  console.log("down:", moves.slice(-6).map((m) => `${m.school} ${m.rec} (exp ${m.exp}) ${m.from}->${m.to}M ${m.pct}% ${m.cls}`).join("; "));
  console.log("G5 playoff:", moves.filter((m) => m.g5 && m.cfp).map((m) => `${m.school} ${m.rec} ${m.from}->${m.to}M ${JSON.stringify(m.f)} post ${M(m.post!.own)}+${M(m.post!.pooled)}M ${m.cls}`).join("; "));
}
