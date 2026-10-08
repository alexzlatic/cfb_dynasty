/**
 * M1 "2025 replay" gate: start a league from the 2025 Week 1 seed (data/seed/2025wk1, rated as of Aug 2025),
 * sim the 2025 regular season many times and compare each real 2025 game's mean simmed margin and total with
 * what really happened. Real scores are read only for the comparison; the sim never sees them.
 *
 *   npm run replay:2025 -- [seasons=100] [workers=cpus]
 *
 * Pass marks: spread error (MAE of the mean simmed margin vs the real margin) no worse than 12.7 points and
 * totals bias (mean simmed total minus real total) within 1 point. Also reports totals MAE, home-win
 * accuracy and the FCS-over-FBS upset rate. Writes a per-game CSV and a JSON summary next to the script's
 * output dir (default: the system temp dir) for diagnosis.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { availableParallelism, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { loadSeed, mixSeed, Season, seedDir, type SeedBundle } from "../src/index.ts";

const SEASON = 2025;
const SPREAD_MARK = 12.7, TOTAL_BIAS_MARK = 1;
/** REPLAY_TEAMS_ONLY=1 plays team ratings without the rated players (no depth charts, game day or injuries), for diagnosis. */
const TEAMS_ONLY = process.env.REPLAY_TEAMS_ONLY === "1";
/** REPLAY_NO_HIDDEN=1 plays the scouted ratings as the truth (no hidden development, fit or chemistry), for comparison. */
const NO_HIDDEN = process.env.REPLAY_NO_HIDDEN === "1";
function replaySeed(): SeedBundle {
  const seed = loadSeed(seedDir(SEASON));
  return TEAMS_ONLY ? { ...seed, players: undefined } : seed;
}

/** Per-game sums over the simmed seasons, plus each season's margin (`ms[i]` from season `from + i`). */
interface Acc { n: number; margin: number; total: number; homeWins: number; marginSq: number; ms: Record<number, number> }
type Sums = Record<number, Acc>;

/** Sim seasons `from`..`to-1` through the last regular-season day; per-game sums of margin and total. */
function simSeasons(seed: SeedBundle, from: number, to: number): Sums {
  const sums: Sums = {};
  const lastRegular = seed.schedule.reduce((m, g) => (g.date > m ? g.date : m), seed.start_date);
  for (let i = from; i < to; i++) {
    const season = Season.create(seed, { seed: mixSeed("replay", SEASON, i), settings: { keep_pbp: "none" } as never });
    if (NO_HIDDEN) delete season.state.hidden_ctx;
    while (season.state.date <= lastRegular) {
      const r = season.advanceDay();
      for (const g of r.played) {
        if (g.kind !== "regular") continue;
        const m = g.home_score! - g.away_score!, t = g.home_score! + g.away_score!;
        const a = (sums[g.id] ??= { n: 0, margin: 0, total: 0, homeWins: 0, marginSq: 0, ms: {} });
        a.ms[i] = m;
        a.n++; a.margin += m; a.total += t; a.marginSq += m * m; if (m > 0) a.homeWins++;
      }
    }
  }
  return sums;
}

if (process.argv[2] === "--part") {
  // A worker process: sims its share of the seasons and prints the per-game sums.
  process.stdout.write(JSON.stringify(simSeasons(replaySeed(), Number(process.argv[3]), Number(process.argv[4]))));
} else {
  const seasons = Number(process.argv[2] || 100);
  const workers = Math.min(seasons, Number(process.argv[3] || availableParallelism()));
  const out = process.env.REPLAY_OUT || join(tmpdir(), "replay-2025");
  const seed = replaySeed();
  const t0 = Date.now();
  const parts = await Promise.all(Array.from({ length: workers }, (_, w) => {
    const from = Math.floor((seasons * w) / workers), to = Math.floor((seasons * (w + 1)) / workers);
    return new Promise<Sums>((res, rej) => {
      const tsx = createRequire(import.meta.url).resolve("tsx/cli");
      const child = spawn(process.execPath, [tsx, fileURLToPath(import.meta.url), "--part", String(from), String(to)], { stdio: ["ignore", "pipe", "inherit"] });
      let buf = "";
      child.stdout.on("data", (d) => { buf += d; });
      child.on("error", rej);
      child.on("close", (code) => (code === 0 ? res(JSON.parse(buf)) : rej(new Error(`worker ${w} exited with ${code}`))));
    });
  }));
  const secs = (Date.now() - t0) / 1000;
  const sums: Sums = {};
  for (const p of parts) for (const [id, a] of Object.entries(p)) {
    const s = (sums[Number(id)] ??= { n: 0, margin: 0, total: 0, homeWins: 0, marginSq: 0, ms: {} });
    Object.assign(s.ms, a.ms);
    s.n += a.n; s.margin += a.margin; s.total += a.total; s.homeWins += a.homeWins; s.marginSq += a.marginSq;
  }

  // Real 2025 regular-season scores: the raw CFBD pull when present, else the seed's copy of it.
  const cache = fileURLToPath(new URL("../../../importer/.cache/games__year-2025.json", import.meta.url));
  const real = new Map<number, { hp: number; ap: number }>();
  if (existsSync(cache)) {
    for (const g of JSON.parse(readFileSync(cache, "utf8")) as any[]) {
      if (g.seasonType === "regular" && g.completed && g.homePoints != null) real.set(g.id, { hp: g.homePoints, ap: g.awayPoints });
    }
  } else {
    for (const g of JSON.parse(readFileSync(join(seedDir(SEASON), `real_results_${SEASON}.json`), "utf8")).games) {
      if (g.home_points != null) real.set(g.id, { hp: g.home_points, ap: g.away_points });
    }
  }

  const team = new Map(seed.teams.map((t) => [t.id, t]));
  const P4 = new Set(["SEC", "Big Ten", "Big 12", "ACC"]);
  const tier = (id: number) => { const t = team.get(id)!; return t.level === "fcs" ? "FCS" : P4.has(t.conference ?? "") || t.school === "Notre Dame" ? "P4" : "G5"; };
  interface Row { id: number; week: number; home_id: number; away_id: number; home: string; away: string; ht: string; at: string; neutral: boolean; sim_m: number; real_m: number; sim_t: number; real_t: number; p_home: number; ms: Record<number, number> }
  const rows: Row[] = [];
  for (const g of seed.schedule) {
    const r = real.get(g.id), a = sums[g.id];
    if (!r || !a || !a.n) continue;
    rows.push({
      id: g.id, week: g.week, home_id: g.home_id, away_id: g.away_id, ms: a.ms, home: team.get(g.home_id)!.school, away: team.get(g.away_id)!.school, ht: tier(g.home_id), at: tier(g.away_id),
      neutral: g.neutral, sim_m: a.margin / a.n, real_m: r.hp - r.ap, sim_t: a.total / a.n, real_t: r.hp + r.ap, p_home: a.homeWins / a.n,
    });
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : NaN);
  const stats = (rs: Row[]) => ({
    games: rs.length,
    spread_mae: mean(rs.map((r) => Math.abs(r.sim_m - r.real_m))),
    margin_bias: mean(rs.map((r) => r.sim_m - r.real_m)),
    totals_bias: mean(rs.map((r) => r.sim_t - r.real_t)),
    totals_mae: mean(rs.map((r) => Math.abs(r.sim_t - r.real_t))),
    winner_acc: mean(rs.map((r) => (r.real_m === 0 ? 0.5 : Math.sign(r.sim_m) === Math.sign(r.real_m) ? 1 : 0))),
    home_win_acc: mean(rs.map((r) => ((r.p_home > 0.5) === (r.real_m > 0) ? 1 : 0))),
    sim_home_win: mean(rs.map((r) => r.p_home)), real_home_win: mean(rs.map((r) => (r.real_m > 0 ? 1 : 0))),
    sim_total: mean(rs.map((r) => r.sim_t)), real_total: mean(rs.map((r) => r.real_t)),
  });
  const isFcsGame = (r: Row) => r.ht === "FCS" || r.at === "FCS";
  const fbs = rows.filter((r) => !isFcsGame(r)), fcsG = rows.filter(isFcsGame);
  // FCS upsets: share of FBS-FCS games the FCS team wins (sim: mean win probability over the seasons).
  const fcsWinSim = mean(fcsG.map((r) => (r.ht === "FCS" ? r.p_home : 1 - r.p_home)));
  const fcsWinReal = mean(fcsG.map((r) => ((r.ht === "FCS" ? r.real_m : -r.real_m) > 0 ? 1 : 0)));
  const groups: Record<string, Row[]> = { all: rows, fbs_vs_fbs: fbs, fbs_vs_fcs: fcsG };
  for (const w of [[1, 4], [5, 9], [10, 16]] as const) groups[`fbs_weeks_${w[0]}-${w[1]}`] = fbs.filter((r) => r.week >= w[0] && r.week <= w[1]);
  for (const k of ["P4-P4", "P4-G5", "G5-G5"]) groups[`fbs_${k}`] = fbs.filter((r) => [r.ht, r.at].sort().reverse().join("-") === k || [r.ht, r.at].sort().join("-") === k);

  // Realism: is a simmed season as unpredictable as 2025 was, and in the same way? The mean simmed margin
  // over all seasons is the game's preseason projection (nobody knows the hidden truth). Real 2025 missed
  // it by the spread MAE; each simmed season should miss it by about as much. And the misses should
  // cluster by team the way real ones do (surprise teams), not just be game-to-game noise: the spread
  // across FBS teams of each team's average miss, and how many teams beat or missed it by 10+ per game.
  const sd = (xs: number[]) => { const m = mean(xs); return Math.sqrt(mean(xs.map((x) => (x - m) ** 2))); };
  const teamMiss = (margin: (r: Row) => number | undefined) => {
    const by = new Map<number, number[]>();
    for (const r of fbs) {
      const m = margin(r);
      if (m == null) continue;
      (by.get(r.home_id) ?? by.set(r.home_id, []).get(r.home_id)!).push(m - r.sim_m);
      (by.get(r.away_id) ?? by.set(r.away_id, []).get(r.away_id)!).push(r.sim_m - m);
    }
    const avg = [...by.values()].filter((xs) => xs.length >= 6).map(mean);
    return { sd: sd(avg), big: avg.filter((x) => Math.abs(x) >= 10).length, teams: avg.length };
  };
  const seasonIds = [...new Set(fbs.flatMap((r) => Object.keys(r.ms).map(Number)))];
  const simMae = mean(seasonIds.map((i) => mean(fbs.filter((r) => r.ms[i] != null).map((r) => Math.abs(r.ms[i] - r.sim_m)))));
  const simTeams = seasonIds.map((i) => teamMiss((r) => r.ms[i]));
  const realism = {
    projection_mae: { sim_season: simMae, real_2025: mean(fbs.map((r) => Math.abs(r.real_m - r.sim_m))) },
    team_miss_sd: { sim_season: mean(simTeams.map((x) => x.sd)), real_2025: teamMiss((r) => r.real_m).sd },
    teams_off_by_10: { sim_season: mean(simTeams.map((x) => x.big)), real_2025: teamMiss((r) => r.real_m).big, teams: teamMiss((r) => r.real_m).teams },
  };
  const summary = {
    season: SEASON, teams_only: TEAMS_ONLY, no_hidden: NO_HIDDEN, realism, seasons, workers, seconds: Math.round(secs), sims_per_game: mean(Object.values(sums).map((a) => a.n)),
    fcs_upsets: { sim: fcsWinSim, real: fcsWinReal, games: fcsG.length },
    groups: Object.fromEntries(Object.entries(groups).map(([k, v]) => [k, stats(v)])),
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 1));
  const f = (x: number) => x.toFixed(2);
  writeFileSync(join(out, "games.csv"), ["id,week,home,away,home_tier,away_tier,neutral,sim_margin,real_margin,sim_total,real_total,p_home",
    ...rows.map((r) => [r.id, r.week, JSON.stringify(r.home), JSON.stringify(r.away), r.ht, r.at, r.neutral ? 1 : 0, f(r.sim_m), r.real_m, f(r.sim_t), r.real_t, f(r.p_home)].join(","))].join("\n"));

  const pr = (label: string, s: ReturnType<typeof stats>) => console.log(`${label.padEnd(16)} ${String(s.games).padStart(4)} games  spread MAE ${f(s.spread_mae)}  margin bias ${f(s.margin_bias)}  totals bias ${f(s.totals_bias)}  totals MAE ${f(s.totals_mae)}  home-win acc ${(100 * s.home_win_acc).toFixed(1)}%`);
  console.log(`${seasons} seasons of the ${SEASON} regular season${TEAMS_ONLY ? " (team ratings only)" : ""} in ${secs.toFixed(0)}s on ${workers} workers`);
  for (const [k, v] of Object.entries(groups)) pr(k, stats(v));
  console.log(`realism (FBS vs FBS; projection = mean of all simmed seasons):`);
  console.log(`  miss vs projection per game: one simmed season ${f(realism.projection_mae.sim_season)}, real 2025 ${f(realism.projection_mae.real_2025)}`);
  console.log(`  spread of teams' average miss: simmed ${f(realism.team_miss_sd.sim_season)}, real ${f(realism.team_miss_sd.real_2025)}`);
  console.log(`  teams 10+ points per game off projection: simmed ${realism.teams_off_by_10.sim_season.toFixed(1)}, real ${realism.teams_off_by_10.real_2025} of ${realism.teams_off_by_10.teams}`);
  console.log(`FCS over FBS: sim ${(100 * fcsWinSim).toFixed(1)}%, real ${(100 * fcsWinReal).toFixed(1)}% (${fcsG.length} games)`);
  const all = stats(rows);
  const okSpread = all.spread_mae <= SPREAD_MARK, okTotals = Math.abs(all.totals_bias) <= TOTAL_BIAS_MARK;
  console.log(`gate (all FBS games): spread MAE ${f(all.spread_mae)} vs <= ${SPREAD_MARK} ${okSpread ? "pass" : "FAIL"}; totals bias ${f(all.totals_bias)} vs within ${TOTAL_BIAS_MARK} ${okTotals ? "pass" : "FAIL"}`);
  console.log(`per-game CSV and summary: ${out}`);
  process.exitCode = okSpread && okTotals ? 0 : 1;
}
