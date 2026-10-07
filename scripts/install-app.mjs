#!/usr/bin/env node
/**
 * One-time setup: adds a CFB Dynasty app you open like any other, so the game never needs the terminal.
 *
 *   npm run install-app
 *
 * macOS: ~/Applications/CFB Dynasty.app (Spotlight, Launchpad; drag it to the Dock).
 * Windows: a CFB Dynasty shortcut on the desktop and in the Start menu.
 * Linux: a CFB Dynasty entry in the applications menu.
 *
 * Opening it runs scripts/launch.mjs --update: it pulls the latest code, starts the game server in the
 * background if needed and opens the game window. Saves stay in ~/Documents/CFB Dynasty.
 */
import { execFileSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url)).replace(/[\\/]$/, "");
const NODE = process.execPath;
const LAUNCH = join(ROOT, "scripts", "launch.mjs");
const LOGS = join(homedir(), "Documents", "CFB Dynasty", "logs");
const q = (s) => `"${s.replace(/(["\\$`])/g, "\\$1")}"`;

function mac() {
  const app = join(homedir(), "Applications", "CFB Dynasty.app");
  rmSync(app, { recursive: true, force: true });
  mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
  mkdirSync(join(app, "Contents", "Resources"), { recursive: true });
  writeFileSync(join(app, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>CFB Dynasty</string>
  <key>CFBundleDisplayName</key><string>CFB Dynasty</string>
  <key>CFBundleIdentifier</key><string>local.cfb-dynasty.launcher</string>
  <key>CFBundleVersion</key><string>1</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleExecutable</key><string>launch</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>LSUIElement</key><true/>
</dict></plist>
`);
  const exe = join(app, "Contents", "MacOS", "launch");
  writeFileSync(exe, `#!/bin/bash
# Opens CFB Dynasty. Made by scripts/install-app.mjs; run it again if you move the game folder.
NODE=${q(NODE)}
[ -x "$NODE" ] || NODE="$(PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH" command -v node)"
export PATH="$(dirname "$NODE"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
mkdir -p ${q(LOGS)}
if [ -z "$NODE" ] || [ ! -d ${q(ROOT)} ]; then
  osascript -e 'display alert "CFB Dynasty could not start" message "Node or the game folder is missing. Run npm run install-app again from the game folder."'
  exit 1
fi
cd ${q(ROOT)}
if ! "$NODE" scripts/launch.mjs --update >> ${q(join(LOGS, "launcher.log"))} 2>&1; then
  osascript -e 'display alert "CFB Dynasty could not start" message "Details are in Documents/CFB Dynasty/logs."'
  exit 1
fi
`);
  chmodSync(exe, 0o755);
  // Icon: assets/icon.png turned into an .icns with the tools every Mac has.
  try {
    const set = join(tmpdir(), "cfb-dynasty.iconset");
    rmSync(set, { recursive: true, force: true });
    mkdirSync(set);
    for (const s of [16, 32, 128, 256, 512]) {
      execFileSync("sips", ["-z", String(s), String(s), join(ROOT, "assets/icon.png"), "--out", join(set, `icon_${s}x${s}.png`)], { stdio: "ignore" });
      execFileSync("sips", ["-z", String(s * 2), String(s * 2), join(ROOT, "assets/icon.png"), "--out", join(set, `icon_${s}x${s}@2x.png`)], { stdio: "ignore" });
    }
    execFileSync("iconutil", ["-c", "icns", set, "-o", join(app, "Contents", "Resources", "icon.icns")]);
    rmSync(set, { recursive: true, force: true });
  } catch { console.log("(could not make the app icon; the app still works)"); }
  try { execFileSync("touch", [app]); execFileSync("open", ["-R", app]); } catch { /* Finder is optional */ }
  console.log(`Installed ${app}\nOpen it from Spotlight or Launchpad, or drag it from the Finder window to your Dock.`);
}

function windows() {
  const target = join(dirname(NODE), "node.exe");
  const make = (dir) => {
    const lnk = join(dir, "CFB Dynasty.lnk");
    const ps = `$s=(New-Object -ComObject WScript.Shell).CreateShortcut('${lnk}');$s.TargetPath='${target}';` +
      `$s.Arguments='"${LAUNCH}" --update';$s.WorkingDirectory='${ROOT}';$s.IconLocation='${join(ROOT, "assets", "icon.ico")}';$s.WindowStyle=7;$s.Save()`;
    execFileSync("powershell", ["-NoProfile", "-Command", ps], { stdio: "inherit" });
    return lnk;
  };
  const desk = make(join(homedir(), "Desktop"));
  const start = join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs");
  if (existsSync(start)) make(start);
  console.log(`Installed ${desk} and a Start menu entry.`);
}

function linux() {
  const dir = join(homedir(), ".local", "share", "applications");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "cfb-dynasty.desktop");
  writeFileSync(file, `[Desktop Entry]\nType=Application\nName=CFB Dynasty\nExec=${q(NODE)} ${q(LAUNCH)} --update\nPath=${ROOT}\nIcon=${join(ROOT, "assets", "icon.png")}\nTerminal=false\nCategories=Game;\n`);
  console.log(`Installed ${file}`);
}

({ darwin: mac, win32: windows }[platform()] ?? linux)();
