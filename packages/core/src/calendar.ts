import { addDays, nthWeekday, weekday, type ISODate } from "./dates.ts";
import type { CalEvent, EventType, ScheduledGame } from "./types.ts";

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
  {
    type: "cfp_rankings", label: "CFP rankings", approx: true, active: true,
    dates: (y) => { const out = []; for (let d = nthWeekday(y, 11, 2, 1); d <= `${y}-12-01`; d = addDays(d, 7)) out.push({ date: d }); return out; },
  },
  { type: "early_signing", label: "Early signing period", dates: (y) => { const d = nthWeekday(y, 12, 3, 1); return [{ date: d, end: addDays(d, 2) }]; } },
  { type: "conf_championships", label: "Conference championships", active: true, dates: (y) => [{ date: nthWeekday(y, 12, 6, 1) }] },
  { type: "cfp_selection", label: "CFP selection", active: true, dates: (y) => [{ date: addDays(nthWeekday(y, 12, 6, 1), 1) }] },
  { type: "cfp_first_round", label: "CFP first round", approx: true, active: true, dates: (y) => [{ date: `${y}-12-18`, end: `${y}-12-19` }] },
  { type: "bowls", label: "Bowl season", approx: true, dates: (y) => [{ date: `${y}-12-19`, end: `${y + 1}-01-04` }] },
  { type: "cfp_quarterfinals", label: "CFP quarterfinals", approx: true, active: true, dates: (y) => [{ date: `${y}-12-31`, end: `${y + 1}-01-01` }] },
  { type: "portal_window", label: "Transfer portal window", dates: (y) => [{ date: `${y + 1}-01-02`, end: `${y + 1}-01-16` }] },
  { type: "cfp_semifinals", label: "CFP semifinals", approx: true, active: true, dates: (y) => [{ date: `${y + 1}-01-08`, end: `${y + 1}-01-09` }] },
  { type: "draft_deadline", label: "NFL draft declaration deadline", approx: true, dates: (y) => [{ date: `${y + 1}-01-15` }] },
  { type: "cfp_final", label: "CFP national championship", approx: true, active: true, dates: (y) => [{ date: `${y + 1}-01-25` }] },
  { type: "season_end", label: "Season complete", active: true, dates: (y) => [{ date: `${y + 1}-01-26` }] },
  { type: "spring_practice", label: "Spring practice", dates: (y) => [{ date: `${y + 1}-03-01`, end: `${y + 1}-04-25` }] },
  { type: "nfl_draft", label: "NFL draft", approx: true, dates: (y) => [{ date: nthWeekday(y + 1, 4, 4, 4), end: addDays(nthWeekday(y + 1, 4, 4, 4), 2) }] },
  { type: "cap_year", label: "Revenue-share cap year begins", dates: (y) => [{ date: `${y + 1}-07-01` }] },
  { type: "fall_camp", label: "Fall camp opens", dates: (y) => [{ date: nthWeekday(y + 1, 8, 1, 1) }] },
];

/** Every dated event for the season starting `start` (dynasty start, game days, then the rules). */
export function seasonEvents(year: number, start: ISODate, schedule: ScheduledGame[]): CalEvent[] {
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
  return ev.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : 1));
}
