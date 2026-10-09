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
