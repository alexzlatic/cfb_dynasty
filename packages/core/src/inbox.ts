import type { ISODate } from "./dates.ts";

/**
 * The user's inbox: messages meant for the coach running the user team, one place for everything that
 * needs reading or acting on (polls, awards, scout and opponent reports, injuries, contract answers, job
 * offers...). News is the public record of the league; a message is private to the user team.
 */
export type InboxCategory =
  | "polls" | "awards" | "scouting" | "opponent" | "injuries" | "contracts" | "recruiting" | "portal"
  | "staff" | "career" | "draft" | "games" | "league";

export const INBOX_CATEGORIES: { id: InboxCategory; label: string }[] = [
  { id: "contracts", label: "Contracts" }, { id: "injuries", label: "Injuries" }, { id: "opponent", label: "Opponent scouting" },
  { id: "scouting", label: "Scout reports" }, { id: "recruiting", label: "Recruiting" }, { id: "portal", label: "Transfer portal" },
  { id: "polls", label: "Polls" }, { id: "awards", label: "Awards" }, { id: "games", label: "Games" }, { id: "staff", label: "Staff" },
  { id: "career", label: "Career" }, { id: "draft", label: "NFL draft" }, { id: "league", label: "Around the league" },
];

/** Where a message's "open" button goes in the app (a client route, e.g. "player/123" or "retention"). */
export type InboxLink = { label: string; to: string };

export interface InboxMessage {
  id: string;
  date: ISODate;
  category: InboxCategory;
  /** Who it's from: "Your staff", "Athletic director", "AP", a player's name... */
  from: string;
  subject: string;
  body: string;
  team_ids: number[];
  /** Needs an answer or a decision from you. */
  urgent?: boolean;
  links?: InboxLink[];
  /** The news item it came from, if any. */
  news_id?: string;
}

/** What code posting a message gives: the season fills in the id, and the date when none is given. */
export type InboxPost = Omit<InboxMessage, "id" | "date" | "team_ids"> & { date?: ISODate; team_ids?: number[] };

/**
 * Which news reaches the user team's inbox, and under what: league-wide polls and awards always; most
 * else only when it involves the user team. Returns null for news that stays in the news feed only.
 */
export function newsToInbox(kind: string, team_ids: number[], me: number): { category: InboxCategory; from: string; links?: InboxLink[] } | null {
  const mine = team_ids.includes(me), league = team_ids.length === 0;
  switch (kind) {
    case "poll": return { category: "polls", from: "AP poll", links: [{ label: "Polls", to: "polls" }] };
    case "cfp": return { category: "polls", from: "CFP committee", links: [{ label: "Polls", to: "polls" }] };
    case "bcs": return { category: "polls", from: "BCS standings", links: [{ label: "Polls", to: "polls" }] };
    case "award": return { category: "awards", from: "Awards", links: [{ label: "Awards", to: "awards" }] };
    case "champion": case "selection": return { category: "league", from: "Around the league", links: [{ label: "Postseason", to: "postseason" }] };
    case "injury": return mine ? { category: "injuries", from: "Team trainer", links: [{ label: "Depth chart", to: `depth/${me}` }] } : null;
    case "retention": return mine ? { category: "contracts", from: "Retention", links: [{ label: "Retention", to: "retention" }] } : null;
    case "portal": return mine || league ? { category: "portal", from: "Transfer portal", links: [{ label: "Portal", to: "portal" }] } : null;
    case "recruiting": return mine ? { category: "recruiting", from: "Recruiting", links: [{ label: "Big board", to: "recruiting/board" }] } : null;
    case "draft": return mine || league ? { category: "draft", from: "NFL draft", links: [{ label: "NFL draft", to: "draft" }] } : null;
    case "staff": return mine ? { category: "staff", from: "Your staff", links: [{ label: "Development", to: "development" }] } : null;
    case "redshirt": return mine ? { category: "staff", from: "Your staff", links: [{ label: "Roster", to: `team/${me}` }] } : null;
    case "ad": return mine ? { category: "career", from: "Athletic director", links: [{ label: "Career", to: "career" }] } : null;
    case "career": case "coaching": return mine ? { category: "career", from: "Career", links: [{ label: "Career", to: "career" }] } : null;
    case "conf_champ": return mine ? { category: "games", from: "Conference office" } : null;
    case "conference": return mine ? { category: "league", from: "Conference office", links: [{ label: "Conferences", to: "conferences" }] } : null;
    case "offseason": return mine ? { category: "staff", from: "Your staff", links: [{ label: "Roster", to: `team/${me}` }] } : null;
    // Your own results come with a box score link from the game itself.
    default: return null;
  }
}

/** Messages that need an answer from you. */
export const URGENT_NEWS = /needs you|wants you|is shopping|turns down|won't sign|counter/i;
