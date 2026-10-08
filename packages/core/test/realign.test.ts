import { describe, expect, it } from "vitest";
import { SCHOOL_MEDIA, Season, loadSeed, realign, runSim, type ConferenceDef, type RealignInputs } from "../src/index.ts";

const seed = loadSeed();
const base = Season.create(seed, { seed: 3 });
const id = (school: string) => base.teams.find((t) => t.school === school)!.id;
const inputs = (over: Partial<RealignInputs> = {}): RealignInputs => ({
  year: 2026, conferences: base.state.conferences!, teams: base.teams, state: base.state.realign!, score: base.mediaScores(),
  solo: (t) => SCHOOL_MEDIA[t.school] ?? 2_000_000, mode: "market", pcsa: false, seed: 3, form: new Map(), ...over,
});
const confOf = (cs: ConferenceDef[], t: number) => cs.find((c) => c.members.includes(t))?.name;

describe("realignment", () => {
  it("starts every conference on its real TV deal", () => {
    const d = base.state.realign!.deals;
    expect(d["Big Ten"].per_school).toBe(42_000_000);
    expect(d["Sun Belt"].per_school).toBe(2_500_000);
    expect(base.teamById.get(id("Ohio State"))!.media).toBe(42_000_000);
    expect(base.state.realign!.fit.b).toBeGreaterThan(1);
  });

  it("market: an invitation is announced a year before the move", () => {
    let x = inputs();
    const seen: string[] = [];
    for (let y = 2026; y <= 2029; y++) {
      const out = realign({ ...x, year: y });
      seen.push(...out.news.map((n) => `${y} ${n[0]}`));
      x = { ...x, conferences: out.conferences, state: out.state };
    }
    const nd = id("Notre Dame");
    const ann = x.state.history.find((m) => m.team_id === nd)!;
    expect(ann).toMatchObject({ from: "FBS Independents", to: "Big Ten", reason: "invite" });
    expect(ann.effective - ann.announced).toBe(2);
    expect(confOf(x.conferences, nd)).toBe("Big Ten");
    expect(seen.some((s) => s.includes("Notre Dame will join the Big Ten"))).toBe(true);
  });

  it("market: a Group of Six school that keeps winning gets a power invitation", () => {
    const score = new Map(base.mediaScores());
    const boise = id("Boise State");
    score.set(boise, 3.0);
    let x = inputs({ score });
    for (let y = 2026; y <= 2031 && confOf(x.conferences, boise) === "Pac-12"; y++) {
      const out = realign({ ...x, year: y });
      x = { ...x, conferences: out.conferences, state: out.state };
    }
    const to = x.conferences.find((c) => c.members.includes(boise))!;
    expect(to.tier).toBe("power");
    expect(base.teamById.get(boise)!.power).toBe(false);
  });

  it("a conference that drops below eight schools folds and its schools find homes", () => {
    const st = structuredClone(base.state.realign!);
    const pac = base.state.conferences!.find((c) => c.name === "Pac-12")!;
    st.pending = [{ team_id: pac.members[0], from: "Pac-12", to: "Mountain West", announced: 2025, effective: 2027, fee: 0, reason: "invite" }];
    const out = realign(inputs({ state: st }));
    expect(out.folded).toEqual(["Pac-12"]);
    expect(out.conferences.some((c) => c.name === "Pac-12")).toBe(false);
    for (const m of pac.members) expect(confOf(out.conferences, m)).toBeDefined();
    expect(out.news.some((n) => n[0] === "The Pac-12 folds")).toBe(true);
  });

  it("promotion and relegation: the worst power school swaps with the best Group of Six school", () => {
    const form = new Map(base.teams.map((t) => [t.id, 0.5]));
    const sec = base.state.conferences!.find((c) => c.name === "SEC")!;
    form.set(sec.members[0], 0.1);
    form.set(id("Tulane"), 0.95);
    const out = realign(inputs({ mode: "promotion", form }));
    // Power conferences pick in name order, so the ACC takes the best school; the SEC's last place goes down.
    expect(confOf(out.conferences, id("Tulane"))).toBe("ACC");
    const down = out.state.history.find((m) => m.team_id === sec.members[0])!;
    expect(down).toMatchObject({ from: "SEC", reason: "relegation" });
    expect(out.conferences.find((c) => c.name === down.to)!.tier).toBe("group");
    // One swap per power conference, sizes unchanged.
    expect(out.state.history.filter((m) => m.reason === "promotion")).toHaveLength(4);
    for (const c of out.conferences) expect(c.members.length).toBe(base.state.conferences!.find((k) => k.name === c.name)!.members.length);
  });

  it("commissioner mode rewrites the conferences before the first game, with new schedules", () => {
    const off = Season.create(seed, { seed: 4 });
    const setup = { conferences: structuredClone(off.state.conferences!) };
    expect(() => off.setConferences(setup)).toThrow(/commissioner/);
    const s = Season.create(seed, { seed: 4, settings: { commissioner: true } });
    const nd = id("Notre Dame");
    for (const c of setup.conferences) c.members = c.members.filter((t) => t !== nd);
    setup.conferences.find((c) => c.name === "ACC")!.members.push(nd);
    s.setConferences(setup);
    expect(s.teamById.get(nd)!.conference).toBe("ACC");
    const ndConf = s.state.games.filter((g) => g.kind === "regular" && g.conference_game && (g.home_id === nd || g.away_id === nd));
    expect(ndConf.length).toBeGreaterThanOrEqual(8);
    expect(s.state.realign!.history.find((m) => m.team_id === nd)?.reason).toBe("commissioner");
  });

  it("promotion and relegation run at the rollover and the next season plays the new conferences", () => {
    const s = Season.create(seed, { seed: 6, settings: { realignment: "promotion" } });
    expect(() => s.updateSettings({ realignment: "market" })).toThrow(/when a league starts/);
    runSim(s, { kind: "end_of_season" });
    const { next } = s.nextSeason(seed.coaches);
    const moved = next.state.realign!.history.filter((m) => m.reason === "promotion");
    expect(moved).toHaveLength(4);
    for (const m of moved) {
      expect(next.teamById.get(m.team_id)!.conference).toBe(m.to);
      expect(next.teamById.get(m.team_id)!.power).toBe(true);
      const conf = next.state.games.filter((g) => g.conference_game && (g.home_id === m.team_id || g.away_id === m.team_id));
      expect(conf.every((g) => next.teamById.get(g.home_id === m.team_id ? g.away_id : g.home_id)!.conference === m.to)).toBe(true);
      expect(conf.length).toBeGreaterThanOrEqual(7);
    }
    expect(next.state.news.some((n) => n.kind === "conference" && /is promoted/.test(n.headline))).toBe(true);
  }, 240_000);
});
