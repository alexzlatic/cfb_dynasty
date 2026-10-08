/**
 * The M3 draft gates: play a dynasty with no user team through a few NFL drafts and check each against
 * real ones (CFBD 2023-2026 picks; docs/draft.md).
 *
 *   npx tsx packages/core/scripts/draft-gates.ts [drafts (default 3)] [league seed]
 */
import { loadSeed, Season } from "../src/index.ts";

const drafts = Number(process.argv[2] || 3), leagueSeed = Number(process.argv[3] || 7);
const seed = loadSeed();
const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
const team = new Map(seed.teams.map((t) => [t.id, t]));
const pct = (a: number, b: number) => +(100 * a / Math.max(1, b)).toFixed(1);
// Real picks by game position, 2020-2026 (offensive tackles, guards and centers as OL).
const REAL_MIX: Record<string, number> = { OL: 19.4, WR: 14, DT: 10.5, DE: 10.1, CB: 10.5, LB: 9.3, TE: 8.6, S: 7.4, RB: 5, QB: 3.9 };

let season = Season.create(seed, { seed: leagueSeed, settings: { keep_pbp: "none" } as never });
for (let n = 1; n <= drafts; n++) {
  const t0 = Date.now();
  while (!season.done) season.advanceDay();
  const yrs = new Map(season.teams.flatMap((t) => (season as unknown as { roster: (id: number) => { id: number; years: number }[] }).roster(t.id).map((p) => [p.id, p.years] as const)));
  const declared = (season.state.declared ?? []).filter((id) => yrs.get(id) === 2).length, declared4 = (season.state.declared ?? []).length - declared;
  season = season.nextSeason([]).next;
  while (!season.state.draft) season.advanceDay();
  const picks = season.state.draft.picks;
  const tm = (id: number) => team.get(id)!;
  const p4 = picks.filter((p) => P4.has(tm(p.team_id).conference) || tm(p.team_id).school === "Notre Dame").length;
  const by = new Map<string, number>();
  for (const p of picks) by.set(tm(p.team_id).school, (by.get(tm(p.team_id).school) ?? 0) + 1);
  const pos = new Map<string, number>();
  for (const p of picks) pos.set(p.pos, (pos.get(p.pos) ?? 0) + 1);
  const mix = Object.fromEntries(Object.entries(REAL_MIX).map(([k, v]) => [k, +(pct(pos.get(k) ?? 0, picks.length) - v).toFixed(1)]));
  console.log(JSON.stringify({
    draft: season.state.draft.year, secs: Math.round((Date.now() - t0) / 1000),
    "power-school picks % (80-92)": pct(p4, picks.length),
    "FCS picks (5-15)": picks.filter((p) => tm(p.team_id).level !== "fbs").length,
    "most from one school (10-15)": [...by].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}`),
    "juniors declaring (about 60-90)": declared, "fourth-years leaving early": declared4, "early entrants drafted": picks.filter((p) => p.early).length,
    "mix vs real (pts, within 3)": mix,
  }));
}
