#!/usr/bin/env node
/**
 * Opens the game: starts the server in the background if it is not already running, then opens the
 * game window. This is what the CFB Dynasty app (see install-app.mjs) and `npm run play` run.
 *
 *   node scripts/launch.mjs [--update] [--no-open]
 *
 * --update pulls the latest code first (fast-forward only, on a clean checkout of main), installs
 * dependencies when the lockfile changed and rebuilds the client when its source changed. A server left
 * running from older code is restarted. Saved leagues live outside the repository and are untouched.
 */
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, openSync, readdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const PORT = Number(process.env.PORT || 8787);
const URL_ = `http://localhost:${PORT}/`;
const DATA = process.env.CFB_DATA_DIR || join(homedir(), "Documents", "CFB Dynasty");
const LOG = join(DATA, "logs");
const args = new Set(process.argv.slice(2));
const log = (...m) => console.log(new Date().toISOString(), ...m);

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"], ...opts })?.toString().trim() ?? "";
const npm = platform() === "win32" ? "npm.cmd" : "npm";

async function health() {
  try {
    const r = await fetch(URL_ + "api/health", { signal: AbortSignal.timeout(1500) });
    const b = await r.json();
    return b.app === "cfb-dynasty" ? b : null;
  } catch { return null; }
}

function head() { try { return sh("git", ["rev-parse", "HEAD"]); } catch { return "dev"; } }

function update() {
  try {
    if (sh("git", ["rev-parse", "--abbrev-ref", "HEAD"]) !== "main") return log("update skipped: not on main");
    if (sh("git", ["status", "--porcelain", "--untracked-files=no"])) return log("update skipped: local changes");
    sh("git", ["pull", "--ff-only", "--quiet", "origin", "main"], { timeout: 30_000 });
    log("code is up to date at", head().slice(0, 7));
  } catch (e) { log("update skipped:", e.message.split("\n")[0]); }
}

/** Newest modification time of any file under `dir` (skipping node_modules). */
function newest(dir) {
  let t = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === "node_modules" || e.name === "dist") continue;
    const p = join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : statSync(p).mtimeMs);
  }
  return t;
}

function prepare() {
  const stamp = join(ROOT, "node_modules", ".package-lock.json");
  if (!existsSync(stamp) || statSync(join(ROOT, "package-lock.json")).mtimeMs > statSync(stamp).mtimeMs) {
    log("installing dependencies");
    sh(npm, ["install", "--no-audit", "--no-fund"], { stdio: "inherit", shell: platform() === "win32" });
  }
  const built = join(ROOT, "packages/client/dist/index.html");
  const src = Math.max(newest(join(ROOT, "packages/client")), newest(join(ROOT, "packages/core/src")));
  if (!existsSync(built) || src > statSync(built).mtimeMs) {
    log("building the game screens");
    sh(npm, ["run", "build", "-w", "@cfb/client"], { stdio: "inherit", shell: platform() === "win32" });
  }
}

async function startServer() {
  mkdirSync(LOG, { recursive: true });
  const out = openSync(join(LOG, "server.log"), "a");
  const tsx = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
  const child = spawn(process.execPath, [tsx, join(ROOT, "packages/server/src/main.ts")], {
    cwd: ROOT, detached: true, stdio: ["ignore", out, out],
    env: { ...process.env, PORT: String(PORT), CFB_IDLE_EXIT_MIN: process.env.CFB_IDLE_EXIT_MIN || "20" },
  });
  child.unref();
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await health()) return true;
  }
  return false;
}

/** A Chrome or Edge app window when one is installed (no tabs or address bar), else the default browser. */
function openWindow() {
  const os = platform();
  if (os === "darwin") {
    for (const app of ["Google Chrome", "Microsoft Edge", "Brave Browser"]) {
      if (existsSync(`/Applications/${app}.app`) || existsSync(join(homedir(), "Applications", `${app}.app`))) {
        return spawn("open", ["-na", app, "--args", `--app=${URL_}`, "--window-size=1440,900"], { detached: true, stdio: "ignore" }).unref();
      }
    }
    return spawn("open", [URL_], { detached: true, stdio: "ignore" }).unref();
  }
  if (os === "win32") {
    const edge = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
    if (existsSync(edge)) return spawn(edge, [`--app=${URL_}`], { detached: true, stdio: "ignore" }).unref();
    return spawn("cmd", ["/c", "start", "", URL_], { detached: true, stdio: "ignore" }).unref();
  }
  spawn("xdg-open", [URL_], { detached: true, stdio: "ignore" }).unref();
}

if (args.has("--update")) update();
let running = await health();
if (running && running.commit !== "dev" && running.commit !== head()) {
  log("restarting the server on the new code");
  try { await fetch(URL_ + "api/quit", { method: "POST" }); } catch { /* already gone */ }
  for (let i = 0; i < 20 && (await health()); i++) await new Promise((r) => setTimeout(r, 250));
  running = null;
}
if (!running) {
  prepare();
  log("starting the game server");
  if (!(await startServer())) {
    log(`the server did not start; see ${join(LOG, "server.log")}`);
    process.exit(1);
  }
}
if (!args.has("--no-open")) openWindow();
log("game open at", URL_);
