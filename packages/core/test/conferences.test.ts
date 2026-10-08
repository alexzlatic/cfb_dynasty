import { describe, expect, it } from "vitest";
import { Season, loadSeed, realConferences, runSim, validateSetup, type ConferenceDef, type ConferenceSetup } from "../src/index.ts";

const seed = loadSeed();
const id = (school: string) => seed.teams.find((t) => t.school === school)!.id;

/** The real conferences with Notre Dame in the Big Ten and a new eight-school power conference with a guaranteed playoff spot. */
function custom(): ConferenceSetup {
  const confs: ConferenceDef[] = structuredClone(realConferences(seed.teams, seed.schedule));
  const move = (school: string, to: string) => {
    const t = id(school);
    for (const c of confs) if (c.members.includes(t)) { c.members = c.members.filter((x) => x !== t); c.divisions = null; c.conf_games = Math.min(c.conf_games, c.members.length - 1); }
    confs.find((c) => c.name === to)!.members.push(t);
  };
  confs.push({ name: "Super League", tier: "power", members: [], divisions: null, title_game: true, conf_games: 7, cfp_bids: 1 });
  move("Notre Dame", "Big Ten");
  for (const s of ["Boise State", "Memphis", "Tulane", "South Florida", "UTSA", "James Madison", "Army", "Navy"]) move(s, "Super League");
  const tie_ins = { "Gator Bowl": [["SEC"], ["Super League"]] as [string[], string[]] };
  return { conferences: confs, tie_ins };
}

describe("conferences", () => {
  it("reads the real 2026 conferences from the seed", () => {
    const real = realConferences(seed.teams, seed.schedule);
    const by = Object.fromEntries(real.map((c) => [c.name, c]));
    expect(by["Big Ten"].members).toHaveLength(18);
    expect(by.SEC.tier).toBe("power");
    expect(by["Sun Belt"].divisions).not.toBeNull();
    expect(by["FBS Independents"].tier).toBe("independent");
    expect(validateSetup({ conferences: real }, seed.teams)).toBeNull();
  });

  it("keeps the real schedule when the conferences are the real ones", () => {
    const a = Season.create(seed, { seed: 5 });
    const b = Season.create(seed, { seed: 5, conferences: { conferences: realConferences(seed.teams, seed.schedule) } });
    expect(b.state.games.map((g) => g.id)).toEqual(a.state.games.map((g) => g.id));
  });

  it("rejects setups that can't be played", () => {
    const s = custom();
    const nd = s.conferences.find((c) => c.name === "Big Ten")!;
    expect(validateSetup({ conferences: s.conferences.filter((c) => c !== nd) }, seed.teams)).toMatch(/no conference/);
    expect(validateSetup(s, seed.teams, { pcsa: true })).toBeNull();
    nd.members.push(...s.conferences.find((c) => c.name === "SEC")!.members.splice(0, 3));
    expect(validateSetup(s, seed.teams, { pcsa: true })).toMatch(/caps conferences at 20/);
    expect(validateSetup({ conferences: realConferences(seed.teams, seed.schedule), tie_ins: { "Rose Bowl": [["Nope"], []] } }, seed.teams)).toMatch(/no conference called Nope/);
  });

  it("builds conference schedules for changed conferences and plays a season under them", () => {
    const setup = custom();
    const s = Season.create(seed, { seed: 9, conferences: setup });
    const nd = s.teamById.get(id("Notre Dame"))!;
    expect(nd.conference).toBe("Big Ten");
    expect(nd.power).toBe(true);
    expect(s.teamById.get(id("Boise State"))!.power).toBe(true);
    const reg = s.state.games.filter((g) => g.kind === "regular");
    const games = (t: number) => reg.filter((g) => g.home_id === t || g.away_id === t);
    for (const c of setup.conferences.filter((x) => x.name === "Big Ten" || x.name === "Super League")) {
      for (const m of c.members) {
        const gs = games(m);
        const conf = gs.filter((g) => g.conference_game);
        expect(conf.length, s.teamById.get(m)!.school).toBeGreaterThanOrEqual(c.conf_games - 1);
        expect(gs.length).toBeLessThanOrEqual(12);
        // Every conference game is against a member, at most once each, and never two games on one day.
        expect(conf.every((g) => c.members.includes(g.home_id === m ? g.away_id : g.home_id))).toBe(true);
        expect(new Set(conf.map((g) => (g.home_id === m ? g.away_id : g.home_id))).size).toBe(conf.length);
        expect(new Set(gs.map((g) => g.date)).size).toBe(gs.length);
      }
    }
    // Untouched conferences keep their real games.
    const sec = new Set(setup.conferences.find((c) => c.name === "SEC")!.members);
    const realSec = seed.schedule.filter((g) => g.conference_game && sec.has(g.home_id)).map((g) => g.id).sort();
    expect(reg.filter((g) => g.conference_game && sec.has(g.home_id)).map((g) => g.id).sort()).toEqual(realSec);
    expect(s.state.tie_ins!["Gator Bowl"]).toEqual([["SEC"], ["Super League"]]);

    runSim(s, { kind: "end_of_season" });
    expect(s.state.conf_champs["Super League"]).toBeDefined();
    expect(s.state.conf_champs["FBS Independents"]).toBeUndefined();
    const title = s.state.games.find((g) => g.kind === "conf_champ" && g.label === "Super League Championship")!;
    expect(title.neutral).toBe(true);
    // The guaranteed spot: the Super League's best team is in the field.
    const field = s.state.playoff!.field.map((f) => f.team_id);
    expect(field.some((t) => s.teamById.get(t)!.conference === "Super League")).toBe(true);
    expect(field).toHaveLength(12);
  });
});
