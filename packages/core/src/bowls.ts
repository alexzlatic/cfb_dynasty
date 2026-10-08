import { addDays, nthWeekday, type ISODate } from "./dates.ts";

/**
 * A bowl and its conference tie-ins. Each side lists the conferences that fill it ([] = at-large).
 * Dates: early bowls are a fixed number of days after conference championship Saturday (`off`); the
 * holiday-week bowls keep their calendar date (`md`, January dates fall in the next year).
 */
export interface Bowl {
  name: string; venue: string; kickoff_et: string;
  off?: number; md?: string;
  sides: [string[], string[]];
}

const P = "Pac-12", MW = "Mountain West", MAC = "Mid-American", AAC = "American Athletic", CUSA = "Conference USA", SBC = "Sun Belt";
const IND = "FBS Independents";

/**
 * New Year's Six bowls in the order they choose. They host playoff games in the 12- and 4-team
 * formats; whichever ones the playoff leaves free are ordinary bowls with these tie-ins.
 */
export const NY6: Bowl[] = [
  { name: "Rose Bowl", venue: "Rose Bowl, Pasadena, CA", md: "01-01", kickoff_et: "17:00", sides: [["Big Ten"], ["Big 12", P]] },
  { name: "Sugar Bowl", venue: "Caesars Superdome, New Orleans, LA", md: "01-01", kickoff_et: "20:45", sides: [["SEC"], ["Big 12"]] },
  { name: "Orange Bowl", venue: "Hard Rock Stadium, Miami Gardens, FL", md: "12-31", kickoff_et: "19:30", sides: [["ACC"], ["SEC", "Big Ten", IND]] },
  { name: "Cotton Bowl", venue: "AT&T Stadium, Arlington, TX", md: "12-31", kickoff_et: "15:30", sides: [[], []] },
  { name: "Fiesta Bowl", venue: "State Farm Stadium, Glendale, AZ", md: "01-01", kickoff_et: "13:00", sides: [[], []] },
  { name: "Peach Bowl", venue: "Mercedes-Benz Stadium, Atlanta, GA", md: "12-31", kickoff_et: "12:00", sides: [[], []] },
];

/** Which New Year's Six bowls the playoff uses, by its number of rounds after any opening round. */
export function playoffBowls(mainRounds: number): Set<string> {
  const used = new Set<string>();
  if (mainRounds >= 2) used.add("Fiesta Bowl").add("Peach Bowl");
  if (mainRounds >= 3) used.add("Rose Bowl").add("Sugar Bowl").add("Orange Bowl").add("Cotton Bowl");
  return used;
}

/** The other 35 bowls of the 2025-26 slate (sponsor names dropped), roughly in the order conferences rank them. */
export const BOWLS: Bowl[] = [
  { name: "Citrus Bowl", venue: "Camping World Stadium, Orlando, FL", md: "12-31", kickoff_et: "15:00", sides: [["SEC"], ["Big Ten"]] },
  { name: "Alamo Bowl", venue: "Alamodome, San Antonio, TX", md: "12-30", kickoff_et: "21:00", sides: [["Big 12"], ["Big Ten"]] },
  { name: "ReliaQuest Bowl", venue: "Raymond James Stadium, Tampa, FL", md: "12-31", kickoff_et: "12:00", sides: [["SEC"], ["Big Ten"]] },
  { name: "Gator Bowl", venue: "EverBank Stadium, Jacksonville, FL", md: "12-27", kickoff_et: "19:30", sides: [["SEC"], ["ACC"]] },
  { name: "Holiday Bowl", venue: "Snapdragon Stadium, San Diego, CA", md: "01-02", kickoff_et: "20:00", sides: [["ACC"], ["Big 12"]] },
  { name: "Pop-Tarts Bowl", venue: "Camping World Stadium, Orlando, FL", md: "12-27", kickoff_et: "15:30", sides: [["ACC"], ["Big 12"]] },
  { name: "Texas Bowl", venue: "NRG Stadium, Houston, TX", md: "12-27", kickoff_et: "21:15", sides: [["SEC"], ["Big 12"]] },
  { name: "Music City Bowl", venue: "Nissan Stadium, Nashville, TN", md: "12-30", kickoff_et: "17:30", sides: [["SEC"], ["Big Ten"]] },
  { name: "Las Vegas Bowl", venue: "Allegiant Stadium, Las Vegas, NV", md: "12-31", kickoff_et: "15:30", sides: [["Big Ten", "SEC"], ["Big 12", P]] },
  { name: "Sun Bowl", venue: "Sun Bowl, El Paso, TX", md: "12-31", kickoff_et: "14:00", sides: [["ACC"], ["Big 12", P]] },
  { name: "Pinstripe Bowl", venue: "Yankee Stadium, Bronx, NY", md: "12-27", kickoff_et: "12:00", sides: [["ACC"], ["Big Ten"]] },
  { name: "Duke's Mayo Bowl", venue: "Bank of America Stadium, Charlotte, NC", md: "01-02", kickoff_et: "20:00", sides: [["ACC"], ["SEC"]] },
  { name: "Liberty Bowl", venue: "Simmons Bank Liberty Stadium, Memphis, TN", md: "01-02", kickoff_et: "16:30", sides: [["Big 12"], ["SEC"]] },
  { name: "Gasparilla Bowl", venue: "Raymond James Stadium, Tampa, FL", off: 13, kickoff_et: "14:30", sides: [["ACC", "SEC"], [AAC]] },
  { name: "Military Bowl", venue: "Navy-Marine Corps Memorial Stadium, Annapolis, MD", md: "12-27", kickoff_et: "11:00", sides: [["ACC"], [AAC]] },
  { name: "Birmingham Bowl", venue: "Protective Stadium, Birmingham, AL", md: "12-29", kickoff_et: "14:00", sides: [["SEC"], [AAC, SBC]] },
  { name: "Rate Bowl", venue: "Chase Field, Phoenix, AZ", md: "12-26", kickoff_et: "16:30", sides: [["Big Ten"], ["Big 12", MW]] },
  { name: "LA Bowl", venue: "SoFi Stadium, Inglewood, CA", off: 7, kickoff_et: "20:00", sides: [[MW, P], ["Big Ten", "Big 12"]] },
  { name: "Fenway Bowl", venue: "Fenway Park, Boston, MA", md: "12-27", kickoff_et: "14:15", sides: [[AAC], ["ACC", IND]] },
  { name: "Armed Forces Bowl", venue: "Amon G. Carter Stadium, Fort Worth, TX", md: "01-02", kickoff_et: "13:00", sides: [[AAC], ["Big 12", SBC]] },
  { name: "Boca Raton Bowl", venue: "FAU Stadium, Boca Raton, FL", md: "12-23", kickoff_et: "14:00", sides: [["ACC", AAC], [MAC]] },
  { name: "GameAbove Sports Bowl", venue: "Ford Field, Detroit, MI", md: "12-26", kickoff_et: "13:00", sides: [["Big Ten"], [MAC]] },
  { name: "Hawai'i Bowl", venue: "Clarence T.C. Ching Athletics Complex, Honolulu, HI", md: "12-24", kickoff_et: "20:00", sides: [[MW], ["ACC", AAC]] },
  { name: "First Responder Bowl", venue: "Gerald J. Ford Stadium, Dallas, TX", md: "12-26", kickoff_et: "20:00", sides: [[AAC], [CUSA]] },
  { name: "New Mexico Bowl", venue: "University Stadium, Albuquerque, NM", md: "12-27", kickoff_et: "17:45", sides: [[MW], [AAC, CUSA]] },
  { name: "Arizona Bowl", venue: "Arizona Stadium, Tucson, AZ", md: "12-27", kickoff_et: "16:30", sides: [[MW, P], [MAC]] },
  { name: "Famous Idaho Potato Bowl", venue: "Albertsons Stadium, Boise, ID", md: "12-22", kickoff_et: "14:00", sides: [[MW, P], [MAC]] },
  { name: "Frisco Bowl", venue: "Ford Center at The Star, Frisco, TX", md: "12-23", kickoff_et: "21:00", sides: [[MAC], [MW, P]] },
  { name: "Independence Bowl", venue: "Independence Stadium, Shreveport, LA", md: "12-30", kickoff_et: "14:00", sides: [[CUSA], [SBC]] },
  { name: "New Orleans Bowl", venue: "Caesars Superdome, New Orleans, LA", md: "12-23", kickoff_et: "17:30", sides: [[SBC], [CUSA]] },
  { name: "Cure Bowl", venue: "Camping World Stadium, Orlando, FL", off: 11, kickoff_et: "17:00", sides: [[AAC], [SBC]] },
  { name: "68 Ventures Bowl", venue: "Hancock Whitney Stadium, Mobile, AL", off: 11, kickoff_et: "20:30", sides: [[SBC], [MAC, CUSA]] },
  { name: "Salute to Veterans Bowl", venue: "Cramton Bowl, Montgomery, AL", off: 10, kickoff_et: "21:00", sides: [[SBC], [CUSA]] },
  { name: "Xbox Bowl", venue: "Ford Center at The Star, Frisco, TX", off: 12, kickoff_et: "21:00", sides: [[SBC], [CUSA]] },
  { name: "Myrtle Beach Bowl", venue: "Brooks Stadium, Conway, SC", off: 13, kickoff_et: "11:00", sides: [[MAC, SBC], [CUSA]] },
];

/** A bowl's date in the season that starts in `year`. */
export function bowlDate(b: Bowl, year: number): ISODate {
  if (b.off != null) return addDays(nthWeekday(year, 12, 6, 1), b.off);
  return `${b.md!.startsWith("01") ? year + 1 : year}-${b.md}`;
}

export interface BowlTeam {
  id: number; conference: string;
  /** No bowl on or before this date (a team still has a regular-season game to play). */
  busy_until: ISODate;
  /** Six wins (one may be over an FCS team) and a .500 record; others only fill bowls nobody else can. */
  eligible: boolean;
}

export interface BowlPick { bowl: Bowl; date: ISODate; home: number; away: number }

/**
 * Fill bowls from teams in order of desirability. In bowl order, each side takes the best available
 * team from its tie-in conferences (an at-large side takes the best available team); a second pass
 * fills sides no tie-in conference could, from anyone left, avoiding conference matchups and
 * rematches where possible, and only then dips into ineligible teams (best first, as the NCAA does with
 * 5-7 teams). Bowls left with an empty side are not played.
 */
export function selectBowls(bowls: { bowl: Bowl; date: ISODate }[], pool: BowlTeam[], played: Set<string>): BowlPick[] {
  const left = [...pool];
  const slots = bowls.map((b) => ({ ...b, teams: [null, null] as (BowlTeam | null)[] }));
  const pairKey = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`);
  const fits = (s: (typeof slots)[number], side: number, t: BowlTeam, strict: boolean) => {
    if (t.busy_until >= s.date) return false;
    const other = s.teams[1 - side];
    if (!other) return true;
    if (other.id === t.id) return false;
    return !strict || (other.conference !== t.conference && !played.has(pairKey(other.id, t.id)));
  };
  const take = (s: (typeof slots)[number], side: number, ok: (t: BowlTeam) => boolean) => {
    const i = left.findIndex(ok);
    if (i < 0) return;
    s.teams[side] = left[i];
    left.splice(i, 1);
  };
  for (const s of slots) {
    for (const side of [0, 1]) {
      const confs = s.bowl.sides[side];
      take(s, side, (t) => t.eligible && (confs.length === 0 || confs.includes(t.conference)) && fits(s, side, t, true));
      // An at-large bowl would rather take a conference matchup or rematch than strand the team it has.
      if (!s.teams[side] && confs.length === 0) take(s, side, (t) => t.eligible && fits(s, side, t, false));
    }
  }
  for (const [strict, anyone] of [[true, false], [false, false], [true, true], [false, true]]) {
    for (const s of slots) for (const side of [0, 1]) if (!s.teams[side]) take(s, side, (t) => (anyone || t.eligible) && fits(s, side, t, strict));
  }
  // Teams left alone in a bowl move up to the best bowl that is also missing a team.
  const lone = slots.filter((s) => (s.teams[0] == null) !== (s.teams[1] == null));
  while (lone.length >= 2) {
    const hi = lone.shift()!, lo = lone.pop()!;
    const t = lo.teams[0] ?? lo.teams[1];
    if (t!.busy_until >= hi.date) { lone.unshift(hi); continue; }
    lo.teams = [null, null];
    hi.teams[hi.teams[0] ? 1 : 0] = t;
  }
  return slots.filter((s) => s.teams[0] && s.teams[1]).map((s) => ({ bowl: s.bowl, date: s.date, home: s.teams[0]!.id, away: s.teams[1]!.id }));
}
