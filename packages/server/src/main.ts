import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { LeagueManager } from "./manager.ts";
import { startServer } from "./http.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const port = Number(process.env.PORT || 8787);
const manager = new LeagueManager(process.env.LEAGUES_DIR || join(root, "leagues"));
startServer({ manager, staticDir: join(root, "packages/client/dist") }, port);
console.log(`CFB Dynasty server on http://localhost:${port}`);
