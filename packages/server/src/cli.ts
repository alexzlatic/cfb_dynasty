/**
 * Command line:
 *   tsx packages/server/src/cli.ts new <name> [teamSchool] [seed]
 *   tsx packages/server/src/cli.ts run-season [seed]     # headless full season + replay check
 */
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { LeagueManager } from "./manager.ts";
import { replay } from "./league.ts";

const [cmd, ...args] = process.argv.slice(2);
const dir = process.env.LEAGUES_DIR || join(process.cwd(), "leagues");

if (cmd === "new") {
  const m = new LeagueManager(dir);
  const team = args[1] ? m.seed().teams.find((t) => t.school.toLowerCase() === args[1].toLowerCase()) : undefined;
  const lg = m.create({ name: args[0] || "My Dynasty", user_team_id: team?.id ?? null, seed: args[2] ? Number(args[2]) : undefined });
  console.log(`created league ${lg.id} at ${m.path(lg.id)}${team ? ` coaching ${team.school}` : ""}`);
  m.closeAll();
} else if (cmd === "run-season") {
  const m = new LeagueManager(mkdtempSync(join(tmpdir(), "cfb-season-")));
  const t0 = performance.now();
  const lg = m.create({ name: "Season run", user_team_id: null, seed: Number(args[0] || 2026) });
  const t1 = performance.now();
  const reps = lg.apply({ type: "sim", payload: { kind: "end_of_season" } });
  const t2 = performance.now();
  const s = lg.season.state;
  const busiest = reps.reduce((a, r) => (r.played.length > a.played.length ? r : a));
  console.log(`created in ${((t1 - t0) / 1000).toFixed(1)} s; season of ${reps.length} days in ${((t2 - t1) / 1000).toFixed(1)} s`);
  console.log(`games ${s.games.filter((g) => g.status === "final").length}/${s.games.length} final; champion ${lg.season.team(s.champion!).school}`);
  console.log(`busiest day ${busiest.date}: ${busiest.played.length} games`);
  const r = replay(lg, m.seed());
  console.log(`replay ${r.original === r.replayed ? "identical" : "DIFFERENT"} (${r.original.slice(0, 12)})`);
  m.closeAll();
  if (r.original !== r.replayed) process.exit(1);
} else {
  console.log("usage: cli.ts new <name> [teamSchool] [seed] | run-season [seed]");
}
