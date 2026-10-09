import { addDays, daysBetween, type ISODate } from "./dates.ts";
import { playerValue } from "./money.ts";
import { arrivalOvr, starsOf, type Prospect, type School } from "./recruiting.ts";
import { miles, type Factor, type Persona } from "./valuation.ts";
import { askFor, maxYears, openingAsk, patienceOf, respond, roundPay } from "./portal.ts";

/**
 * Your pitch to one recruit (the Pitch page). On top of contact hours and a scholarship offer, a pitch is:
 *  - selling points: up to three things you tell him about your program. Each lands by how much he cares
 *    about it (his personality) and how your school really compares on it with the others he's considering;
 *    selling a weakness backfires, more so on something he cares about. It is only heard once you've put
 *    contact hours into him (HEARD_HOURS), so hours carry the pitch.
 *  - visits: an official visit to campus (juniors and seniors, once each) and the head coach in his living
 *    room (a few a week). Both cost travel money, count most right after, and fade over the months.
 *  - NIL: a deal for when he enrolls, negotiated like a contract (he answers in a day or two and names his
 *    number). An agreed deal pulls him by how much more it is than he'd expect (his value and your school's
 *    money), weighted by how much money matters to him. It comes out of your roster pool the year he arrives.
 * Everything adds one number to how much he likes your school: the "pull" the weekly recruiting reads.
 */

export type SellingPoint = "playing" | "development" | "winning" | "home" | "money" | "fit" | "culture";
export const SELLING_POINTS: { key: SellingPoint; factor: Factor; label: string; line: string }[] = [
  { key: "playing", factor: "playing", label: "Early playing time", line: "He can start early here" },
  { key: "development", factor: "development", label: "Player development", line: "Our staff and facilities make players" },
  { key: "winning", factor: "winning", label: "Winning", line: "Come compete for championships" },
  { key: "home", factor: "home", label: "Close to home", line: "Your family can see every home game" },
  { key: "money", factor: "money", label: "NIL and money", line: "Nobody will pay you better" },
  { key: "fit", factor: "fit", label: "Scheme fit", line: "Our system is built for your game" },
  { key: "culture", factor: "loyalty", label: "Family and culture", line: "A stable staff and a program on the rise, loyal to its players" },
];
export const MAX_POINTS = 3;
/** Contact hours before your staff knows what really matters to him (until then it reads his type). */
export const KNOW_HOURS = 30;
/** Contact hours before a pitch is fully heard (it lands in proportion until then). */
export const HEARD_HOURS = 15;
/** Each selling point's weight: strength (standard units against his other schools) x his care for it squared. */
const POINT_SCALE = 0.12;
/** The most selling points can add or take away. */
const POINT_CAP = 0.6;
/** Visits: an official visit is worth 0.14 to 0.3 by how the campus shows; a head coach visit 0.06 to 0.14 by the staff's recruiting skill; both fade with a 20-week half-life. */
const VISIT_HALF_LIFE = 20;
export const MAX_COACH_VISITS = 2;
/**
 * Hours a visit takes. A home visit is the head coach's own day on the road (near home or a flight away);
 * an official visit is a weekend on campus run by the staff, two hours of it the head coach's. Both come out
 * of the week's recruiting hours, so they leave fewer contact hours for your board.
 */
export const VISIT_HOURS = { coach_near: 6, coach_far: 10, official: 8, official_hc: 2 };
export const VISIT_COST = { official_near: 3_000, official_far: 8_000, coach_near: 1_500, coach_far: 4_000 };
/** What breaking your word on an agreed deal (or exhausting his patience) costs with him. */
const PULLED_PENALTY = 0.2, DONE_PENALTY = 0.1;
/** The most an NIL deal adds. */
const MONEY_CAP = 1.5;
/** A recruit's NIL value never runs below this (a deal still means something to him). */
const MIN_VALUE = 25_000;

export interface NilTalk {
  /** Dollars a year and seasons. */
  amount: number; years: number;
  status: "waiting" | "agreed" | "countered" | "done" | "pulled";
  made: ISODate; answer?: ISODate;
  /** His number (a year) after turning an offer down. */
  counter?: number;
  /** Rounds of talk left in him. */
  patience: number;
  /** The last deal he agreed to, kept while a new offer waits. */
  agreed?: { amount: number; years: number };
}

export interface Pitch {
  points: SellingPoint[];
  /** Official visit date. */
  visit?: ISODate;
  /** Head coach visits. */
  coach?: ISODate[];
  nil?: NilTalk;
}

/** A recruit's NIL value: what a player of his projected arrival overall and stars is worth a year (his hype counts). */
export function recruitValue(p: Prospect): number {
  const read = p.svc?.read ?? 68;
  return Math.max(MIN_VALUE, playerValue({ pos: p.pos, ovr: Math.round(arrivalOvr(read)), stars: p.svc ? starsOf(p.svc.r) : null, years: 0 }));
}

/** The money term a recruit's base score already gives a school (recruiting.ts baseScore): its budget, weighed less by lesser prospects. */
export const qualityScale = (p: Prospect) => Math.max(0, Math.min(1, ((p.svc ? (p.svc.r - 0.86) / 0.04 : -1.5) + 2) / 5));

/** How a school stands on each selling point, raw (bigger is better). */
export function pointRaw(t: School, p: Prospect, nilRatio = 0): Record<SellingPoint, number> {
  const read = p.svc?.read ?? 68, ovr = arrivalOvr(read) + 5, st = t.starter[p.pos] ?? 70;
  return {
    playing: 1 / (1 + Math.exp(-(ovr - st) / 4)),
    development: t.development,
    winning: 0.5 * t.prestige / 100 + 0.5 * t.win_pct + (t.power ? 0.1 : 0),
    home: -Math.log1p(miles(p.home, t) / 50) + (p.home.state === t.state ? 0.5 : 0),
    money: Math.log(Math.max(0.05, t.wealth, nilRatio) + 0.05),
    fit: t.fit,
    culture: t.buzz + 0.15 * Math.min(8, t.tenure ?? 2),
  };
}

/** The least spread a point is measured against, so schools that are nearly alike on it don't look miles apart. */
const SD_FLOOR: Record<SellingPoint, number> = { playing: 0.1, development: 0.2, winning: 0.08, home: 0.4, money: 0.25, fit: 0.1, culture: 0.3 };

/** Your school's strength on each point against the others he's considering (standard units, -2 to 2). */
export function pointStrengths(me: School, others: School[], p: Prospect, nilRatio = 0): Record<SellingPoint, number> {
  const mine = pointRaw(me, p, nilRatio), rest = others.map((t) => pointRaw(t, p));
  const out = {} as Record<SellingPoint, number>;
  for (const { key } of SELLING_POINTS) {
    const xs = [mine[key], ...rest.map((r) => r[key])];
    const m = xs.reduce((a, x) => a + x, 0) / xs.length;
    const sd = Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / xs.length);
    out[key] = Math.max(-2, Math.min(2, (mine[key] - m) / Math.max(sd, SD_FLOOR[key])));
  }
  return out;
}

/** What each selling point would add if chosen alongside `n` others in all (before contact hours carry it). */
export function pointEffect(strength: number, care: number, n: number): number {
  return POINT_SCALE * strength * care * care / Math.sqrt(Math.max(1, n));
}

const fade = (date: ISODate, today: ISODate) => Math.pow(0.5, Math.max(0, daysBetween(date, today)) / 7 / VISIT_HALF_LIFE);

/** An official visit's worth from how the campus shows (facilities and staff, and the program's standing). */
export const officialWorth = (t: School) => 0.22 + 0.08 * Math.max(-1, Math.min(1, t.development + (t.prestige - 60) / 40));
/** A head coach visit's worth from the staff's recruiting skill (0-100). */
export const coachWorth = (skill: number) => 0.1 * Math.max(0.6, Math.min(1.4, skill / 55));

/** An agreed NIL deal's pull: how much more it is than he'd expect from your school's money, weighted by how much money matters to him. */
export function moneyPull(p: Prospect, w: Persona, amount: number, wealth: number): number {
  const r = amount / recruitValue(p);
  const expected = qualityScale(p) * Math.log(Math.max(0.05, wealth) + 0.05);
  return Math.min(MONEY_CAP, w.money * Math.max(0, Math.log(Math.max(0.05, r) + 0.05) - expected));
}

export interface PullParts { points: number; heard: number; official: number; coach: number; nil: number; penalty: number; total: number }

/** Everything your pitch adds to his liking of your school today. */
export function pitchPull(o: { pitch: Pitch; p: Prospect; w: Persona; me: School; others: School[]; hours: number; today: ISODate; coachSkill: number }): PullParts {
  const { pitch, p, w, me, others, today } = o;
  const agreed = pitch.nil?.status === "agreed" ? pitch.nil : pitch.nil?.agreed;
  const value = recruitValue(p);
  const str = pointStrengths(me, others, p, agreed ? agreed.amount / value : 0);
  const n = pitch.points.length;
  let pts = 0;
  for (const k of pitch.points) { const f = SELLING_POINTS.find((x) => x.key === k)!.factor; pts += pointEffect(str[k], w[f], n); }
  pts = Math.max(-POINT_CAP, Math.min(POINT_CAP, pts));
  const heard = Math.min(1, o.hours / HEARD_HOURS);
  const official = pitch.visit ? officialWorth(me) * fade(pitch.visit, today) : 0;
  const coach = (pitch.coach ?? []).slice(-MAX_COACH_VISITS).reduce((a, d) => a + coachWorth(o.coachSkill) * fade(d, today), 0);
  const nil = agreed ? moneyPull(p, w, agreed.amount, me.wealth) : 0;
  const penalty = pitch.nil?.status === "pulled" ? -PULLED_PENALTY : pitch.nil?.status === "done" ? -DONE_PENALTY : 0;
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { points: r(pts * heard), heard: r(heard), official: r(official), coach: r(coach), nil: r(nil), penalty, total: r(pts * heard + official + coach + nil + penalty) };
}

/**
 * The least he'd sign an NIL deal with you for, a year: about his value, more for a money-first recruit,
 * less where you're his favorite and more where you're far down his list.
 */
export function nilWalk(p: Prospect, w: Persona, place: number | null): number {
  const like = place === 1 ? 0.85 : place != null && place <= 3 ? 1 : 1.15;
  return roundPay(recruitValue(p) * Math.max(0.5, 0.8 + 0.3 * (w.money - 1)) * like);
}

/** His answer to an NIL offer (see portal.ts respond): agreed at or above his number, else his counter, losing patience. */
export function nilAnswer(t: NilTalk, p: Prospect, w: Persona, place: number | null) {
  const walk = nilWalk(p, w, place);
  return respond({ ask: openingAsk(walk, w), walk, patience: t.patience, counter: t.counter }, t.amount, t.years, w);
}

export const nilYearsMax = (w: Persona) => Math.min(4, maxYears(w));
export { askFor, patienceOf };
/** When he answers an offer made today. */
export const answerDate = (today: ISODate, days: number) => addDays(today, days);
