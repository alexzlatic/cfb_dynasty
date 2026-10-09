/**
 * The M4 carousel gate: run the coaching carousel many offseasons and compare it with real FBS coaching
 * changes, 2006-2024 (importer/build_coach_pool.py --rates, CFBD):
 *   - head-coach changes a year: 20% (power 19%, Group of Five 22%);
 *   - 24% of changes are the coach leaving for another FBS head job, mostly Group of Five to power;
 *   - who power schools hire: 39% a first FBS head job, 27% a sitting Group of Five head coach, 19% a former
 *     head coach, 15% a sitting power head coach; Group of Five schools: 70% first job, 19% former, 6% and 5%;
 *   - let go by win pct: 33% under .200, 28% .200-.399, 16% .400-.599, 6% .600 and up;
 *   - a Group of Five head coach winning 80% is hired away 28% of the time.
 *
 *   npx tsx packages/core/scripts/carousel-gates.ts --synthetic [offseasons] [seed]   (fast: seasons drawn from power)
 *   npx tsx packages/core/scripts/carousel-gates.ts [seasons] [seed]                  (plays full seasons)
 */
import { Rng } from "@cfb/engine";
import {
  CAROUSEL_CLOSE, addDays, isPower, jobOf, loadSeed, marketDay, mixSeed, nthWeekday, openCarousel, Season, startCoaching, winChance,
  type CoachMove, type CoachRec, type CoachingState, type Job, type MarketCtx, type TeamYear,
} from "../src/index.ts";

const args = process.argv.slice(2);
const synthetic = args.includes("--synthetic");
const [nArg, seedArg] = args.filter((a) => !a.startsWith("--"));
const N = Number(nArg || (synthetic ? 30 : 6));
const leagueSeed = Number(seedArg || 7);
const seed = loadSeed();
const fbs = seed.teams.filter((t) => t.level === "fbs");
const jobs = new Map<number, Job>(seed.teams.map((t) => [t.id, jobOf(t, isPower(t))]));
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const pct = (x: number) => `${(100 * x).toFixed(1)}%`;

interface YearLog { year: number; st: CoachingState; results: Map<number, TeamYear>; before: Map<number, CoachRec | undefined>; after: Map<number, number | undefined>; moves: CoachMove[] }
const logs: YearLog[] = [];
const hcOf = (st: CoachingState, tid: number) => st.coaches.find((c) => c.team_id === tid && c.role === "HC");
const coordsOf = (st: CoachingState) => new Map(st.coaches.filter((c) => c.team_id != null && (c.role === "OC" || c.role === "DC")).map((c) => [`${c.team_id}:${c.role}`, c.id]));
const coordChanges: { p4: number[]; g5: number[] } = { p4: [], g5: [] };
const hcHistory = new Map<number, Set<number>>(); // coach id -> years he was an FBS head coach

function recordHCs(st: CoachingState, year: number) {
  for (const c of st.coaches) if (c.role === "HC" && c.team_id != null && jobs.get(c.team_id)!.level !== "fcs") (hcHistory.get(c.id) ?? hcHistory.set(c.id, new Set()).get(c.id)!).add(year);
}

/** One offseason: open the carousel the Sunday after the fourth Saturday of November and run it day by day to the close. */
function runCarousel(st: CoachingState, year: number, results: Map<number, TeamYear>, names: { firsts: string[]; lasts: string[] }) {
  const before = new Map(fbs.map((t) => [t.id, hcOf(st, t.id)]));
  const coordBefore = coordsOf(st);
  const n0 = st.moves.length;
  let date = addDays(nthWeekday(year, 11, 6, 4), 1);
  const ctx = (d: string): MarketCtx => ({ seed: leagueSeed, year, date: d, jobs, names, userTeam: null, news: () => {}, charge: () => {} });
  openCarousel(st, ctx(date), results);
  for (; date <= CAROUSEL_CLOSE(year); date = addDays(date, 1)) marketDay(st, ctx(date), { userCoach: null, close: date === CAROUSEL_CLOSE(year) });
  const after = coordsOf(st);
  for (const [k, id] of coordBefore) (jobs.get(Number(k.split(":")[0]))!.level === "p4" ? coordChanges.p4 : coordChanges.g5).push(after.get(k) === id ? 0 : 1);
  logs.push({ year, st, results, before, after: new Map(fbs.map((t) => [t.id, hcOf(st, t.id)?.id])), moves: st.moves.slice(n0) });
  recordHCs(st, year + 1);
}

const names = (() => {
  const all = Object.values(seed.rosters).flat();
  return { firsts: [...new Set(all.map((p) => p.first).filter(Boolean))].sort(), lasts: [...new Set(all.map((p) => p.last).filter(Boolean))].sort() };
})();

if (synthetic) {
  // Seasons drawn from preseason power: twelve games against average FBS opposition, the head coach's skill worth a few points.
  const st = startCoaching({ seed: leagueSeed, year: seed.season, teams: seed.teams, jobs, coaches: seed.coaches, pool: seed.coach_pool ?? [], schemes: {} });
  recordHCs(st, seed.season);
  const prev = new Map<number, number>();
  for (let y = seed.season; y < seed.season + N; y++) {
    const rng = new Rng(mixSeed(leagueSeed, y, "synthetic"));
    const results = new Map<number, TeamYear>();
    const avg = mean(fbs.map((t) => seed.power[t.id] ?? 0));
    for (const t of fbs) {
      const hc = hcOf(st, t.id);
      const skill = hc ? (hc.skills.game_planning + hc.skills.development + hc.skills.recruiting - 150) / 3 : 0;
      const pw = (seed.power[t.id] ?? 0) - avg;
      const p = winChance(pw + skill / 4 + 6 * rng.gauss(0, 1)), exp = winChance(pw);
      let w = 0;
      for (let g = 0; g < 12; g++) if (rng.random() < p) w++;
      const coord = (r: string) => { const c = st.coaches.find((x) => x.team_id === t.id && x.role === r); return c ? (c.skills.scheme + c.skills.game_planning - 100) / 25 : 0; };
      results.set(t.id, { w, l: 12 - w, exp, prev: prev.get(t.id) ?? null, off: coord("OC") + rng.gauss(0, 1), def: coord("DC") + rng.gauss(0, 1) });
      prev.set(t.id, w / 12);
    }
    runCarousel(st, y, results, names);
  }
} else {
  let season = Season.create(seed, { seed: leagueSeed, settings: { keep_pbp: "none" } as never });
  for (let n = 1; n <= N; n++) {
    const t0 = Date.now();
    const st = season.state.coaching!;
    const before = new Map(fbs.map((t) => [t.id, hcOf(st, t.id)]));
    const coordBefore = coordsOf(st);
    const n0 = st.moves.length;
    while (!season.done) season.advanceDay();
    const after = coordsOf(st);
    for (const [k, id] of coordBefore) (jobs.get(Number(k.split(":")[0]))!.level === "p4" ? coordChanges.p4 : coordChanges.g5).push(after.get(k) === id ? 0 : 1);
    logs.push({ year: season.state.year, st, results: season.teamYears(), before, after: new Map(fbs.map((t) => [t.id, hcOf(st, t.id)?.id])), moves: st.moves.slice(n0) });
    recordHCs(st, season.state.year + 1);
    console.log(`season ${season.state.year}: ${Math.round((Date.now() - t0) / 1000)}s`);
    season = season.nextSeason(seed.coaches).next;
  }
}

// ---- the comparison ------------------------------------------------------------------------------
let n = 0, changes = 0, moved = 0;
const tierN = { p4: 0, g5: 0 }, tierCh = { p4: 0, g5: 0 };
const dirs: Record<string, number> = {};
const g5top: number[] = [];
const src: Record<"p4" | "g5", Record<string, number>> = { p4: {}, g5: {} };
const lg: [number, number][] = [[0, 0], [0, 0], [0, 0], [0, 0]];
for (const L of logs) {
  for (const t of fbs) {
    const was = L.before.get(t.id);
    if (!was) continue;
    const level = jobs.get(t.id)!.level as "p4" | "g5";
    const nowId = L.after.get(t.id);
    const ty = L.results.get(t.id)!;
    const wp = ty.w / Math.max(1, ty.w + ty.l);
    n++; tierN[level]++;
    const changed = nowId !== was.id;
    const went = L.moves.find((m) => m.kind === "hired" && m.coach === was.id && m.role === "HC" && m.team_id !== t.id);
    const leftFor = changed && went ? jobs.get(went.team_id!)! : null;
    if (changed) { changes++; tierCh[level]++; }
    if (leftFor && leftFor.level !== "fcs") { moved++; const k = `${level}>${leftFor.level}`; dirs[k] = (dirs[k] ?? 0) + 1; }
    else { const b = wp < 0.2 ? 0 : wp < 0.4 ? 1 : wp < 0.6 ? 2 : 3; lg[b][1]++; if (changed) lg[b][0]++; }
    if (level === "g5" && wp >= 0.8) g5top.push(leftFor && leftFor.level !== "fcs" ? 1 : 0);
    if (changed && nowId != null) {
      const h = L.moves.find((m) => m.kind === "hired" && m.coach === nowId && m.team_id === t.id && m.role === "HC");
      const fromJob = h?.from?.team_id != null ? jobs.get(h.from.team_id) : undefined;
      const now = L.st.coaches.find((c) => c.id === nowId)!;
      const hcBefore = [...(hcHistory.get(nowId) ?? [])].some((yy) => yy <= L.year) || !!now.prior;
      const kind = fromJob && h!.from!.role === "HC" && fromJob.level !== "fcs" ? `sitting ${fromJob.level} HC` : hcBefore ? "former FBS HC" : "first FBS head job";
      src[level][kind] = (src[level][kind] ?? 0) + 1;
    }
  }
}
const last = logs[logs.length - 1].st;
const mixLine = (o: Record<string, number>) => { const tot = Object.values(o).reduce((a, b) => a + b, 0); return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / tot)}`).join(", ") + ` (${tot})`; };
console.log(`\n${logs.length} offseasons (${synthetic ? "synthetic seasons" : "full seasons"}), league seed ${leagueSeed}`);
console.table([
  { check: "HC changes a year", real: "20.1%", sim: pct(changes / n) },
  { check: "  power / G5", real: "18.7% / 21.6%", sim: `${pct(tierCh.p4 / tierN.p4)} / ${pct(tierCh.g5 / tierN.g5)}` },
  { check: "changes that were a move to another FBS head job", real: "24.4%", sim: pct(moved / Math.max(1, changes)) },
  { check: "moves G5>P4, P4>P4, G5>G5, P4>G5", real: "53%, 27%, 13%, 7%", sim: ["g5>p4", "p4>p4", "g5>g5", "p4>g5"].map((k) => pct((dirs[k] ?? 0) / Math.max(1, moved))).join(", ") },
  { check: "let go, win pct <.2 / .2-.4 / .4-.6 / .6+", real: "33% / 28% / 16% / 6%", sim: lg.map(([a, b]) => pct(a / Math.max(1, b))).join(" / ") },
  { check: "G5 head coach winning 80%+ hired away", real: "28.4%", sim: `${pct(mean(g5top))} (${g5top.length})` },
  { check: "P4 coordinator (OC/DC) changes a year", real: "~35% (estimate)", sim: pct(mean(coordChanges.p4)) },
  { check: "G5 coordinator (OC/DC) changes a year", real: "~40% (estimate)", sim: pct(mean(coordChanges.g5)) },
]);
console.log("power hires:", mixLine(src.p4), "\n  real: first FBS head job 39%, sitting G5 HC 27%, former FBS HC 19%, sitting P4 HC 15%");
console.log("G5 hires:   ", mixLine(src.g5), "\n  real: first FBS head job 70%, former FBS HC 19%, sitting G5 HC 6%, sitting P4 HC 5%");
const idle = last.coaches.filter((c) => !c.gone && c.team_id == null);
console.log(`coaches working ${last.coaches.filter((c) => c.team_id != null).length}, out of work ${idle.length}, gone ${last.coaches.filter((c) => c.gone).length}, total records ${last.coaches.length}`);
const reps = (lvl: string, role: string) => mean(last.coaches.filter((c) => c.team_id != null && c.role === role && jobs.get(c.team_id)!.level === lvl).map((c) => c.rep)).toFixed(1);
console.log(`reputation: P4 HC ${reps("p4", "HC")}, G5 HC ${reps("g5", "HC")}, FCS HC ${reps("fcs", "HC")}, P4 OC ${reps("p4", "OC")}, G5 OC ${reps("g5", "OC")}`);
