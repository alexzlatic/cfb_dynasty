/**
 * M1 gates in one run: sims full 2026 seasons (through the national championship) and scores the plan's
 * pass marks that a season can show. Season counts, FCS upsets, playoff fields and speed come from these
 * seasons; the auto depth chart's QB pick is checked against each team's real Week 1 starter. The 2025
 * replay (spread, totals, unpredictability, game ranges) is its own run: `npm run replay:2025`.
 *
 *   npm run check:m1 -- [seasons=20] [workers=cpus]
 */
import { existsSync, readFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { autoDepth, loadSeed, mixSeed, records, Season } from "../src/index.ts";

interface One {
  counts: Record<string, number>; fcs: [number, number]; field: { conf: string; losses: number }[]; seconds: number;
}

const P4 = new Set(["SEC", "Big Ten", "Big 12", "ACC"]);
const confOf = (conf: string | null | undefined, school: string) => school === "Notre Dame" ? "Notre Dame" : P4.has(conf ?? "") ? conf! : "Group of 5";

function simSeason(i: number): One {
  const seed = loadSeed();
  const t0 = Date.now();
  const s = Season.create(seed, { seed: mixSeed("m1-gates", i), settings: { keep_pbp: "none" } as never });
  // M1_NO_HIDDEN=1 plays the scouted ratings as the truth, for comparison.
  if (process.env.M1_NO_HIDDEN === "1") delete s.state.hidden_ctx;
  let fieldAt: { conf: string; losses: number }[] = [];
  while (!s.done) {
    s.advanceDay();
    // The field as it was picked: records before any playoff game.
    if (!fieldAt.length && s.state.playoff?.field.length) {
      const rec = records(s.state.games.filter((g) => g.kind === "regular" || g.kind === "conf_champ"), s.teams);
      fieldAt = s.state.playoff.field.map((x) => { const t = s.teamById.get(x.team_id)!; return { conf: confOf(t.conference, t.school), losses: rec.get(t.id)?.l ?? 0 }; });
    }
  }
  const seconds = (Date.now() - t0) / 1000;
  const level = new Map(s.teams.map((t) => [t.id, t.level]));
  const lines = Object.values(s.state.player_stats ?? {}).filter((x) => level.get(x.team_id) === "fbs");
  const n = (f: (l: Record<string, number>) => boolean) => lines.filter((l) => f(l as unknown as Record<string, number>)).length;
  const counts = {
    "3500+ pass": n((l) => (l.pass_yds ?? 0) >= 3500), "3000+ pass": n((l) => (l.pass_yds ?? 0) >= 3000),
    "1000+ rush": n((l) => (l.rush_yds ?? 0) >= 1000), "1000+ rec": n((l) => (l.rec_yds ?? 0) >= 1000), "10+ sacks": n((l) => (l.sacks ?? 0) >= 10),
  };
  let fcsGames = 0, fcsWins = 0;
  for (const g of s.state.games) {
    if (g.status !== "final") continue;
    const hf = level.get(g.home_id) === "fcs", af = level.get(g.away_id) === "fcs";
    if (hf === af) continue;
    fcsGames++;
    if ((hf ? g.home_score! - g.away_score! : g.away_score! - g.home_score!) > 0) fcsWins++;
  }
  return { counts, fcs: [fcsWins, fcsGames], field: fieldAt, seconds };
}

/** The auto depth chart's QB against each FBS team's real 2026 Week 1 starter (most attempts in its first game). */
function qbCheck(): { agree: number; teams: number } | null {
  const cache = fileURLToPath(new URL("../../../importer/.cache/", import.meta.url));
  if (!existsSync(cache + "games_players__year-2026_week-1_category-passing.json")) return null;
  const seed = loadSeed();
  const school = new Map(seed.teams.map((t) => [t.school, t.id]));
  const real = new Map<number, number>();
  for (const wk of [2, 1]) {
    for (const gm of JSON.parse(readFileSync(cache + `games_players__year-2026_week-${wk}_category-passing.json`, "utf8")) as any[]) {
      for (const t of gm.teams) {
        const ca = t.categories.flatMap((c: any) => c.types).find((ty: any) => ty.name === "C/ATT");
        const best = ca?.athletes.map((a: any) => ({ id: Number(a.id), att: Number(String(a.stat).split("/")[1] ?? 0) })).sort((a: any, b: any) => b.att - a.att)[0];
        const tid = school.get(t.team);
        if (best && tid != null) real.set(tid, best.id);
      }
    }
  }
  let agree = 0, teams = 0;
  for (const t of seed.teams) {
    const tp = seed.players?.[t.id], q = real.get(t.id);
    if (t.level !== "fbs" || !tp || q == null || !tp.players.some((p) => p.id === q)) continue;
    teams++;
    if (autoDepth(tp.players).QB?.[0] === q) agree++;
  }
  return { agree, teams };
}

if (process.argv[2] === "--part") {
  const out: One[] = [];
  for (let i = Number(process.argv[3]); i < Number(process.argv[4]); i++) out.push(simSeason(i));
  process.stdout.write(JSON.stringify(out));
} else {
  const seasons = Number(process.argv[2] || 20);
  const workers = Math.min(seasons, Number(process.argv[3] || availableParallelism()));
  const t0 = Date.now();
  const parts = await Promise.all(Array.from({ length: workers }, (_, w) => new Promise<One[]>((res, rej) => {
    const from = Math.floor((seasons * w) / workers), to = Math.floor((seasons * (w + 1)) / workers);
    const tsx = createRequire(import.meta.url).resolve("tsx/cli");
    const child = spawn(process.execPath, [tsx, fileURLToPath(import.meta.url), "--part", String(from), String(to)], { stdio: ["ignore", "pipe", "inherit"] });
    let buf = "";
    child.stdout.on("data", (d) => { buf += d; });
    child.on("error", rej);
    child.on("close", (code) => (code === 0 ? res(JSON.parse(buf)) : rej(new Error(`worker ${w} exited with ${code}`))));
  })));
  const runs = parts.flat();
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const rows: [string, string, string, boolean][] = [];

  // Season counts: inside the real 2023-2024 range (10+ sacks: CFBD 2023-2025), with room for sim noise (+-15%).
  const REAL: Record<string, [number, number]> = { "3500+ pass": [13, 14], "3000+ pass": [32, 34], "1000+ rush": [44, 52], "1000+ rec": [28, 33], "10+ sacks": [13, 14] };
  for (const [k, [lo, hi]] of Object.entries(REAL)) {
    const m = mean(runs.map((r) => r.counts[k]));
    rows.push([`Season counts: ${k}`, m.toFixed(1), `${lo}-${hi} real`, m >= lo * 0.85 && m <= hi * 1.15]);
  }
  const fw = runs.reduce((a, r) => a + r.fcs[0], 0), fg = runs.reduce((a, r) => a + r.fcs[1], 0);
  rows.push(["FCS over FBS", `${(100 * fw / fg).toFixed(1)}%`, "3-6%", fw / fg >= 0.03 && fw / fg <= 0.06]);

  // Playoff fields: conferences and two-loss teams against 2024 and 2025 (CFBD, records before the playoff).
  const confs = ["SEC", "Big Ten", "ACC", "Big 12", "Group of 5", "Notre Dame"];
  const real24: Record<string, number> = { SEC: 3, "Big Ten": 4, ACC: 2, "Big 12": 1, "Group of 5": 1, "Notre Dame": 1 };
  const real25: Record<string, number> = { SEC: 5, "Big Ten": 3, ACC: 1, "Big 12": 1, "Group of 5": 2, "Notre Dame": 0 };
  const fields = runs.filter((r) => r.field.length);
  for (const c of confs) {
    const m = mean(fields.map((r) => r.field.filter((x) => x.conf === c).length));
    const lo = Math.min(real24[c], real25[c]), hi = Math.max(real24[c], real25[c]);
    rows.push([`Playoff field: ${c}`, m.toFixed(1), `${real24[c]} (2024), ${real25[c]} (2025)`, m >= lo - 0.75 && m <= hi + 0.75]);
  }
  const two = mean(fields.map((r) => r.field.filter((x) => x.losses >= 2).length));
  rows.push(["Playoff field: 2+ losses", two.toFixed(1), "8 (2024), 4 (2025)", two >= 3 && two <= 9]);

  const secs = mean(runs.map((r) => r.seconds));
  rows.push(["Speed: full season headless", `${secs.toFixed(0)}s`, "under 120s", secs < 120]);
  const qb = qbCheck();
  if (qb) rows.push(["Auto depth chart starts the real Week 1 QB", `${(100 * qb.agree / qb.teams).toFixed(0)}% of ${qb.teams}`, "90%", qb.agree / qb.teams >= 0.9]);

  console.log(`${runs.length} seasons of 2026 in ${((Date.now() - t0) / 1000).toFixed(0)}s on ${workers} workers\n`);
  const w = Math.max(...rows.map((r) => r[0].length));
  for (const [name, got, want, ok] of rows) console.log(`${ok ? "pass" : "FAIL"}  ${name.padEnd(w)}  ${got.padStart(10)}   ${want}`);
  process.exitCode = rows.every((r) => r[3]) ? 0 : 1;
}
