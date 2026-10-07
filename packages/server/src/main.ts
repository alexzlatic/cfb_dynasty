import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { LeagueManager } from "./manager.ts";
import { startServer } from "./http.ts";
import { leaguesDir, REPO_ROOT } from "./paths.ts";

const port = Number(process.env.PORT || 8787);
const manager = new LeagueManager(leaguesDir());

let commit = "dev";
try { commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { /* not a git checkout */ }

startServer({
  manager, staticDir: join(REPO_ROOT, "packages/client/dist"), commit,
  // The launcher sets this so a server nobody is looking at shuts itself down.
  idleExitMinutes: Number(process.env.CFB_IDLE_EXIT_MIN || 0),
  onQuit: () => { manager.closeAll(); process.exit(0); },
}, port);
console.log(`CFB Dynasty server on http://localhost:${port} (saves in ${manager.dir})`);
