import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { SeedBundle } from "./types.ts";

export const DEFAULT_SEED_DIR = fileURLToPath(new URL("../../../data/seed/2026wk1/", import.meta.url));

const read = (dir: string, f: string) => JSON.parse(readFileSync(join(dir, f), "utf8"));

/** Load the seed bundle written by importer/build_seed.py (plus power.json from scripts/power.ts). */
export function loadSeed(dir = DEFAULT_SEED_DIR): SeedBundle {
  const manifest = read(dir, "manifest.json");
  return {
    season: manifest.season,
    start_date: manifest.start_date,
    teams: read(dir, "teams.json"),
    conferences: read(dir, "conferences.json"),
    rosters: read(dir, "rosters.json"),
    coaches: read(dir, "coaches.json"),
    schedule: read(dir, "schedule.json"),
    ratings: read(dir, "team_ratings_all.json").teams,
    power: existsSync(join(dir, "power.json")) ? read(dir, "power.json").teams : {},
  };
}
