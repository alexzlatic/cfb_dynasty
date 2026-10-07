/** Calendar dates are ISO strings (YYYY-MM-DD), compared as strings and stepped in UTC. */
export type ISODate = string;

const toDate = (d: ISODate) => new Date(d + "T12:00:00Z");
const fromDate = (d: Date): ISODate => d.toISOString().slice(0, 10);

export function addDays(d: ISODate, n: number): ISODate {
  const x = toDate(d);
  x.setUTCDate(x.getUTCDate() + n);
  return fromDate(x);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(d: ISODate): number {
  return toDate(d).getUTCDay();
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000);
}

/** The nth (1-based) given weekday of a month, e.g. nthWeekday(2026, 12, 6, 1) = first Saturday of Dec 2026. */
export function nthWeekday(year: number, month: number, wd: number, n: number): ISODate {
  let d = `${year}-${String(month).padStart(2, "0")}-01`;
  while (weekday(d) !== wd) d = addDays(d, 1);
  return addDays(d, 7 * (n - 1));
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatDate(d: ISODate, withYear = true): string {
  const x = toDate(d);
  return `${DAYS[x.getUTCDay()]}, ${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}${withYear ? ", " + x.getUTCFullYear() : ""}`;
}
