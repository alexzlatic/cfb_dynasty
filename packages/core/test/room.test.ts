import { describe, expect, it } from "vitest";
import { loadSeed } from "../src/seed.ts";
import { Season } from "../src/season.ts";
import { LEAD_KEEP, SEATS, roomWeek, type RoomTask, type StaffRoom } from "../src/room.ts";
import { VISIT_HOURS } from "../src/pitch.ts";
import { MAX_CONTACT } from "../src/recruiting.ts";

const seed = loadSeed();
const iowa = seed.teams.find((t) => t.school === "Iowa")!;
const fresh = () => {
  const s = Season.create(seed, { seed: 7, user_team_id: iowa.id, settings: { keep_pbp: "none" } as never });
  while (s.state.date < "2026-09-01") s.advanceDay();
  return s;
};
const lines = (s: Season) => SEATS.flatMap((seat) => s.roomOf()!.tasks[seat].map((t) => ({ seat, t })));
/** Frees hours on a coach's in-season week by taking them off his recruiting lines. */
const free = (s: Season, seat: "HC" | "OC" | "DC" | "STC", h: number) => {
  for (const t of [...s.roomOf()!.tasks[seat]].filter((x) => (x.kind === "contact" || x.kind === "upkeep") && x.when !== "off").sort((a, b) => b.hours - a.hours)) {
    if (h <= 0) return;
    const take = Math.min(h, t.hours);
    s.roomAction(take >= t.hours ? { op: "remove", id: t.id } : { op: "set", id: t.id, hours: t.hours - take });
    h -= take;
  }
};

describe("the staff room", () => {
  it("opens from the week you have, giving the same hours", () => {
    const s = fresh(), st = s.state.recruiting!;
    // A few prospects with contact hours and a region, set the old way.
    const board = st.prospects.filter((p) => p.svc && !p.commit && p.cls === s.state.year + 1).slice(0, 4);
    for (const p of board) s.setRecruitHours(p.id, 6);
    s.setRegionHours("midwest", 4);
    const before = { split: s.userSplit(true), prep: s.prepFactor(), pace: s.labPace(), total: s.recruitLedger().total, hours: { ...st.user.hours } };
    s.roomAction({ op: "open" });
    const after = s.userSplit(true);
    for (const k of ["recruiting", "scouting", "prep", "develop", "opponent"] as const) expect(after[k]).toBeCloseTo(before.split[k], 1);
    expect(s.prepFactor()).toBeCloseTo(before.prep, 1);
    expect(s.labPace()).toBeCloseTo(before.pace, 1);
    // Every hour the staff had is on a line: 4 coaches at 40 and 3 staffers at 16, and recruiting keeps its 96.
    const w = s.roomWeekAt()!;
    expect(Object.values(w.used).reduce((a, b) => a + b, 0)).toBeCloseTo(160 + 48, 0);
    expect(s.recruitLedger().total).toBeCloseTo(before.total, 0);
    // The prospects you recruited keep their hours, each on a coach's line, and the region keeps its hours.
    for (const p of board) expect(st.user.hours[p.id]).toBeGreaterThanOrEqual(before.hours[p.id]);
    expect(st.user.region_hours?.midwest).toBe(4);
    for (const p of board) expect(lines(s).find((x) => x.t.kind === "contact" && x.t.target === String(p.id))!.seat).not.toBe("staff");
    // The old split can't be set any more.
    expect(() => s.setStaffTime({ recruiting: 0.5, scouting: 0.1, prep: 0.2, opponent: 0.2 })).toThrow(/staff room/);
  });

  it("keeps each coach to his week and each job to the people who can do it", () => {
    const s = fresh();
    s.roomAction({ op: "open" });
    const st = s.state.recruiting!, room = s.roomOf()!;
    const p = st.prospects.find((x) => x.svc && !x.commit && x.cls === s.state.year + 1 && !st.user.hours[x.id] && !x.interest[iowa.id])!;
    expect(() => s.roomAction({ op: "add", seat: "staff", kind: "practice" })).toThrow(/staffers can't/);
    expect(() => s.roomAction({ op: "add", seat: "OC", kind: "home", target: String(p.id) })).toThrow(/head coach/);
    // The offensive coordinator's week is full; a new line needs hours freed first.
    expect(() => s.roomAction({ op: "add", seat: "OC", kind: "contact", target: String(p.id), hours: 6 })).toThrow(/hours left in season/);
    free(s, "OC", 6);
    s.roomAction({ op: "add", seat: "OC", kind: "contact", target: String(p.id), hours: 6 });
    expect(st.user.hours[p.id]).toBe(6);
    expect(() => s.roomAction({ op: "add", seat: "staff", kind: "contact", target: String(p.id), hours: 6 })).toThrow(new RegExp(`up to ${MAX_CONTACT}`));
    // Practice is in-season work only.
    const prac = room.tasks.OC.find((t) => t.kind === "practice")!;
    expect(() => s.roomAction({ op: "when", id: prac.id, when: "off" })).toThrow(/in-season/);
    // Removing his only line sends him back to wait for a coach.
    const line = room.tasks.OC.find((t) => t.kind === "contact" && t.target === String(p.id))!;
    s.roomAction({ op: "remove", id: line.id });
    expect(st.user.hours[p.id] ?? 0).toBeLessThan(6);
    expect(s.roomOf()!.tray).toContainEqual({ kind: "prospect", key: String(p.id) });
  });

  it("puts a visit on the coaches who make it, for that week only", () => {
    const s = fresh();
    s.roomAction({ op: "open" });
    const st = s.state.recruiting!, room = s.roomOf()!;
    const p = st.prospects.find((x) => x.svc && !x.commit && x.cls === s.state.year + 1)!;
    // Free some of the defensive coordinator's and head coach's hours, then host an official visit.
    free(s, "DC", 10); free(s, "HC", 10);
    const spend = st.user.spend;
    s.roomAction({ op: "add", seat: "DC", kind: "official", target: String(p.id) });
    expect(st.user.spend).toBeGreaterThan(spend);
    expect(room.tasks.DC.find((t) => t.kind === "official")!.hours).toBe(VISIT_HOURS.official - VISIT_HOURS.official_hc);
    expect(room.tasks.HC.find((t) => t.kind === "official")!.hours).toBe(VISIT_HOURS.official_hc);
    expect(() => s.roomAction({ op: "remove", id: room.tasks.DC.find((t) => t.kind === "official")!.id })).toThrow(/booked/);
    // Next Monday the visit lines are gone.
    const day = () => new Date(s.state.date + "T12:00:00Z").getUTCDay();
    while (day() !== 1) s.advanceDay();
    s.advanceDay();
    expect(lines(s).some((x) => x.t.kind === "official")).toBe(false);
  });

  it("spreads an upkeep line over its group, so new commits join it", () => {
    const room: StaffRoom = { tasks: { HC: [], OC: [], DC: [], STC: [], staff: [{ id: 1, kind: "upkeep", target: "commits", hours: 12, when: "all" } as RoomTask] }, tray: [], next: 2 };
    const ctx = (group: number[]) => ({ inSeason: true, monday: "2026-09-07", caps: { HC: 40, OC: 40, DC: 40, STC: 40, staff: 48 }, group: () => group });
    expect([...roomWeek(room, ctx([1, 2, 3])).contact.values()]).toEqual([4, 4, 4]);
    expect([...roomWeek(room, ctx([1, 2, 3, 4])).contact.values()]).toEqual([3, 3, 3, 3]);
    // A seat over its week gives what it has, in proportion.
    room.tasks.staff[0].hours = 96;
    expect(roomWeek(room, ctx([1])).given.get(1)).toBe(48);
  });

  it("takes recruiting time from the pitch page and scouting trips through the room", () => {
    const s = fresh();
    s.roomAction({ op: "open" });
    const st = s.state.recruiting!;
    const p = st.prospects.find((x) => x.svc && !x.commit && x.cls === s.state.year + 1 && x.pos === "LB" && !st.user.hours[x.id])!;
    s.roomAction({ op: "fill" });
    free(s, "DC", 8);
    s.setRecruitHours(p.id, 8);
    expect(lines(s).find((x) => x.t.kind === "contact" && x.t.target === String(p.id))!.seat).toBe("DC");
    s.setRecruitHours(p.id, 0);
    expect(st.user.hours[p.id] ?? 0).toBe(0);
    const before = s.scoutHours();
    s.roomAction({ op: "set", id: lines(s).find((x) => x.seat === "STC" && x.t.kind === "practice")!.t.id, hours: 1 });
    s.setScoutTarget(p.id, true, 2);
    expect(st.user.scout).toContain(p.id);
    expect(s.scoutHours()).toBeGreaterThan(before);
    s.setScoutTarget(p.id, false);
    expect(st.user.scout).not.toContain(p.id);
    expect(lines(s).some((x) => x.t.kind === "trip" && x.t.target === String(p.id))).toBe(false);
  });

  it("costs a recruit some of his relationship when his lead recruiter leaves, and an open job gives no hours", () => {
    const run = (fire: boolean) => {
      const s = fresh();
      s.roomAction({ op: "open" });
      const st = s.state.recruiting!, me = iowa.id;
      const p = st.prospects.find((x) => x.svc && !x.commit && x.cls === s.state.year + 1 && ["QB", "WR", "OL"].includes(x.pos))!;
      free(s, "OC", 8);
      s.roomAction({ op: "add", seat: "OC", kind: "contact", target: String(p.id), hours: 8 });
      expect(s.roomOf()!.lead?.[p.id]).toBeTypeOf("number");
      p.interest[me] = 40;
      if (fire) { s.fireCoach("OC"); expect(s.roomWeekAt()!.used.OC).toBeGreaterThan(0); expect(s.roomWeekAt()!.scale.OC).toBe(0); }
      while (new Date(s.state.date + "T12:00:00Z").getUTCDay() !== 0) s.advanceDay();
      s.advanceDay();
      return { interest: p.interest[me], mail: !!s.state.inbox?.some((m) => m.category === "recruiting" && /feels? it/.test(m.subject)) };
    };
    const kept = run(false), lost = run(true);
    // A quarter of his 40 hours gone, and no contact from the empty seat this week.
    expect(lost.interest).toBeLessThan(kept.interest - 40 * (1 - LEAD_KEEP));
    expect(lost.mail).toBe(true);
    expect(kept.mail).toBe(false);
  });
});
