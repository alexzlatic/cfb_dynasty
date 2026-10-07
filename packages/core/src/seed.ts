import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Player, SeedBundle, TeamPlayers } from "./types.ts";
import { ATTRS, overall, type Pos, type RatedPlayer } from "./players.ts";

export const DEFAULT_SEED_DIR = fileURLToPath(new URL("../../../data/seed/2026wk1/", import.meta.url));

const read = (dir: string, f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));

/** Load the seed bundle written by importer/build_seed.py (plus power.json from scripts/power.ts). */
export function loadSeed(dir = DEFAULT_SEED_DIR): SeedBundle {
  const manifest = read(dir, "manifest.json");
  const rosters = read(dir, "rosters.json");
  return {
    season: manifest.season,
    start_date: manifest.start_date,
    teams: read(dir, "teams.json"),
    conferences: read(dir, "conferences.json"),
    rosters,
    coaches: read(dir, "coaches.json"),
    schedule: read(dir, "schedule.json"),
    ratings: read(dir, "team_ratings_all.json").teams,
    power: existsSync(join(dir, "power.json")) ? read(dir, "power.json").teams : {},
    players: existsSync(join(dir, "players.json")) ? unpackPlayers(read(dir, "players.json").teams, rosters) : undefined,
  };
}

/** players.json holds ratings only; identity comes from the roster entry with the same id. */
function unpackPlayers(teams: Record<string, any>, rosters: Record<string, Player[]>): Record<string, TeamPlayers> {
  for (const [tid, t] of Object.entries(teams)) {
    const ident = new Map((rosters[tid] ?? []).map((r) => [Number(r.id), r]));
    t.players = t.players.map((q: any): RatedPlayer => {
      const r = ident.get(q.id)!;
      const attrs = Object.fromEntries(ATTRS[q.pos as Pos].map((k, i) => [k, q.a[i]]));
      return {
        id: q.id, team_id: Number(tid), first: r.first, last: r.last, pos: q.pos, listed: r.pos, class: r.class, years: q.years,
        jersey: r.jersey, height: r.height, weight: r.weight, home: r.home, stars: q.stars, composite: q.composite, natl_rank: q.natl_rank,
        attrs, traits: { stamina: q.t[0], injury: q.t[1], toughness: q.t[2], discipline: q.t[3] }, hidden: { potential: q.h[0], work_ethic: q.h[1] },
        tend: q.tend, ovr: overall(q.pos, attrs), basis: q.b > 0 ? "stats" : "prior", sample: Math.abs(q.b),
      };
    });
  }
  return teams as Record<string, TeamPlayers>;
}
