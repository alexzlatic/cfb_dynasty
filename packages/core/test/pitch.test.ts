import { describe, expect, it } from "vitest";
import { loadSeed } from "../src/seed.ts";
import { Season } from "../src/season.ts";
import { HEARD_HOURS, moneyPull, pointEffect, recruitValue } from "../src/pitch.ts";
import { persona, typicalPersona } from "../src/valuation.ts";

const seed = loadSeed();

describe("a pitch to one recruit", () => {
  const iowa = seed.teams.find((t) => t.school === "Iowa")!;
  const s = Season.create(seed, { seed: 7, user_team_id: iowa.id, settings: { keep_pbp: "none" } as never });
  const st = s.state.recruiting!;
  // A senior Iowa is in the picture for, still deciding.
  const p = st.prospects.filter((x) => x.svc && !x.commit && x.cls === s.state.year + 1)
    .find((x) => s.considering(x).some((c) => c.team === iowa.id && c.share > 0.02))!;
  const share = () => s.considering(p).find((c) => c.team === iowa.id)!.share;

  it("lands selling points by his priorities and your real strengths, once contact hours carry it", () => {
    const v = s.pitchView(p.id);
    // The best point for him by your staff's read helps; the worst one hurts.
    const best = [...v.points].sort((a, b) => b.effects[0] - a.effects[0])[0];
    const worst = [...v.points].sort((a, b) => a.effects[0] - b.effects[0])[0];
    expect(best.effects[0]).toBeGreaterThan(0);
    expect(worst.effects[0]).toBeLessThan(0);
    // Unheard until you've talked with him.
    p.interest[iowa.id] = 0;
    s.setPitchPoints(p.id, [best.key]);
    expect(p.pull?.[iowa.id] ?? 0).toBe(0);
    p.interest[iowa.id] = HEARD_HOURS;
    const before = share();
    s.setPitchPoints(p.id, [best.key]);
    expect(p.pull![iowa.id]).toBeGreaterThan(0);
    expect(share()).toBeGreaterThan(before);
    expect(() => s.setPitchPoints(p.id, ["playing", "winning", "home", "fit"])).toThrow(/at most 3/);
  });

  it("weighs a point by how much he cares (squared) and splits it across points", () => {
    expect(pointEffect(1, 1.7, 1)).toBeCloseTo(pointEffect(1, 1, 1) * 1.7 ** 2, 9);
    expect(pointEffect(1, 1, 2)).toBeCloseTo(pointEffect(1, 1, 1) / Math.SQRT2, 9);
    expect(pointEffect(-1, 1.7, 1)).toBeLessThan(pointEffect(-1, 1, 1));
  });

  it("adds visits, with limits and travel costs", () => {
    const spent = st.user.spend, was = p.pull![iowa.id];
    s.pitchVisit(p.id, "official");
    expect(p.pull![iowa.id]).toBeGreaterThan(was + 0.13);
    expect(() => s.pitchVisit(p.id, "official")).toThrow(/official visit/);
    s.pitchVisit(p.id, "coach");
    s.pitchVisit(p.id, "coach");
    expect(() => s.pitchVisit(p.id, "coach")).toThrow(/2 times/);
    expect(st.user.spend).toBeGreaterThan(spent);
  });

  it("negotiates NIL like a contract: he answers in a day or two, counters a lowball, and an agreed deal pulls him", () => {
    const value = recruitValue(p);
    s.pitchNil(p.id, Math.round(value * 0.3), 1);
    expect(() => s.pitchNil(p.id, value, 1)).toThrow(/hasn't answered/);
    for (let i = 0; i < 2; i++) s.advanceDay();
    const t = st.user.pitches![p.id].nil!;
    expect(t.status === "countered" || t.status === "done").toBe(true);
    if (t.status === "done") return;
    expect(t.counter).toBeGreaterThan(value * 0.3);
    const was = p.pull![iowa.id];
    s.pitchNil(p.id, t.counter!, 1);
    for (let i = 0; i < 2; i++) s.advanceDay();
    expect(st.user.pitches![p.id].nil!.status).toBe("agreed");
    expect(p.pull![iowa.id]).toBeGreaterThanOrEqual(was);
    expect((s.state.inbox ?? []).some((m) => m.category === "recruiting" && /agrees to your NIL deal/.test(m.subject))).toBe(true);
    // It counts against next season's budget; pulling it costs you with him.
    expect(s.nextBudget(iowa.id).recruits).toBe(t.counter);
    s.pitchNil(p.id, 0, 1);
    expect(st.user.pitches![p.id].nil!.status).toBe("pulled");
    expect(s.nextBudget(iowa.id).recruits).toBe(0);
  }, 60_000);

  it("pays more pull to a money-first recruit, and nothing for a deal below what he expects", () => {
    const merc = typicalPersona("mercenary"), home = typicalPersona("homebody");
    const v = recruitValue(p);
    expect(moneyPull(p, merc, 2 * v, 1)).toBeGreaterThan(moneyPull(p, home, 2 * v, 1));
    expect(moneyPull(p, persona(7, p.id), 0.1 * v, 1)).toBe(0);
  });

  it("tracks offers and NIL by class and position", () => {
    s.setOffer(p.id, true);
    const v = s.nilView();
    expect(v.available).toBe(true);
    if (!v.available) return;
    const row = v.recruits.find((r) => r.pid === p.id)!;
    expect(row.offered).toBe(true);
    expect(row.cls).toBe(s.state.year + 1);
    expect(v.roster.length).toBeGreaterThan(50);
  });
});
