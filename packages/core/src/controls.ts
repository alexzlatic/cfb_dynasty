import type { ISODate } from "./dates.ts";
import type { DayReport, Season } from "./season.ts";

export type SimCommand =
  | { kind: "day" }
  | { kind: "next_event" }
  | { kind: "my_next_game" }
  | { kind: "date"; date: ISODate }
  | { kind: "end_of_season" };

/** Whether the morning of `date` should stop a multi-day sim (your game days, plus the stop_on setting). */
export function stopsOn(season: Season, date: ISODate): boolean {
  const s = season.state;
  const mine = s.user_team_id != null && s.games.some((g) => g.date === date && g.status !== "final" && (g.home_id === s.user_team_id || g.away_id === s.user_team_id));
  return mine || s.events.some((e) => e.date === date && e.status !== "done" && s.settings.stop_on.includes(e.type));
}

/** Run a sim control. Always advances at least one day unless the season is over. */
export function runSim(season: Season, cmd: SimCommand, onDay?: (r: DayReport) => void): DayReport[] {
  const out: DayReport[] = [];
  const s = season.state;
  const step = () => { const r = season.advanceDay(); out.push(r); onDay?.(r); return r; };
  if (season.done) return out;
  const firstEventAfter = (d: ISODate) => s.events.find((e) => e.date > d && e.status !== "done")?.date ?? null;
  const target =
    cmd.kind === "day" ? null :
    cmd.kind === "next_event" ? firstEventAfter(s.date) :
    cmd.kind === "date" ? cmd.date : null;
  for (let guard = 0; guard < 800; guard++) {
    const r = step();
    if (r.stop || season.done || cmd.kind === "day") break;
    if (target && s.date >= target) break;
    if (cmd.kind === "my_next_game" && s.user_team_id != null && s.games.some((g) => g.date === s.date && g.status !== "final" && (g.home_id === s.user_team_id || g.away_id === s.user_team_id))) break;
    if (cmd.kind === "next_event" && stopsOn(season, s.date)) break;
  }
  return out;
}
