import { describe, expect, it } from "vitest";
import { AP_PANEL, BOWLS, NY6, Season, bracketOrder, generateWriters, loadSeed, openingPairs, runPoll, runSim, selectBowls, validatePlayoff, type Game, type PanelMemory } from "../src/index.ts";

const seed = loadSeed();

describe("bracket shapes", () => {
  it("matches the CFP's 12-team bracket", () => {
    expect(openingPairs(12, 4)).toEqual([[5, 12], [6, 11], [7, 10], [8, 9]]);
    expect(bracketOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
    expect(validatePlayoff({ format: "playoff", teams: 10, auto_bids: 5, byes: 0, campus_first_round: true })).toMatch(/field size/);
  });
});

describe("postseason formats", () => {
  const cases = [
    { name: "12-team playoff", playoff: {}, games: 11 },
    { name: "4-team playoff", playoff: { teams: 4, byes: 0, auto_bids: 0 }, games: 3 },
    { name: "16-team playoff", playoff: { teams: 16, byes: 0 }, games: 15 },
    { name: "24-team playoff", playoff: { teams: 24, byes: 8 }, games: 23 },
    { name: "BCS", playoff: { format: "bcs" }, games: 1 },
    { name: "bowls", playoff: { format: "bowls" }, games: 0 },
  ];
  for (const c of cases) {
    it(`${c.name}: plays the bracket and crowns one champion`, () => {
      const s = Season.create(seed, { seed: 3, settings: { playoff: c.playoff as never } });
      runSim(s, { kind: "end_of_season" });
      const po = s.state.games.filter((g) => g.kind === "playoff");
      expect(po).toHaveLength(c.games);
      expect(po.every((g) => g.status === "final")).toBe(true);
      expect(po.filter((g) => g.title)).toHaveLength(c.games ? 1 : 0);
      expect(s.state.champion).not.toBeNull();
      expect(s.latestPoll("ap")!.ranks[0].team_id).toBe(s.state.champion);
      // Bowls: every one played, no team in two postseason games, and no bowl both a playoff site and a bowl.
      const bowls = s.state.games.filter((g) => g.kind === "bowl");
      expect(bowls.length).toBeGreaterThan(30);
      expect(bowls.every((g) => g.status === "final" && g.neutral)).toBe(true);
      const post = [...bowls, ...po.filter((g) => g.round === 1)].flatMap((g) => [g.home_id, g.away_id]);
      expect(new Set(post).size).toBe(post.length);
      const names = [...bowls.map((g) => g.label), ...po.map((g) => g.venue).filter(Boolean)];
      expect(new Set(names).size).toBe(names.length);
    });
  }
  it("switching format before selection day rebuilds the postseason calendar", () => {
    const s = Season.create(seed, { seed: 4 });
    runSim(s, { kind: "date", date: "2026-10-15" });
    s.updateSettings({ playoff: { format: "bcs" } as never });
    expect(s.state.events.some((e) => e.type === "cfp_rankings" && e.status === "upcoming")).toBe(false);
    expect(s.state.events.some((e) => e.type === "bcs_standings")).toBe(true);
    runSim(s, { kind: "end_of_season" });
    expect(s.state.games.filter((g) => g.kind === "playoff")).toHaveLength(1);
    expect(() => s.updateSettings({ playoff: { format: "playoff" } as never })).toThrow(/next season/);
  });
});

describe("polls", () => {
  it("are voter ballots with disagreement, not a sort of strength", () => {
    const s = Season.create(seed, { seed: 8 });
    runSim(s, { kind: "date", date: "2026-10-12" });
    const ap = s.latestPoll("ap")!;
    expect(ap.voters).toBe(s.state.writers.length);
    // Identical ballots would give the k-th team exactly voters x (26 - k) points.
    expect(ap.ranks.slice(0, 25).some((r, i) => r.points !== ap.voters! * (25 - i))).toBe(true);
    const byPower = [...ap.ranks.slice(0, 25)].sort((a, b) => s.state.power[b.team_id] - s.state.power[a.team_id]);
    expect(byPower.map((r) => r.team_id)).not.toEqual(ap.ranks.slice(0, 25).map((r) => r.team_id));
    expect(s.state.news.filter((n) => n.kind === "story" && n.date === ap.date)).toHaveLength(s.state.writers.length);
  });
  it("an upset lands on the ballot the week it happens, and the unranked winner enters the poll", () => {
    const teams = [...seed.teams].sort((a, b) => a.id - b.id);
    const voters = generateWriters(seed.teams, seed.rosters, 3).map((w) => w.voter);
    const memory: PanelMemory = {}, games: Game[] = [];
    const vote = (date: string) => runPoll({ voters, date, type: "ap", teams, games, power: seed.power, preseason: seed.power,
      champs: new Set(), hfa: 2.5, seed: 3, spec: AP_PANEL, memory, biasScale: 1, noiseScale: 1 }).ranks.map((r) => r.team_id);
    const pre = vote("2026-08-30");
    const fcs = teams.filter((t) => t.level !== "fbs").map((t) => t.id);
    const fav = pre[7], dog = pre[34];
    const game = (w: number, home_id: number, away_id: number, home_score: number, away_score: number) => games.push({ id: games.length + 1,
      kind: "regular", week: w, date: `2026-09-${String(7 * w - 2).padStart(2, "0")}`, home_id, away_id, neutral: false, status: "final", home_score, away_score, overtime: false } as Game);
    // Everyone in the top 60 wins every week, except No. 8 losing at unranked No. 35 in week 4.
    const week = (w: number) => {
      pre.slice(0, 60).forEach((id, i) => { if (w !== 4 || (id !== fav && id !== dog)) game(w, id, fcs[(i + 7 * w) % fcs.length], 38, 10); });
      if (w === 4) game(w, dog, fav, 27, 20);
      return vote(`2026-09-${String(7 * w - 1).padStart(2, "0")}`);
    };
    const polls = [1, 2, 3, 4, 5].map(week);
    const at = (p: number[], id: number) => p.indexOf(id) + 1;
    expect(at(polls[3], fav) - at(polls[2], fav)).toBeGreaterThanOrEqual(8);
    expect(at(polls[4], fav) - at(polls[3], fav)).toBeLessThanOrEqual(2);
    expect(at(polls[3], dog)).toBeLessThanOrEqual(25);
  });
  it("a power-conference team has its own beat writer", () => {
    const s = Season.create(seed, { seed: 8 });
    const purdue = s.state.writers.find((w) => w.beat.kind === "team" && w.beat.team_id === 2509);
    expect(purdue?.voter.homer).toBeGreaterThan(0);
  });
});

describe("bowl selection", () => {
  const bowls = [...NY6, ...BOWLS].map((bowl) => ({ bowl, date: "2026-12-31" }));
  const team = (id: number, conference: string, eligible = true) => ({ id, conference, busy_until: "2026-12-05", eligible });
  it("fills tie-ins best first, then at-large, then ineligible teams only for bowls nobody else can fill", () => {
    const pool = [team(1, "Big Ten"), team(2, "SEC"), team(3, "Big 12"), team(4, "Big Ten"), team(5, "ACC"), team(6, "ACC", false)];
    const picks = selectBowls(bowls, pool, new Set());
    const rose = picks.find((p) => p.bowl.name === "Rose Bowl")!;
    expect([rose.home, rose.away]).toEqual([1, 3]);
    const sugar = picks.find((p) => p.bowl.name === "Sugar Bowl")!;
    expect(sugar.home).toBe(2);
    // Sugar's Big 12 side has no Big 12 team left, so it waits for the at-large pass, after Orange took its ACC team.
    expect(picks.find((p) => p.bowl.name === "Orange Bowl")!.home).toBe(5);
    expect(picks.flatMap((p) => [p.home, p.away]).sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("avoids conference matchups and rematches when it can, and skips teams still playing", () => {
    const pool = [team(1, "SEC"), team(2, "SEC"), team(3, "Big Ten"), { ...team(4, "Big Ten"), busy_until: "2027-01-01" }];
    const picks = selectBowls(bowls.filter((b) => b.bowl.sides[0].length === 0), pool, new Set(["1-3"]));
    expect(picks).toHaveLength(1);
    expect([picks[0].home, picks[0].away]).toEqual([1, 2]);
  });
});
