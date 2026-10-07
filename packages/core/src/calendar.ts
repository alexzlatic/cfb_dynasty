import { addDays, nthWeekday, weekday, type ISODate } from "./dates.ts";
import { mainRounds } from "./playoff.ts";
import type { CalEvent, EventType, PlayoffSettings, ScheduledGame } from "./types.ts";

interface Rule {
  type: EventType;
  label: string;
  /** Dates for a season that starts in `year` (the fall). */
  dates: (year: number, ctx: { lastRegular: ISODate }) => { date: ISODate; end?: ISODate }[];
  approx?: boolean;
  active?: boolean;
}

const sundays = (from: ISODate, to: ISODate) => {
  const out: { date: ISODate }[] = [];
  let d = from;
  while (weekday(d) !== 0) d = addDays(d, 1);
  for (; d <= to; d = addDays(d, 7)) out.push({ date: d });
  return out;
};

/**
 * Recurring rules that create each season's dated events (M0 spec, "Default 2026-27 calendar").
 * Events for systems built in later milestones are on the calendar but inactive.
 */
export const RULES: Rule[] = [
  { type: "ap_poll", label: "AP poll", active: true, dates: (y, c) => sundays(`${y}-08-30`, addDays(c.lastRegular, 8)) },
  { type: "early_signing", label: "Early signing period", dates: (y) => { const d = nthWeekday(y, 12, 3, 1); return [{ date: d, end: addDays(d, 2) }]; } },
  { type: "conf_championships", label: "Conference championships", active: true, dates: (y) => [{ date: nthWeekday(y, 12, 6, 1) }] },
  { type: "bowls", label: "Bowl season", approx: true, dates: (y) => [{ date: `${y}-12-19`, end: `${y + 1}-01-04` }] },
  { type: "portal_window", label: "Transfer portal window", dates: (y) => [{ date: `${y + 1}-01-02`, end: `${y + 1}-01-16` }] },
  { type: "draft_deadline", label: "NFL draft declaration deadline", approx: true, dates: (y) => [{ date: `${y + 1}-01-15` }] },
  { type: "season_end", label: "Season complete", active: true, dates: (y) => [{ date: `${y + 1}-01-26` }] },
  { type: "spring_practice", label: "Spring practice", dates: (y) => [{ date: `${y + 1}-03-01`, end: `${y + 1}-04-25` }] },
  { type: "nfl_draft", label: "NFL draft", approx: true, dates: (y) => [{ date: nthWeekday(y + 1, 4, 4, 4), end: addDays(nthWeekday(y + 1, 4, 4, 4), 2) }] },
  { type: "cap_year", label: "Revenue-share cap year begins", dates: (y) => [{ date: `${y + 1}-07-01` }] },
  { type: "fall_camp", label: "Fall camp opens", dates: (y) => [{ date: nthWeekday(y + 1, 8, 1, 1) }] },
];

/** Postseason round dates counted back from the title game (approx. until the real calendar is set). */
const ROUND_DATES = (y: number): { date: ISODate; end?: ISODate }[] => [
  { date: `${y + 1}-01-25` }, { date: `${y + 1}-01-08`, end: `${y + 1}-01-09` }, { date: `${y}-12-31`, end: `${y + 1}-01-01` },
  { date: `${y}-12-18`, end: `${y}-12-19` }, { date: `${y}-12-11`, end: `${y}-12-12` },
];

/** Rankings, selection and round events for the chosen postseason format. */
export function postseasonEvents(year: number, p: PlayoffSettings): CalEvent[] {
  const mk = (type: EventType, label: string, date: ISODate, end: ISODate | null, extra: Partial<CalEvent> = {}): CalEvent => ({
    id: `${year}:${type}:${date}`, date, end_date: end, type, scope: "league", label, status: "upcoming", needs_you: false,
    approx: true, active: true, ...extra,
  });
  const champDay = nthWeekday(year, 12, 6, 1);
  const out: CalEvent[] = [];
  if (p.format === "playoff") {
    for (let d = nthWeekday(year, 11, 2, 1); d < champDay; d = addDays(d, 7)) out.push(mk("cfp_rankings", "CFP rankings", d, null));
    out.push(mk("selection", `Selection day: ${p.teams}-team playoff`, addDays(champDay, 1), null, { approx: false }));
    const rounds = (p.byes > 0 ? 1 : 0) + mainRounds(p.teams, p.byes);
    const names = ["National championship", "Playoff semifinals", "Playoff quarterfinals", "Playoff second round", "Playoff first round"];
    for (let r = 0; r < rounds; r++) {
      const { date, end } = ROUND_DATES(year)[r];
      const label = r === rounds - 1 && r >= 3 ? "Playoff first round" : names[r];
      out.push(mk(r === 0 ? "title_game" : "playoff_round", label, date, end ?? null, { rounds_from_end: r }));
    }
  } else if (p.format === "bcs") {
    for (let d = nthWeekday(year, 10, 0, 3); d <= addDays(champDay, 1); d = addDays(d, 7)) out.push(mk("bcs_standings", "BCS standings", d, null));
    out.push(mk("selection", "BCS selection", addDays(champDay, 1), null, { approx: false }));
    out.push(mk("title_game", "BCS National Championship", ROUND_DATES(year)[0].date, null, { rounds_from_end: 0 }));
  }
  return out;
}

/** Every dated event for the season starting `start` (dynasty start, game days, then the rules). */
export function seasonEvents(year: number, start: ISODate, schedule: ScheduledGame[], playoff: PlayoffSettings): CalEvent[] {
  const lastRegular = schedule.reduce((m, g) => (g.date > m ? g.date : m), start);
  const ev: CalEvent[] = [{
    id: `${year}:dynasty_start`, date: start, end_date: null, type: "dynasty_start", scope: "league",
    label: "Dynasty starts", status: "upcoming", needs_you: false, approx: false, active: true,
  }];
  const gameDays = new Map<ISODate, number>();
  for (const g of schedule) gameDays.set(g.date, (gameDays.get(g.date) || 0) + 1);
  for (const [date, n] of [...gameDays].sort()) {
    ev.push({ id: `${year}:game_day:${date}`, date, end_date: null, type: "game_day", scope: "league",
      label: `${n} game${n === 1 ? "" : "s"}`, status: "upcoming", needs_you: false, approx: false, active: true });
  }
  for (const r of RULES) {
    for (const { date, end } of r.dates(year, { lastRegular })) {
      ev.push({ id: `${year}:${r.type}:${date}`, date, end_date: end ?? null, type: r.type, scope: "league", label: r.label,
        status: "upcoming", needs_you: false, approx: !!r.approx, active: !!r.active });
    }
  }
  ev.push(...postseasonEvents(year, playoff));
  return sortEvents(ev);
}

export function sortEvents(ev: CalEvent[]): CalEvent[] {
  return ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
}
