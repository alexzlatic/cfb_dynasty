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
/** Each season's final power by FBS team, and the champions, for the year-to-year checks below. */
const finals: Record<number, number>[] = [];
const champs: string[] = [];
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
  finals.push(Object.fromEntries(fbs.map((t) => [t.id, season.state.power[t.id] ?? 0])));
  champs.push(champ);
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

// Year to year, against real SP+ 2005-2025 (importer/.cache, final ratings): correlation 0.81, change SD
// 8.5 points (7.1 in the top 25), 5.7 of the top 10 still top 10 a year later; 10 champions in 20 years,
// one school with more than 2.
const corr = (a: number[], b: number[]) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; a.forEach((x, i) => { n += (x - ma) * (b[i] - mb); da += (x - ma) ** 2; db += (b[i] - mb) ** 2; }); return n / Math.sqrt(da * db); };
const yy: { corr: number; sd: number; sd25: number; kept10: number }[] = [];
for (let i = 1; i < finals.length; i++) {
  const a = finals[i - 1], b = finals[i], ids = fbs.map((t) => t.id);
  const top = [...ids].sort((x, y) => a[y] - a[x]), next = new Set([...ids].sort((x, y) => b[y] - b[x]).slice(0, 10));
  yy.push({ corr: corr(ids.map((id) => a[id]), ids.map((id) => b[id])), sd: sd(ids.map((id) => b[id] - a[id])), sd25: sd(top.slice(0, 25).map((id) => b[id] - a[id])), kept10: top.slice(0, 10).filter((id) => next.has(id)).length });
}
const titles: Record<string, number> = {};
for (const c of champs) titles[c] = (titles[c] ?? 0) + 1;
const counts = Object.values(titles).sort((x, y) => y - x);
console.log(JSON.stringify({
  year_to_year: { corr: +mean(yy.map((r) => r.corr)).toFixed(2), change_sd: +mean(yy.map((r) => r.sd)).toFixed(1), change_sd_top25: +mean(yy.map((r) => r.sd25)).toFixed(1), top10_kept: +mean(yy.map((r) => r.kept10)).toFixed(1) },
  champions: { distinct: counts.length, most: counts[0], top4_share: +(counts.slice(0, 4).reduce((x, y) => x + y, 0) / champs.length).toFixed(2), titles },
}));
