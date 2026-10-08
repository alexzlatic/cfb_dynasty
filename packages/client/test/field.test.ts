import { describe, expect, it } from "vitest";
import { LiveGame, Season, loadSeed, runSim } from "@cfb/core";
import { build } from "../src/screens/Field.tsx";

const seed = loadSeed();

describe("field animation", () => {
  it("every play of a few full games draws on the field", () => {
    const neb = seed.teams.find((t) => t.school === "Nebraska")!.id;
    const s = Season.create(seed, { seed: 5, user_team_id: neb });
    const kinds = new Set<string>();
    for (let week = 0; week < 3; week++) {
      runSim(s, { kind: "my_next_game" });
      const g = s.state.games.find((x) => x.date === s.state.date && (x.home_id === neb || x.away_id === neb))!;
      const live = new LiveGame(s, g, { offense: "coordinator", defense: "coordinator" });
      live.advance(null, true);
      const plays = live.view().plays;
      const qbs = new Set(plays.map((p) => /^(.+?) (?:pass |sacked|scrambles)/.exec(p.description)?.[1]).filter((x): x is string => !!x));
      for (const p of plays) {
        const a = build(p, qbs);
        if (!a) continue;
        kinds.add(p.play_type);
        for (const path of [...a.off, ...a.def, a.ball]) {
          for (const [t, x, y] of path) {
            expect(t >= 0 && t <= 1, p.description).toBe(true);
            expect(x >= -6 && x <= 126, `${p.description}: x ${x}`).toBe(true);
            expect(y >= 0 && y <= 160 / 3, `${p.description}: y ${y}`).toBe(true);
          }
        }
        expect(a.off.length + a.def.length).toBe(22);
      }
      s.setCalls(g.id, live.calls);
      s.advanceDay();
    }
    expect([...kinds].sort()).toEqual(expect.arrayContaining(["FG", "KICKOFF", "PASS", "PAT", "PUNT", "RUN"]));
  });
});
