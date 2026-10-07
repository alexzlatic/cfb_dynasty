import type { DriveRecord, PlayRecord, TeamBox, TeamRatings } from "@cfb/engine";
import type { ISODate } from "./dates.ts";

export type Level = "fbs" | "fcs";

export interface Venue {
  id: number | null; name: string | null; city: string | null; state: string | null; timezone: string | null;
  lat: number | null; lon: number | null; elevation_m: number | null; capacity: number | null;
  grass: boolean | null; dome: boolean | null; built: number | null;
}

export interface Team {
  id: number; school: string; mascot: string | null; abbr: string; conference: string; division: string | null;
  level: Level; color: string; alt_color: string; logo: string | null; logo_dark: string | null; venue: Venue;
  /** 0-100 brand pull with poll voters (2021-25 wins and 2022-26 recruiting). */
  prestige: number;
}

export interface Conference { id: number | null; name: string; short: string; abbr: string | null; level: string | null }

export interface Player {
  id: number | string; first: string; last: string; pos: string; class: string; jersey: number | null;
  height: number | null; weight: number | null;
  home: { city: string | null; state: string | null; lat: number | null; lon: number | null };
  recruit_ids: (string | number)[];
}

export interface Coach {
  team_id: number; role: "HC" | "OC" | "DC" | "STC"; first: string; last: string; hire_date: string | null;
  career: { year: number; team_id: number | null; school: string; wins: number; losses: number; ties: number }[];
  source: "cfbd" | "researched" | "generated"; source_url?: string | null; note?: string | null;
}

export interface ScheduledGame {
  id: number; week: number; date: ISODate; kickoff_et: string | null; home_id: number; away_id: number;
  neutral: boolean; conference_game: boolean; venue_id: number | null; venue: string | null; notes: string | null;
}

export type GameKind = "regular" | "conf_champ" | "playoff";

export interface Game {
  id: number; kind: GameKind; week: number; date: ISODate; kickoff_et: string | null;
  home_id: number; away_id: number; neutral: boolean; conference_game: boolean; venue: string | null; label: string | null;
  status: "scheduled" | "final";
  home_score: number | null; away_score: number | null; overtime: boolean;
  /** Playoff games: seeds, round (1 = first round played) and whether it decides the title. */
  home_seed?: number | null; away_seed?: number | null; round?: number; title?: boolean;
}

export interface GameDetail {
  game_id: number;
  home_box: TeamBox; away_box: TeamBox;
  home_players: Record<string, unknown>; away_players: Record<string, unknown>;
  home_q: number[]; away_q: number[];
  drives: DriveRecord[];
  plays: PlayRecord[] | null;
}

export type EventType =
  | "dynasty_start" | "game_day" | "ap_poll" | "cfp_rankings" | "bcs_standings" | "early_signing" | "conf_championships"
  | "selection" | "playoff_round" | "title_game" | "bowls"
  | "portal_window" | "draft_deadline" | "spring_practice" | "nfl_draft" | "cap_year" | "fall_camp" | "season_end";

export interface CalEvent {
  id: string; date: ISODate; end_date: ISODate | null; type: EventType; scope: "league" | "conference" | "team";
  label: string; status: "upcoming" | "done"; needs_you: boolean; approx: boolean;
  /** "M0" events run; later-milestone events show on the calendar and do nothing yet. */
  active: boolean;
  /** Playoff round events: rounds counted back from the title game (0 = title game). */
  rounds_from_end?: number;
}

export interface Poll {
  date: ISODate; type: "ap" | "coaches" | "cfp" | "bcs";
  ranks: { team_id: number; points: number; first?: number }[];
  voters?: number;
}

export interface NewsItem { id: string; date: ISODate; kind: string; headline: string; body: string; team_ids: number[]; author?: number | null }

/** One voter's top 25 for one poll. */
export interface Ballot { date: ISODate; poll: "ap"; writer_id: number; team_ids: number[] }

/**
 * How the season ends.
 *  playoff: a bracket of `teams` picked and seeded by the committee (current rules: 12 teams, 5 automatic
 *           bids for the highest-ranked conference champions, 4 byes, campus first round).
 *  bcs:     BCS standings (AP, coaches and a computer rating) send the top two to one title game.
 *  bowls:   no title game; the final AP poll names the champion (bowl games arrive in M1).
 */
export interface PlayoffSettings {
  format: "playoff" | "bcs" | "bowls";
  teams: number;
  auto_bids: number;
  byes: number;
  campus_first_round: boolean;
}

export interface Settings {
  playoff: PlayoffSettings;
  conf_title_games: boolean;
  home_field_points: number;
  /** 1 = voters as biased as real ones; 0 = no brand, recency, region or unbeaten bias. */
  poll_bias: number;
  /** 1 = normal ballot noise; 0 = every voter sees the same thing. */
  poll_noise: number;
  /** Event types that stop the sim. Your game days always stop "Sim to next event". */
  stop_on: EventType[];
  /** Keep full play-by-play for your games and for games between two ranked teams. */
  keep_pbp: "mine" | "mine_and_ranked" | "all";
}

export const DEFAULT_SETTINGS: Settings = {
  playoff: { format: "playoff", teams: 12, auto_bids: 5, byes: 4, campus_first_round: true },
  conf_title_games: true, home_field_points: 2.5, poll_bias: 1, poll_noise: 1,
  stop_on: ["season_end"], keep_pbp: "mine_and_ranked",
};

export interface SeedBundle {
  season: number;
  start_date: ISODate;
  teams: Team[];
  conferences: Conference[];
  rosters: Record<string, Player[]>;
  coaches: Coach[];
  schedule: ScheduledGame[];
  ratings: Record<string, { source: string; ratings: TeamRatings; points?: number }>;
  power: Record<string, number>;
}
