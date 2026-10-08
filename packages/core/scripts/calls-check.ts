/**
 * Play-call balance: the same games with no calls and with calls on both sides. "ai" lets the
 * coordinators call everything (should match the plain engine within about 0.5 points a team); "cheat"
 * lets the home offense see the defense's call first and pick the best counter (the plan allows about 7).
 *
 *   npx tsx packages/core/scripts/calls-check.ts [games] [ai|cheat]
 */
import { GameSim, Rng } from "@cfb/engine";
import { Caller, loadSeed, mixSeed, snapMod, OFF_CALLS, type UserCall } from "../src/index.ts";
const seed = loadSeed();
const fbs = seed.teams.filter((t) => t.level === "fbs").map((t) => t.id);
const N = Number(process.argv[2] ?? 3000);
const mode = process.argv[3] ?? "ai";
const agg = { plain: [0, 0, 0, 0, 0], calls: [0, 0, 0, 0, 0] };
const rng = new Rng(11);
for (let i = 0; i < N; i++) {
  const h = fbs[Math.floor(rng.random() * fbs.length)], a = fbs[Math.floor(rng.random() * fbs.length)];
  if (h === a) continue;
  const H = seed.ratings[h].ratings, A = seed.ratings[a].ratings;
  for (const k of ["plain", "calls"] as const) {
    const sim = new GameSim(H, A, { seed: i, record: false });
    if (k === "calls") {
      const c = new Caller("home", new Rng(mixSeed(5, i, "calls")));
      if (mode === "ai") sim.play(c.replay([]));
      else {
        // "Cheater": sees the defense's call and picks the offensive call with the best expected yards of its kind.
        sim.play((req, game) => {
          if (req.kind === "snap") return undefined;
          const ai = c.prepare(req, game);
          let user: UserCall | undefined = undefined;
          if (req.kind === "playCall" && req.side === "home" && ai) {
            const kind = req.suggestion;
            const score = (o: string) => { const m = snapMod(o as never, ai.def); return (m.comp ?? 0) * 0.5 + (m.ypcomp ?? 0) * 1.5 - (m.sack ?? 0) * 0.15 - (m.int ?? 0) * 0.15 + (m.ypc ?? 0) * 2 + (m.explosive ?? 0) * 0.3 - (m.stuff ?? 0) * 0.3; };
            user = OFF_CALLS.filter((o) => o.kind === kind).sort((x, y) => score(y.id) - score(x.id))[0].id;
          }
          return c.answer(req, game, ai, c.isUserTurn(req) ? user ?? null : undefined);
        });
      }
    } else sim.play();
    const r = sim.result(), b = r.home.box as any;
    const x = agg[k];
    x[0] += r.home.score; x[1] += r.away.score; x[2] += b.pass_yards ?? 0; x[3] += b.rush_yards ?? 0; x[4] += b.plays ?? 0;
  }
}
for (const [k, x] of Object.entries(agg)) console.log(k.padEnd(6), x.map((v) => (v / N).toFixed(2)).join("  "), "(home pts, away pts, home pass yds, home rush yds, home plays)");
