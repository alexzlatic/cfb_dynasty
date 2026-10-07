/** Shared parity check: replays the Python fixtures through the TypeScript engine. */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { GameSim, Rng, type TeamRatings } from "../src/index.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

export interface ParityReport {
  games: number;
  gamesMatched: number;
  plays: number;
  playsMatched: number;
  firstDivergence: null | { game: number; play: number; field: string; python: unknown; ts: unknown };
}

export function runParity(): ParityReport {
  const fx = JSON.parse(readFileSync(root + "fixtures/engine/parity.json", "utf8"));
  const teams: Record<string, TeamRatings> = JSON.parse(readFileSync(root + "data/seed/2026wk1/team_ratings.json", "utf8")).teams;
  const fields: string[] = fx.play_fields;
  const rep: ParityReport = { games: 0, gamesMatched: 0, plays: 0, playsMatched: 0, firstDivergence: null };
  fx.games.forEach((g: any, gi: number) => {
    const sim = new GameSim(structuredClone(teams[g.home]), structuredClone(teams[g.away]), { rng: new Rng(g.seed), neutral: g.neutral }).play();
    const r = sim.result();
    const plays = r.plays!;
    rep.games++;
    let ok = r.home.score === g.final[0] && r.away.score === g.final[1] && plays.length === g.plays.length;
    for (let i = 0; i < g.plays.length; i++) {
      rep.plays++;
      const p = plays[i] as any;
      let same = !!p;
      for (let f = 0; f < fields.length && same; f++) {
        if (p[fields[f]] !== g.plays[i][f]) {
          same = false;
          if (!rep.firstDivergence) rep.firstDivergence = { game: gi, play: i, field: fields[f], python: g.plays[i][f], ts: p[fields[f]] };
        }
      }
      if (same) rep.playsMatched++; else ok = false;
    }
    for (const [k, v] of Object.entries(g.home_box)) if ((r.home.box as any)[k] !== v) {
      ok = false;
      if (!rep.firstDivergence) rep.firstDivergence = { game: gi, play: -1, field: "home_box." + k, python: v, ts: (r.home.box as any)[k] };
    }
    if (ok) rep.gamesMatched++;
  });
  return rep;
}

if (import.meta.url === `file://${process.argv[1]}`) console.log(JSON.stringify(runParity(), null, 1));
