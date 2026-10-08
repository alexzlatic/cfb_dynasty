import { useEffect, useRef, useState } from "react";
import type { PlayRecord } from "@cfb/engine";
import type { Team } from "../api.ts";

/*
 * The live game on a full field: 22 dots that line up and run each play from the play-by-play record.
 * The picture is drawn from what the engine logged (play type, yards, line of scrimmage, the text), so it
 * shows where the ball went; who blocked whom is made up to fit.
 *
 * Coordinates are yards: x from the left end line (0-120, goal lines at 10 and 110), y across (0-53.3).
 * The home team attacks the left end zone, as on the old strip.
 */

const W = 120, HT = 160 / 3, C = HT / 2;
type P = [number, number];
type WP = [number, number, number]; // t, x, y
interface Anim {
  off: WP[][]; def: WP[][];
  offHome: boolean;
  ball: WP[];
  /** [t0, t1, peak] for a kick or throw in the air. */
  arc?: [number, number, number];
  /** Name and result next to the ball at the end. */
  label?: string;
  flag?: boolean;
  /** Big word over the field (TOUCHDOWN, INTERCEPTED...). */
  banner?: string;
}
export interface Idle { offHome: boolean; ytg: number; distance: number }

const clampY = (y: number) => Math.max(1, Math.min(HT - 1, y));
/** Nobody runs off the picture past an end line. */
const clampX = (x: number) => Math.max(0.5, Math.min(W - 0.5, x));
const ease = (u: number) => u * u * (3 - 2 * u);
function at(path: WP[], t: number): P {
  if (t <= path[0][0] || path.length === 1) return [path[0][1], path[0][2]];
  for (let i = 1; i < path.length; i++) {
    const [t1, x1, y1] = path[i];
    if (t <= t1) {
      const [t0, x0, y0] = path[i - 1];
      const u = t1 > t0 ? ease((t - t0) / (t1 - t0)) : 1;
      return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u];
    }
  }
  const l = path[path.length - 1];
  return [l[1], l[2]];
}
/** A stable small number from a name, so the same receiver lines up in the same spot. */
function hash(s: string): number { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; }
const num = (re: RegExp, s: string) => { const m = re.exec(s); return m ? Number(m[1]) : null; };

// Offense: 0-4 line, 5 QB, 6 RB, 7 TE, 8 X, 9 Z, 10 slot. [yards behind the line, yards across]
const OFF: P[] = [[1, -4], [1, -2], [1, 0], [1, 2], [1, 4], [5, 0], [6, 2.5], [1, 6.5], [1, -20], [1, 18], [2, -12]];
// Defense: 0-3 line, 4-6 linebackers, 7-8 corners, 9-10 safeties. [yards off the ball, yards across]
const DEF: P[] = [[1, -5], [1, -1.8], [1, 1.8], [1, 5], [5, -6], [5, 0], [5, 6], [7, -20], [7, 18], [12, -9], [12, 9]];
const RECEIVERS = [8, 9, 10, 7, 6];

/** x of a spot `ytg` yards from the goal the offense attacks. */
const xOf = (offHome: boolean, ytg: number) => 10 + (offHome ? ytg : 100 - ytg);

function formation(offHome: boolean, ytg: number) {
  const d = offHome ? -1 : 1, los = xOf(offHome, ytg);
  const off = OFF.map(([b, l]) => [los - d * b, clampY(C + l)] as P);
  const def = DEF.map(([b, l]) => [los + d * b, clampY(C + l)] as P);
  return { d, los, off, def };
}

/** Each dot stands where it is for the whole play unless moved. */
const still = (pts: P[]) => pts.map(([x, y]) => [[0, x, y]] as WP[]);
const go = (path: WP[], t: number, x: number, y: number) => { path.push([t, clampX(x), clampY(y)]); };
const last = (path: WP[]): P => { const l = path[path.length - 1]; return [l[1], l[2]]; };
/** Send the defense to the ball carrier's finishing spot, each one stopping a little short around it. */
function converge(def: WP[][], from: number, to: number, end: P, reach = 1): void {
  def.forEach((p, i) => {
    const [x, y] = last(p);
    const dx = end[0] - x, dy = end[1] - y, dist = Math.hypot(dx, dy) || 1;
    const stop = Math.max(0, dist - 1.2 - (i % 3) * 0.6);
    const k = Math.min(1, (stop / dist) * (dist > 25 ? 0.75 * reach : reach));
    go(p, from + (to - from) * 0.4, x + dx * k * 0.45, y + dy * k * 0.45);
    go(p, to, x + dx * k, y + dy * k);
  });
}

function scrimmage(p: PlayRecord, qbs: Set<string>): Anim {
  const h = p.offense_home, desc = p.description;
  const ytg = p.play_type === "PAT" || p.play_type === "2PT" ? 3 : p.yards_to_goal;
  const { d, los, off: o0, def: d0 } = formation(h, ytg);
  const off = still(o0), def = still(d0);
  const ball: WP[] = [[0, los, C]];
  const a: Anim = { off, def, offHome: h, ball };
  const td = /TOUCHDOWN/.test(desc), safety = /SAFETY/.test(desc);
  const ret = num(/returned (\d+) yards/, desc) ?? 0;
  const lead = desc.split(/ (rush|pass|sacked|scrambles|kneels)/)[0];
  const endX = (yds: number) => los + d * yds;
  const snap = () => { const [qx, qy] = last(off[5]); go(ball, 0.1, qx, qy); };
  const linePush = (yds: number, t = 0.5) => off.slice(0, 5).forEach((q) => { const [x, y] = last(q); go(q, t, x + d * yds, y); });
  const dlPush = (yds: number, t = 0.5) => def.slice(0, 4).forEach((q) => { const [x, y] = last(q); go(q, t, x - d * yds, y); });
  const routes = (skip: number, depth: number, t = 0.6) => [8, 9, 10, 7].forEach((i) => {
    if (i === skip) return;
    const [x, y] = last(off[i]);
    go(off[i], t, x + d * (depth + (i % 3) * 3), y + (C - y) * 0.25);
  });

  if (p.play_type === "KNEEL") {
    snap();
    go(off[5], 0.3, los - d * 5, C);
    go(ball, 0.3, los - d * 5, C);
    a.label = "Kneel";
    return a;
  }
  if (p.play_type === "RUN" || p.play_type === "2PT") {
    const yards = p.play_type === "2PT" ? (/GOOD/.test(desc) ? 3 : 1) : p.yards;
    const qb = qbs.has(lead);
    const carrier = qb ? 5 : 6;
    const lane = ((hash(desc) % 13) - 6) * 0.8;
    snap();
    if (!qb) {
      go(off[6], 0.2, los - d * 3, C + 0.6);
      go(ball, 0.2, los - d * 3, C + 0.6);
      go(off[5], 0.3, los - d * 6, C - 2);
    }
    const end: P = [endX(yards), clampY(C + lane)];
    go(off[carrier], 0.45, los - d * 0.5, C + lane * 0.5);
    go(off[carrier], 0.85, end[0], end[1]);
    go(ball, 0.45, los - d * 0.5, C + lane * 0.5);
    go(ball, 0.85, end[0], end[1]);
    linePush(Math.max(-0.5, Math.min(2, yards / 3)));
    dlPush(0.5);
    routes(-1, 5, 0.5);
    converge(def, 0.3, 0.88, end);
    a.label = p.play_type === "2PT" ? (yards === 3 ? "Two-point GOOD" : "Two-point FAILED") : `${lead} ${yards >= 0 ? "+" : ""}${yards}`;
    fumble(a, desc, d, end, ret);
  } else if (/sacked/.test(desc)) {
    snap();
    go(off[5], 0.3, los - d * 6, C);
    go(ball, 0.3, los - d * 6, C);
    const end: P = [endX(p.yards), C + ((hash(desc) % 5) - 2)];
    go(off[5], 0.62, end[0], end[1]);
    go(ball, 0.62, end[0], end[1]);
    routes(-1, 10);
    linePush(-1.5, 0.4);
    def.slice(0, 5).forEach((q, i) => go(q, 0.62, end[0] + d * (0.8 + (i % 2)), end[1] + (i - 2) * 1.1));
    def.slice(5).forEach((q) => { const [x, y] = last(q); go(q, 0.6, x + d * 3, y); });
    a.label = `Sacked ${p.yards}`;
    a.banner = "SACK";
    fumble(a, desc, d, end, ret);
  } else if (/scrambles/.test(desc)) {
    snap();
    go(off[5], 0.3, los - d * 6, C);
    go(ball, 0.3, los - d * 6, C);
    go(off[5], 0.45, los - d * 6, C + 4);
    go(ball, 0.45, los - d * 6, C + 4);
    const end: P = [endX(p.yards), clampY(C + 8 + (hash(desc) % 7))];
    go(off[5], 0.85, end[0], end[1]);
    go(ball, 0.85, end[0], end[1]);
    routes(-1, 12);
    linePush(-1, 0.4);
    def.slice(0, 4).forEach((q) => go(q, 0.4, los - d * 4, C + ((hash(desc + q.length) % 6) - 3)));
    converge(def, 0.45, 0.88, end);
    a.label = `${lead} scramble ${p.yards >= 0 ? "+" : ""}${p.yards}`;
  } else {
    // A throw: complete, incomplete or picked off.
    const tgtName = /(?:to|intended for) (.+?)(?: for| INTERCEPTED|,|\.|$)/.exec(desc)?.[1] ?? "";
    const tr = RECEIVERS[hash(tgtName) % RECEIVERS.length];
    const inc = /incomplete/.test(desc), int = /INTERCEPTED/.test(desc);
    snap();
    go(off[5], 0.28, los - d * 7, C);
    go(ball, 0.28, los - d * 7, C);
    const [rx, ry] = last(off[tr]);
    // An incompletion near the goal line is thrown no deeper than the back of the end zone.
    const room = d > 0 ? W - 1 - los : los - 1;
    const air = int ? p.yards : inc ? Math.min(room, 6 + (hash(desc) % 14)) : p.yards <= 3 ? Math.max(-2, p.yards - 2) : Math.max(3, Math.round(p.yards * 0.6));
    const catchAt: P = [endX(air), clampY(ry + (C - ry) * (air > 15 ? 0.15 : 0.35))];
    go(off[tr], 0.28, rx + d * Math.min(3, Math.max(-2, air) * 0.4), ry);
    go(off[tr], 0.55, catchAt[0], catchAt[1]);
    go(ball, 0.32, los - d * 7, C);
    go(ball, 0.55, catchAt[0], catchAt[1]);
    a.arc = [0.32, 0.55, Math.min(5, 1.2 + Math.abs(air) / 6)];
    routes(tr, 9);
    linePush(-1.5, 0.35);
    if (tr !== 6) go(off[6], 0.35, los - d * 4, C + 3);
    def.slice(0, 4).forEach((q, i) => go(q, 0.32, los - d * (5 + (i % 2)), C + (i - 1.5) * 1.6));
    // Linebackers drop, the secondary closes on the ball.
    def.slice(4, 7).forEach((q) => { const [x, y] = last(q); go(q, 0.5, x + d * 4, y); });
    const nearest = [7, 8, 9, 10].sort((i, j) => Math.hypot(d0[i][0] - catchAt[0], d0[i][1] - catchAt[1]) - Math.hypot(d0[j][0] - catchAt[0], d0[j][1] - catchAt[1]));
    nearest.forEach((i, k) => go(def[i], 0.55, catchAt[0] + d * (k === 0 ? (int ? 0 : 1.2) : 2 + k * 2), catchAt[1] + (k === 0 ? 0.8 : (k - 1.5) * 4)));
    if (inc) {
      go(ball, 0.7, catchAt[0] + d * 2.5, catchAt[1] + 1);
      a.label = "Incomplete";
    } else if (int) {
      const back = Math.min(ret, 100);
      const end: P = [catchAt[0] - d * back, clampY(catchAt[1] + ((hash(desc) % 9) - 4))];
      go(ball, 0.6, catchAt[0] + d * 0.3, catchAt[1] + 0.8);
      go(def[nearest[0]], 0.6, catchAt[0] + d * 0.3, catchAt[1] + 0.8);
      go(def[nearest[0]], 0.9, end[0], end[1]);
      go(ball, 0.9, end[0], end[1]);
      off.forEach((q, i) => { if (i === 5 || i === tr || i < 5) { const [x, y] = last(q); const k = 0.5; go(q, 0.92, x + (end[0] - x) * k, y + (end[1] - y) * k); } });
      a.label = `Picked off${back ? `, ${back} back` : ""}`;
      a.banner = "INTERCEPTED";
    } else {
      const end: P = [endX(p.yards), clampY(catchAt[1] + ((hash(tgtName) % 7) - 3))];
      go(off[tr], 0.88, end[0], end[1]);
      go(ball, 0.88, end[0], end[1]);
      converge(def, 0.56, 0.9, end);
      a.label = `${tgtName} ${p.yards >= 0 ? "+" : ""}${p.yards}`;
      fumble(a, desc, d, end, ret);
    }
  }
  if (td) a.banner = "TOUCHDOWN";
  if (safety) a.banner = "SAFETY";
  return a;
}

/** A fumble lost at the end of a run: the ball squirts loose and a defender falls on it (and maybe runs). */
function fumble(a: Anim, desc: string, d: number, end: P, ret: number): void {
  if (!/FUMBLES/.test(desc)) return;
  const loose: P = [end[0] + d * 1.5, clampY(end[1] + 2)];
  go(a.ball, 0.92, loose[0], loose[1]);
  const back: P = [loose[0] - d * ret, loose[1]];
  go(a.def[5], 0.92, loose[0], loose[1]);
  if (ret) { go(a.def[5], 1, back[0], back[1]); go(a.ball, 1, back[0], back[1]); }
  a.banner = "FUMBLE";
}

function kick(p: PlayRecord): Anim | null {
  const h = p.offense_home, desc = p.description, d = h ? -1 : 1;
  const ret = num(/returned (\d+) yards/, desc) ?? 0;
  if (p.play_type === "PUNT") {
    const { los, off: o0, def: d0 } = formation(h, p.yards_to_goal);
    o0[5] = [los - d * 14, C]; o0[6] = [los - d * 5, C + 2];
    const tb = /touchback/.test(desc), blocked = /BLOCKED/.test(desc);
    const landYtg = tb ? -4 : p.yards_to_goal - p.yards;
    const land: P = [xOf(h, landYtg), C + ((hash(desc) % 11) - 5)];
    d0[9] = [land[0], land[1]]; d0[10] = [land[0] - d * 8, C - 6];
    const off = still(o0), def = still(d0), ball: WP[] = [[0, los, C]];
    go(ball, 0.12, o0[5][0], C);
    if (blocked) {
      go(ball, 0.3, los - d * 8, C);
      go(ball, 0.6, los - d * 11, C + 3);
      def.slice(0, 4).forEach((q, i) => go(q, 0.3, los - d * 9, C + (i - 1.5) * 1.5));
      return { off, def, offHome: h, ball, label: "Blocked!", banner: "BLOCKED" };
    }
    go(ball, 0.6, land[0], land[1]);
    off.forEach((q, i) => { if (i !== 5) { const [x, y] = last(q); go(q, 0.62, land[0] - d * (3 + (i % 4) * 2), y + (land[1] - y) * 0.6); } });
    def.slice(0, 9).forEach((q) => { const [x, y] = last(q); go(q, 0.5, x + d * 12, y); });
    let label = `Punt ${tb ? p.yards_to_goal : p.yards} yds`;
    if (ret || /TOUCHDOWN/.test(desc)) {
      const back = /TOUCHDOWN/.test(desc) ? 100 - landYtg + 10 : ret;
      const end: P = [land[0] - d * Math.min(back, 105), land[1] + 4];
      go(def[9], 0.62, land[0], land[1]); go(ball, 0.62, land[0], land[1]);
      go(def[9], 0.92, end[0], end[1]); go(ball, 0.92, end[0], end[1]);
      label += `, ${ret} back`;
    }
    return { off, def, offHome: h, ball, arc: [0.12, 0.6, 9], label, banner: /TOUCHDOWN/.test(desc) ? "TOUCHDOWN" : undefined };
  }
  if (p.play_type === "FG" || p.play_type === "PAT") {
    const ytg = p.play_type === "PAT" ? 3 : p.yards_to_goal;
    const { los, off: o0, def: d0 } = formation(h, ytg);
    o0[5] = [los - d * 7, C + 0.5]; o0[6] = [los - d * 9.5, C - 1.5];
    [8, 9, 10].forEach((i, k) => { o0[i] = [los - d * 1.5, C + [-6, 6, -7.5][k]]; });
    [7, 8, 9, 10].forEach((i, k) => { d0[i] = [los + d * (2 + k), C + [-7, 7, -3, 3][k]]; });
    const off = still(o0), def = still(d0), ball: WP[] = [[0, los, C]];
    const good = / GOOD/.test(desc) && !/NO GOOD/.test(desc), blocked = /BLOCKED/.test(desc);
    go(ball, 0.12, o0[5][0], o0[5][1]);
    go(off[6], 0.22, o0[5][0] - d * 1.5, o0[5][1] - 0.6);
    const goalX = d > 0 ? W : 0;
    def.slice(0, 4).forEach((q, i) => go(q, 0.3, los - d * 1.5, C + (i - 1.5) * 1.8));
    if (blocked) { go(ball, 0.32, los - d * 1, C + 2); go(ball, 0.55, los - d * 6, C + 6); return { off, def, offHome: h, ball, label: "Blocked", banner: "BLOCKED" }; }
    go(ball, 0.22, o0[5][0], o0[5][1]);
    go(ball, 0.75, goalX, good ? C : C + ((hash(desc) % 2) ? 6 : -6));
    const label = p.play_type === "PAT" ? (good ? "Extra point good" : "Extra point missed") : `${ytg + 17}-yd FG ${good ? "GOOD" : "no good"}`;
    return { off, def, offHome: h, ball, arc: [0.22, 0.75, 6], label, banner: p.play_type === "FG" ? (good ? "IT'S GOOD" : "NO GOOD") : undefined };
  }
  if (p.play_type === "KICKOFF") {
    // The kicking team is the logged offense; it kicks from its own 35 toward the goal it attacks.
    const kx = xOf(h, 65);
    const recvX = (own: number) => xOf(h, own); // the receiver's own `own` yard line
    let land: number, end: number, label: string;
    const onside = /onside/.test(desc);
    const m = /to the (\S+) (\d+)/.exec(desc);
    if (onside) { land = 100 - 35 - 11; end = land; label = /recovered by (\S+)!/.test(desc) ? "Onside, recovered!" : "Onside, recovered by the return team"; }
    else if (/touchback/.test(desc)) { land = -5; end = 25; label = "Touchback"; }
    else if (/fair catch/.test(desc)) { land = 25; end = 25; label = "Fair catch"; }
    else if (/TOUCHDOWN/.test(desc)) { land = 2; end = 100; label = `Returned ${ret} for a TD`; }
    else {
      end = m ? (m[1] === p.offense ? 100 - Number(m[2]) : Number(m[2])) : 25;
      land = Math.max(-3, end - ret);
      label = `${ret}-yard return`;
    }
    const off = Array.from({ length: 11 }, (_, i) => [[0, kx - d * (i === 5 ? 6 : 1), clampY(4 + i * 4.5)]] as WP[]);
    const def = Array.from({ length: 11 }, (_, i) =>
      [[0, i < 9 ? recvX(i < 5 ? 45 : 32) : recvX(Math.max(-2, land)), i < 9 ? clampY(8 + (i % 5) * 9) : C + (i === 9 ? -3 : 6)]] as WP[]);
    const ball: WP[] = [[0, kx, C]];
    const landP: P = [recvX(land), C - 3];
    go(off[5], 0.1, kx, C);
    go(ball, 0.45, landP[0], landP[1]);
    if (onside) {
      off.forEach((q) => { const [, y] = last(q); go(q, 0.45, landP[0] + d * 1, y * 0.5 + landP[1] * 0.5); });
      return { off, def, offHome: h, ball, arc: [0.1, 0.45, 2], label };
    }
    go(def[9], 0.45, landP[0], landP[1]);
    const endP: P = [recvX(Math.min(end, 110)), C + ((hash(desc) % 9) - 4) * 2];
    if (end !== land) { go(def[9], 0.9, endP[0], endP[1]); go(ball, 0.9, endP[0], endP[1]); }
    off.forEach((q, i) => { const [x, y] = last(q); const tx = end !== land ? endP : landP; const k = 0.85 - (i % 3) * 0.08; go(q, 0.9, x + (tx[0] - x) * k, y + (tx[1] - y) * k); });
    def.slice(0, 9).forEach((q) => { const [x, y] = last(q); go(q, 0.6, x - d * 8, y); });
    return { off, def, offHome: h, ball, arc: [0.1, 0.45, 12], label, banner: /TOUCHDOWN/.test(desc) ? "TOUCHDOWN" : undefined };
  }
  return null;
}

export function build(p: PlayRecord, qbs: Set<string>): Anim | null {
  if (["RUN", "PASS", "KNEEL", "2PT"].includes(p.play_type)) return scrimmage(p, qbs);
  return kick(p);
}

function idleAnim(i: Idle): Anim {
  const f = formation(i.offHome, i.ytg);
  return { off: still(f.off), def: still(f.def), offHome: i.offHome, ball: [[0, f.los, C]] };
}

/** Two team colors far enough apart to tell the dots apart. */
function dotColors(H: Team | undefined, A: Team | undefined): { home: [string, string]; away: [string, string] } {
  const hc = H?.color ?? "#c62828", ac = A?.color ?? "#1565c0";
  const rgb = (c: string) => [0, 2, 4].map((k) => parseInt(c.replace("#", "").slice(k, k + 2), 16) || 0);
  const dist = (x: string, y: string) => { const [a, b] = [rgb(x), rgb(y)]; return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]); };
  const home: [string, string] = [hc, H?.alt_color ?? "#fff"];
  const away: [string, string] = dist(hc, ac) < 90 ? ["#f4f4f4", ac] : [ac, A?.alt_color ?? "#fff"];
  return { home, away };
}

export function FieldView(props: {
  home?: Team; away?: Team;
  /** The play being shown and its key (a new key restarts the animation). */
  play: PlayRecord | null; playKey: number; ms: number;
  /** Where the next snap is, if the game is waiting for one; the dots line up there after the play. */
  idle: Idle | null;
  qbs: Set<string>;
  /** Called with the play's key once it has finished and the dots have stopped. */
  onSettled?: (key: number) => void;
}) {
  const { home: H, away: A, play, playKey, ms, idle, qbs, onSettled } = props;
  const [t, setT] = useState(1);
  const [lineup, setLineup] = useState(false);
  const anim = useRef<Anim | null>(null);
  const keyRef = useRef(-1);

  if (keyRef.current !== playKey) {
    keyRef.current = playKey;
    const a = play ? build(play, qbs) : null;
    if (a) anim.current = a;
    else if (play && anim.current) anim.current = { ...freeze(anim.current), flag: play.play_type === "PENALTY" };
  }

  useEffect(() => {
    setLineup(false);
    const settle = () => { setLineup(true); onSettled?.(playKey); };
    if (!play || ms <= 0) { setT(1); settle(); return; }
    let raf = 0, timer = 0;
    const start = performance.now(), dur = ms * 0.88;
    const step = (now: number) => {
      const u = Math.min(1, (now - start) / dur);
      setT(u);
      if (u < 1) raf = requestAnimationFrame(step);
      else timer = window.setTimeout(settle, Math.min(700, ms * 0.35));
    };
    setT(0);
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); clearTimeout(timer); };
  }, [playKey, ms]);

  const showIdle = idle && (lineup || !anim.current);
  const a = showIdle ? idleAnim(idle) : anim.current;
  const colors = dotColors(H, A);
  const offC = a?.offHome ? colors.home : colors.away, defC = a?.offHome ? colors.away : colors.home;
  const ballP = a ? at(a.ball, t) : null;
  let lift = 0;
  if (a?.arc && !showIdle) { const [t0, t1, peak] = a.arc; if (t > t0 && t < t1) lift = Math.sin(Math.PI * (t - t0) / (t1 - t0)) * peak; }
  const done = showIdle || t >= 0.85;
  // The result reads out as the play ends, not before.
  const desc = play && !showIdle && t >= 0.7 ? play.description : null;

  // Yard lines and numbers.
  const lines = [];
  for (let yd = 5; yd < 100; yd += 5) {
    const x = 10 + yd;
    lines.push(<line key={`l${yd}`} x1={x} x2={x} y1={0} y2={HT} stroke="rgba(255,255,255,.55)" strokeWidth={yd % 10 ? 0.12 : 0.22} />);
    if (yd % 10 === 0) {
      const n = yd <= 50 ? yd : 100 - yd;
      lines.push(<text key={`n${yd}`} x={x} y={8} className="fnum">{n}</text>, <text key={`m${yd}`} x={x} y={HT - 5.5} className="fnum">{n}</text>);
    }
  }
  for (let yd = 1; yd < 100; yd++) {
    if (yd % 5 === 0) continue;
    const x = 10 + yd;
    lines.push(<line key={`h${yd}`} x1={x} x2={x} y1={HT / 2 - 3.1} y2={HT / 2 - 2.4} stroke="rgba(255,255,255,.5)" strokeWidth={0.12} />,
      <line key={`k${yd}`} x1={x} x2={x} y1={HT / 2 + 2.4} y2={HT / 2 + 3.1} stroke="rgba(255,255,255,.5)" strokeWidth={0.12} />);
  }

  const losX = idle ? xOf(idle.offHome, idle.ytg) : null;
  const gainX = idle ? xOf(idle.offHome, Math.max(0, idle.ytg - idle.distance)) : null;
  const ez = (side: "l" | "r", team?: Team) => (
    <g>
      <rect x={side === "l" ? 0 : 110} y={0} width={10} height={HT} fill={team?.color ?? "#444"} />
      <text x={side === "l" ? 5 : 115} y={C} className="fez" fill={team?.alt_color && team.alt_color !== team.color ? team.alt_color : "#fff"}
        transform={`rotate(${side === "l" ? -90 : 90} ${side === "l" ? 5 : 115} ${C})`}>{team?.abbr ?? ""}</text>
    </g>
  );

  return (
    <div className="fieldview">
      <svg viewBox={`0 0 ${W} ${HT}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={desc ?? "The field"}>
        <rect x={0} y={0} width={W} height={HT} fill="#2f7d32" />
        {Array.from({ length: 10 }, (_, i) => <rect key={i} x={10 + i * 10} y={0} width={5} height={HT} fill="rgba(255,255,255,.035)" />)}
        {ez("l", A)}{ez("r", H)}
        <rect x={10} y={0} width={100} height={HT} fill="none" stroke="#fff" strokeWidth={0.3} />
        {lines}
        {showIdle && losX != null && <line x1={losX} x2={losX} y1={0} y2={HT} stroke="#4aa3ff" strokeWidth={0.35} />}
        {showIdle && gainX != null && idle!.ytg > idle!.distance && <line x1={gainX} x2={gainX} y1={0} y2={HT} stroke="#f5c542" strokeWidth={0.4} />}
        {a && <>
          {a.def.map((path, i) => { const [x, y] = at(path, t); return <circle key={`d${i}`} cx={x} cy={y} r={0.95} fill={defC[0]} stroke={defC[1]} strokeWidth={0.3} />; })}
          {a.off.map((path, i) => { const [x, y] = at(path, t); return <circle key={`o${i}`} cx={x} cy={y} r={0.95} fill={offC[0]} stroke={offC[1]} strokeWidth={0.3} />; })}
          {ballP && <>
            {lift > 0.3 && <ellipse cx={ballP[0]} cy={ballP[1]} rx={0.55} ry={0.3} fill="rgba(0,0,0,.35)" />}
            <ellipse cx={ballP[0]} cy={ballP[1] - lift * 0.6} rx={0.7 + lift * 0.06} ry={0.45 + lift * 0.04} fill="#7a3f17" stroke="#fff" strokeWidth={0.15} />
          </>}
          {a.flag && !showIdle && <rect x={(ballP?.[0] ?? 60) + 2} y={C + 4} width={1.2} height={1.2} fill="#f5d000" transform={`rotate(20 ${(ballP?.[0] ?? 60) + 2} ${C + 4})`} />}
          {a.label && done && !showIdle && ballP && (
            <text x={Math.min(W - 12, Math.max(12, ballP[0]))} y={Math.max(4, ballP[1] - 2.6)} className="flabel">{a.label}</text>
          )}
          {a.banner && !showIdle && t > 0.5 && <text x={Math.min(W - 25, Math.max(25, ballP?.[0] ?? W / 2))} y={HT - 13} className="fbanner">{a.banner}</text>}
        </>}
      </svg>
      <div className="fielddesc">{desc ?? (idle ? " " : "")}</div>
    </div>
  );
}

/** The same dots, standing where the last play ended. */
function freeze(a: Anim): Anim {
  const end = (path: WP[]): WP[] => { const [x, y] = at(path, 1); return [[0, x, y]]; };
  return { off: a.off.map(end), def: a.def.map(end), offHome: a.offHome, ball: end(a.ball) };
}
