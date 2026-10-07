import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The repository root (three levels up from this file). */
export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

/**
 * Where saved games live: `CFB_DATA_DIR`, else `~/Documents/CFB Dynasty`. Saves sit outside the
 * repository so updating or re-cloning the code never touches them.
 */
export function dataDir(): string {
  return process.env.CFB_DATA_DIR || join(homedir(), "Documents", "CFB Dynasty");
}

/** League folder: `LEAGUES_DIR` if set, else `<data dir>/leagues`. */
export function leaguesDir(): string {
  if (process.env.LEAGUES_DIR) return process.env.LEAGUES_DIR;
  const dir = join(dataDir(), "leagues");
  mkdirSync(dir, { recursive: true });
  // Leagues saved in the repository's leagues/ folder before saves moved are copied over once.
  const old = join(REPO_ROOT, "leagues");
  if (existsSync(old)) {
    for (const f of readdirSync(old)) {
      if (!f.endsWith(".sqlite") || existsSync(join(dir, f))) continue;
      for (const part of [f, `${f}-wal`, `${f}-shm`]) if (existsSync(join(old, part))) copyFileSync(join(old, part), join(dir, part));
    }
  }
  return dir;
}
