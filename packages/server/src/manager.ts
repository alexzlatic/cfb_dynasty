import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { loadSeed, type SeedBundle, type Settings } from "@cfb/core";
import { League } from "./league.ts";

/** Opens league files from a folder and keeps them open while the server runs. */
export class LeagueManager {
  private open = new Map<string, League>();
  private seedCache: SeedBundle | null = null;

  constructor(public readonly dir: string, private seedDir?: string) {
    mkdirSync(dir, { recursive: true });
  }

  seed(): SeedBundle { return (this.seedCache ??= loadSeed(this.seedDir)); }
  path(id: string): string { return join(this.dir, `${id}.sqlite`); }

  list(): { id: string; name: string; date: string; user_team_id: number | null }[] {
    return readdirSync(this.dir).filter((f) => f.endsWith(".sqlite")).map((f) => {
      const lg = this.get(f.replace(/\.sqlite$/, ""));
      return { id: lg.id, name: lg.name, date: lg.season.state.date, user_team_id: lg.season.state.user_team_id };
    });
  }

  get(id: string): League {
    if (!/^[a-z0-9-]{1,64}$/.test(id)) throw new Error("bad league id");
    let lg = this.open.get(id);
    if (!lg) {
      if (!existsSync(this.path(id))) throw new Error("no such league");
      lg = League.open(id, this.path(id));
      this.open.set(id, lg);
    }
    return lg;
  }

  create(opts: { name: string; user_team_id: number | null; seed?: number; settings?: Partial<Settings> }): League {
    const base = opts.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "league";
    let id = base;
    for (let i = 2; existsSync(this.path(id)); i++) id = `${base}-${i}`;
    const lg = League.create(id, this.path(id), this.seed(), opts);
    this.open.set(id, lg);
    return lg;
  }

  closeAll(): void { for (const lg of this.open.values()) lg.close(); this.open.clear(); }
}
