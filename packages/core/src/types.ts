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

export type GameKind = "regular" | "conf_champ" | "cfp_r1" | "cfp_qf" | "cfp_sf" | "cfp_final";

export interface Game {
  id: number; kind: GameKind; week: number; date: ISODate; kickoff_et: string | null;
  home_id: number; away_id: number; neutral: boolean; conference_game: boolean; venue: string | null; label: string | null;
  status: "scheduled" | "final";
  home_score: number | null; away_score: number | null; overtime: boolean;
  /** Seeds for playoff games, used to build the next round. */
  home_seed?: number | null; away_seed?: number | null;
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
  | "dynasty_start" | "game_day" | "ap_poll" | "cfp_rankings" | "early_signing" | "conf_championships"
  | "cfp_selection" | "cfp_first_round" | "cfp_quarterfinals" | "cfp_semifinals" | "cfp_final" | "bowls"
  | "portal_window" | "draft_deadline" | "spring_practice" | "nfl_draft" | "cap_year" | "fall_camp" | "season_end";

export interface CalEvent {
  id: string; date: ISODate; end_date: ISODate | null; type: EventType; scope: "league" | "conference" | "team";
  label: string; status: "upcoming" | "done"; needs_you: boolean; approx: boolean;
  /** "M0" events run; later-milestone events show on the calendar and do nothing yet. */
  active: boolean;
}

export interface Poll { date: ISODate; type: "ap" | "cfp"; ranks: { team_id: number; points: number }[] }

export interface NewsItem { id: string; date: ISODate; kind: string; headline: string; body: string; team_ids: number[] }

export interface Settings {
  cfp_teams: number;
  cfp_auto_bids: number;
  cfp_byes: number;
  conf_title_games: boolean;
  home_field_points: number;
  /** Event types that stop the sim. Your game days always stop it in M0. */
  stop_on: EventType[];
  /** Keep full play-by-play for your games and for games between two ranked teams. */
  keep_pbp: "mine" | "mine_and_ranked" | "all";
}

export const DEFAULT_SETTINGS: Settings = {
  cfp_teams: 12, cfp_auto_bids: 5, cfp_byes: 4, conf_title_games: true, home_field_points: 2.5,
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
