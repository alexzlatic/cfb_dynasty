import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Player, SeedBundle, TeamPlayers } from "./types.ts";
import type { RecruitSeed } from "./recruiting.ts";
import { ATTRS, overall, type Pos, type RatedPlayer } from "./players.ts";

/** The Week 1 seed bundle for a season (2026 is the game's; 2025 is the replay check's). */
export const seedDir = (season: number) => fileURLToPath(new URL(`../../../data/seed/${season}wk1/`, import.meta.url));
export const DEFAULT_SEED_DIR = seedDir(2026);

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
    finances: existsSync(join(dir, "finances.json")) ? read(dir, "finances.json").teams : undefined,
    styles: existsSync(join(dir, "styles.json")) ? read(dir, "styles.json").teams : undefined,
    recruiting: loadRecruiting(dir, manifest.season),
    coach_pool: existsSync(join(dir, "coach_pool.json")) ? read(dir, "coach_pool.json") : undefined,
  };
}

/** The recruiting seed: the generation pool and curve, the real next class and the real classes of the last three years. */
function loadRecruiting(dir: string, season: number): RecruitSeed | undefined {
  const real = join(dir, `recruits_${season + 1}.json`), hist = join(dir, "history/recruits_2019_2026.json");
  if (!existsSync(join(dir, "recruiting.json")) || !existsSync(real) || !existsSync(hist)) return undefined;
  const r = read(dir, "recruiting.json");
  const h = read(dir, "history/recruits_2019_2026.json") as { fields: string[]; rows: unknown[][] };
  const f = (k: string) => h.fields.indexOf(k);
  return {
    curve: r.curve, class_size: r.class_size, pool: r.pool.rows, real: read(dir, `recruits_${season + 1}.json`), real_year: season + 1,
    history: h.rows.filter((x) => (x[f("year")] as number) >= season - 2 && x[f("committed_to")])
      .map((x) => ({ year: x[f("year")] as number, rating: (x[f("rating")] as number | null) ?? null, school: x[f("committed_to")] as string })),
  };
}

/** players.json holds ratings only; identity comes from the roster entry with the same id. */
export function unpackPlayers(teams: Record<string, any>, rosters: Record<string, Player[]>): Record<string, TeamPlayers> {
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

/** A rated player in the compact form players.json (and a league file) stores; `unpackPlayers` reverses it. */
export function packPlayer(p: RatedPlayer) {
  const r = (x: number | null) => (x == null ? null : Math.round(x * 10000) / 10000);
  return {
    id: p.id, pos: p.pos, years: p.years, stars: p.stars, composite: r(p.composite), natl_rank: p.natl_rank,
    a: ATTRS[p.pos].map((k) => p.attrs[k]), t: [p.traits.stamina, p.traits.injury, p.traits.toughness, p.traits.discipline],
    h: [p.hidden.potential, p.hidden.work_ethic], tend: p.tend, b: p.basis === "stats" ? p.sample : -p.sample,
  };
}
