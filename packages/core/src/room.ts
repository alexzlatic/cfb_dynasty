import type { ISODate } from "./dates.ts";
import { MAX_CONTACT, type Region } from "./recruiting.ts";
import { STAFFER_HOURS, staffHours, type Skill } from "./staff.ts";

/**
 * The staff room: your staff's whole week, one coach at a time. Each coach (and your recruiting staff as one
 * desk) holds lines of work: contact with a prospect, upkeep on a group of recruits, visits, scouting trips,
 * a region, general scouting, practice and the game plan, opponent film, development plans. A line's hours
 * come out of that coach's flexible week (40 hours, 24 at FCS schools; 16 for each recruiting staffer), so
 * the staff's split is the sum of what each coach does, and a coach's own skill is what his hours are worth.
 *
 * Without a room (older saves, or before you open it) the staff splits its week by shares (`StaffTime`)
 * exactly as before. The room's lines are turned into the same per-prospect contact hours and region hours
 * the weekly recruiting and scouting already read (`Season.syncRoom`).
 */
export type Seat = "HC" | "OC" | "DC" | "STC" | "staff";
export const SEATS: Seat[] = ["HC", "OC", "DC", "STC", "staff"];
export const COACH_SEATS: Seat[] = ["HC", "OC", "DC", "STC"];

/** Where an hour goes, as the staff's split counts it. */
export type RoomArea = "recruiting" | "scouting" | "prep" | "opponent" | "develop";
export type TaskKind = "contact" | "upkeep" | "official" | "home" | "trip" | "region" | "scout" | "practice" | "film" | "develop";
/** When a line runs: all year, only in season (August 20 to December 14), only out of season, or this week only (`week`). */
export type When = "all" | "in" | "off" | "week";

export interface RoomTask {
  id: number; kind: TaskKind;
  /** A prospect id, a region key or an upkeep group (UPKEEP_GROUPS), by kind. */
  target?: string;
  hours: number; when: When;
  /** The Monday of the week a "week" line runs. */
  week?: ISODate;
}
/** Something waiting for a coach: a prospect or a region sent from the big board, a prospect's page or the map. */
export interface TrayItem { kind: "prospect" | "region"; key: string }
export interface StaffRoom {
  tasks: Record<Seat, RoomTask[]>;
  tray: TrayItem[];
  next: number;
  /** Each prospect's lead recruiter (a coach id), the coach with the most contact hours on him. */
  lead?: Record<string, number>;
}

export interface TaskInfo {
  name: string; short: string; area: RoomArea;
  /** What the line points at. */
  target: "prospect" | "region" | "group" | null;
  /** Recruiting staffers can do it (calls, upkeep and region work; no visits, trips or coaching). */
  staff: boolean;
  /** Only the head coach. */
  hc?: boolean;
  /** Game-week work: idle out of season. */
  season?: boolean;
  /** Its hours are set by what it is (a visit, a trip), not by you. */
  fixed?: boolean;
  /** Hours a new line starts with. */
  def: number;
  /** The coach skill its hours draw on. */
  skill: Skill;
}
export const TASKS: Record<TaskKind, TaskInfo> = {
  contact: { name: "Recruit a prospect", short: "Recruit", area: "recruiting", target: "prospect", staff: true, def: 6, skill: "recruiting" },
  upkeep: { name: "Upkeep on a group", short: "Upkeep", area: "recruiting", target: "group", staff: true, def: 8, skill: "recruiting" },
  official: { name: "Host an official visit", short: "Official visit", area: "recruiting", target: "prospect", staff: false, fixed: true, def: 6, skill: "recruiting" },
  home: { name: "Home visit", short: "Home visit", area: "recruiting", target: "prospect", staff: false, hc: true, fixed: true, def: 6, skill: "recruiting" },
  trip: { name: "Scout a player", short: "Scout trip", area: "scouting", target: "prospect", staff: false, fixed: true, def: 6, skill: "scouting" },
  region: { name: "Work a region", short: "Region", area: "scouting", target: "region", staff: true, def: 8, skill: "scouting" },
  scout: { name: "General scouting", short: "Scouting", area: "scouting", target: null, staff: true, def: 4, skill: "scouting" },
  practice: { name: "Practice and game plan", short: "Practice", area: "prep", target: null, staff: false, season: true, def: 12, skill: "game_planning" },
  film: { name: "Opponent film", short: "Film", area: "opponent", target: null, staff: false, season: true, def: 6, skill: "scouting" },
  develop: { name: "Development plans", short: "Development", area: "develop", target: null, staff: false, season: true, def: 4, skill: "development" },
};
export const TASK_KINDS = Object.keys(TASKS) as TaskKind[];

/** Upkeep groups: your commits (all, or one class), and the rest of your big board (prospects without a line of their own). */
export const upkeepGroupName = (key: string) => key === "commits" ? "Your commits" : key === "board" ? "The rest of your big board" : key.startsWith("commits:") ? `Your ${key.slice(8)} commits` : key;
export const isUpkeepGroup = (key: string) => key === "commits" || key === "board" || /^commits:\d{4}$/.test(key);

/** A seat's flexible hours a week. */
export function seatCap(seat: Seat, level: "fbs" | "fcs", staffers: number): number {
  return seat === "staff" ? STAFFER_HOURS * staffers : staffHours(level) / 4;
}

export function emptyRoom(): StaffRoom {
  return { tasks: { HC: [], OC: [], DC: [], STC: [], staff: [] }, tray: [], next: 1 };
}

/** Whether a line runs in a week (in season or not, the week's Monday). */
export function runs(t: RoomTask, inSeason: boolean, monday: ISODate): boolean {
  if (TASKS[t.kind].season && !inSeason) return false;
  if (t.when === "week") return t.week === monday;
  return t.when === "all" || (t.when === "in") === inSeason;
}
/** Whether a line takes hours in a period (in season or out), counting this week's one-time lines in the period it falls in. */
export function inPeriod(t: RoomTask, inSeason: boolean, monday: ISODate, nowInSeason: boolean): boolean {
  if (TASKS[t.kind].season && !inSeason) return false;
  if (t.when === "week") return t.week === monday && inSeason === nowInSeason;
  return t.when === "all" || (t.when === "in") === inSeason;
}

export interface RoomCtx {
  inSeason: boolean; monday: ISODate;
  caps: Record<Seat, number>;
  /** The prospects in an upkeep group this week. */
  group: (key: string) => number[];
}
export interface RoomWeek {
  /** Hours each seat's running lines ask for, and the share of them it can give (1 unless it is over its week). */
  used: Record<Seat, number>; scale: Record<Seat, number>;
  /** Hours by area, as given, and the coaches' own recruiting hours (without the recruiting staff). */
  area: Record<RoomArea, number>; coachRecruiting: number;
  /** Hours each line gives, by line id. */
  given: Map<number, number>;
  /** Weekly contact hours on each prospect (contact lines and upkeep, MAX_CONTACT at most), and hours on each region. */
  contact: Map<number, number>; regions: Map<Region, number>;
  /** Hours on trips and regions (what scouting trips and region work draw on). */
  fieldwork: number;
}

/** The week the room's lines make: what each seat gives, the split by area, contact by prospect and region hours. */
export function roomWeek(room: StaffRoom, ctx: RoomCtx): RoomWeek {
  const used = {} as Record<Seat, number>, scale = {} as Record<Seat, number>;
  const area: Record<RoomArea, number> = { recruiting: 0, scouting: 0, prep: 0, opponent: 0, develop: 0 };
  const given = new Map<number, number>(), contact = new Map<number, number>(), regions = new Map<Region, number>();
  let fieldwork = 0, coachRecruiting = 0;
  // Prospects with a contact line of their own aren't on the rest-of-the-board upkeep.
  const own = new Set<number>();
  for (const seat of SEATS) for (const t of room.tasks[seat]) if (t.kind === "contact" && runs(t, ctx.inSeason, ctx.monday)) own.add(Number(t.target));
  const add = (pid: number, h: number) => contact.set(pid, (contact.get(pid) ?? 0) + h);
  for (const seat of SEATS) {
    const live = room.tasks[seat].filter((t) => runs(t, ctx.inSeason, ctx.monday));
    used[seat] = live.reduce((a, t) => a + t.hours, 0);
    scale[seat] = used[seat] > ctx.caps[seat] ? ctx.caps[seat] / used[seat] : 1;
    for (const t of live) {
      const g = t.hours * scale[seat];
      given.set(t.id, g);
      area[TASKS[t.kind].area] += g;
      if (seat !== "staff" && TASKS[t.kind].area === "recruiting") coachRecruiting += g;
      if (t.kind === "contact") add(Number(t.target), g);
      if (t.kind === "upkeep") {
        const who = ctx.group(t.target ?? "").filter((pid) => t.target !== "board" || !own.has(pid));
        for (const pid of who) add(pid, g / who.length);
      }
      if (t.kind === "region") { regions.set(t.target as Region, (regions.get(t.target as Region) ?? 0) + g); fieldwork += g; }
      if (t.kind === "trip") fieldwork += g;
    }
  }
  for (const [pid, h] of contact) contact.set(pid, Math.min(MAX_CONTACT, Math.round(h * 10) / 10));
  for (const [r, h] of regions) regions.set(r, Math.min(60, Math.round(h * 10) / 10));
  return { used, scale, area, coachRecruiting, given, contact, regions, fieldwork: Math.round(fieldwork * 10) / 10 };
}

/**
 * The skill behind an area's hours: each coach's own skill, weighed by the hours he gives it (`others` for
 * the recruiting staff, and when nobody gives it any).
 */
export function roomSkill(room: StaffRoom, week: RoomWeek, kinds: TaskKind[], skill: Skill, of: (seat: Seat) => number | null, others: number): number {
  let s = 0, w = 0;
  for (const seat of SEATS) for (const t of room.tasks[seat]) {
    const g = week.given.get(t.id);
    if (!g || !kinds.includes(t.kind) || TASKS[t.kind].skill !== skill) continue;
    s += g * (of(seat) ?? others); w += g;
  }
  return w ? s / w : others;
}

/**
 * What a recruit keeps of his relationship with you when his lead recruiter leaves your staff (fired, hired
 * away in the carousel): the bond was with the coach. A judgment call; real recruits often reopen their
 * recruitment when their recruiter leaves, and the program keeps most of what the staff built together.
 */
export const LEAD_KEEP = 0.75;

/** Which coordinator recruits a position by default (the head coach takes the best prospects first). */
export function positionSeat(pos: string): Seat {
  if (["QB", "RB", "WR", "TE", "OL"].includes(pos)) return "OC";
  if (["K", "P", "LS"].includes(pos)) return "STC";
  return "DC";
}

/** A change in your staff room (the `staff_room` action). */
export type RoomOp =
  | { op: "open" }
  | { op: "add"; seat: Seat; kind: TaskKind; target?: string; hours?: number; when?: When; trips?: number }
  | { op: "set"; id: number; hours: number }
  | { op: "when"; id: number; when: When }
  | { op: "move"; id: number; seat: Seat }
  | { op: "remove"; id: number }
  | { op: "tray"; kind: TrayItem["kind"]; key: string; on: boolean }
  | { op: "fill" };
