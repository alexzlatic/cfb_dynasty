import type { CalEvent, Coach, Game, GameDetail, NewsItem, Player, Poll, Settings, Team, Writer, PlayoffState, LiveView, LiveMode, UserCall, GamePlan, PracticePlan, Prep, PrepEdge, Injury as CoreInjury, Career, Award, AwardType, PlayerSeason, SecurityStep, CareerStart, LabArea, LabPlan, TeamContext } from "@cfb/core";
import type { TeamRatings, UnitRates } from "@cfb/engine";
export type { LiveView, LiveMode, UserCall, GamePlan, PracticePlan, Award, AwardType, CareerStart, LabArea, LabPlan };
export type CareerView = Career & { security: number; label: string };
/** A player's season stats with who he is. */
export type StatRow = PlayerSeason & { pid: number; name: string; pos: string; class: string; years: number; ovr: number };
export type LiveResult = LiveView & { since: number; result?: Game };

export type { CalEvent, Coach, Game, GameDetail, NewsItem, Player, Poll, Settings, Team, PlayoffState };
export type WriterProfile = Omit<Writer, "voter"> & { homer?: number };
export type GameRow = Game & { home_rank: number | null; away_rank: number | null };
/** Your staff's read on one of your players: development beyond what was expected so far, and his traits. */
export interface StaffPlayer { pid: number; growth: number; expected: number; leadership: number; adaptability: number }
export type UnitRead = { development: number; fit: number; chemistry: number };
export interface DevelopmentView {
  team_id: number | null; lab: Record<number, LabPlan>; slots: number; areas: Record<LabArea, string>; context: TeamContext;
  staff: { known: number; units: Record<"off" | "def", UnitRead>; players: StaffPlayer[] } | null;
  players: { pid: number; name: string; pos: string; class: string; years: number; ovr: number }[]; depth: DepthChart;
}

export interface PayrollPlayer {
  pid: number; name: string; pos: string; class: string; years: number; ovr: number; value: number;
  contract: { amount: number; years: number; start: number } | null; eligibility: number; starter: boolean; gp: number;
}
export interface PayrollView {
  team_id: number | null; year: number; cap: number; football_share: number; pool: number; payroll: number; mine: boolean;
  players: PayrollPlayer[]; conference: { team_id: number; pool: number; payroll: number }[];
}

export interface LeagueState {
  id: string; name: string; year: number; date: string; user_team_id: number | null; settings: Settings; done: boolean;
  champion: number | null; upcoming: CalEvent[]; my_next_game: Game | null; ap: { team_id: number; points: number }[];
  playoff: PlayoffState | null; news: NewsItem[]; career: CareerView | null;
}

export type { RatedPlayer } from "@cfb/core";
import type { RatedPlayer } from "@cfb/core";
export type DepthChart = Record<string, number[]>;
export type { Injury } from "@cfb/core";
import type { Injury } from "@cfb/core";
export type PlayerLine = Record<string, number>;

export interface PlanInfo {
  plan: GamePlan; practice: PracticePlan; prep: Prep | null; edge: PrepEdge; next_game: GameRow | null; league: UnitRates;
  scout: {
    team_id: number; record: { w: number; l: number } | null; rank: number | null; power: number; last: GameRow[]; injuries: CoreInjury[];
    ratings: Pick<TeamRatings, "offense" | "defense" | "pass_rate" | "plays_per_game" | "aggressiveness"> | null;
  } | null;
}

export interface LeagueSummary { id: string; name: string; date: string; user_team_id: number | null; played_at: number }

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(path, init);
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || r.statusText);
  return body as T;
}

export const api = {
  leagues: () => req<LeagueSummary[]>("/api/leagues"),
  health: () => req<{ ok: boolean; commit: string; saves: string; can_quit: boolean }>("/api/health"),
  quit: () => req<{ ok: boolean }>("/api/quit", { method: "POST" }),
  seedTeams: () => req<Team[]>("/api/seed/teams"),
  createLeague: (name: string, team_id: number | null, settings?: Partial<Settings>, career?: CareerStart) => req<{ id: string }>("/api/leagues", { method: "POST", body: JSON.stringify({ name, team_id, settings, career }) }),
  seedCoaches: () => req<Record<number, Pick<Coach, "first" | "last" | "career">>>("/api/seed/coaches"),
  career: (id: string) => req<{ career: CareerView | null; trail: (SecurityStep & { game: GameRow })[] }>(`/api/leagues/${id}/career`),
  awards: (id: string) => req<{ names: Record<AwardType, string>; awards: Award[] }>(`/api/leagues/${id}/awards`),
  payroll: (id: string, team?: number) => req<PayrollView>(`/api/leagues/${id}/payroll` + (team != null ? `?team=${team}` : "")),
  development: (id: string) => req<DevelopmentView>(`/api/leagues/${id}/development`),
  leaders: (id: string) => req<Record<string, StatRow[]>>(`/api/leagues/${id}/leaders`),
  state: (id: string) => req<LeagueState>(`/api/leagues/${id}/state`),
  teams: (id: string) => req<Team[]>(`/api/leagues/${id}/teams`),
  team: (id: string, tid: number) => req<{ team: Team; roster: Player[]; coaches: Coach[]; games: GameRow[]; power: number; rank: number | null;
    players: RatedPlayer[]; depth: DepthChart; custom_depth: boolean; injuries: Injury[]; stats: StatRow[] }>(`/api/leagues/${id}/teams/${tid}`),
  depth: (id: string, tid: number) => req<{ depth: DepthChart; custom: boolean; auto: DepthChart; players: RatedPlayer[]; injuries: Injury[];
    gp: Record<number, number>; redshirts: number[]; redshirt_games: number }>(`/api/leagues/${id}/teams/${tid}/depth`),
  player: (id: string, pid: number) => req<{ player: RatedPlayer; team: Team; slots: string[]; log: { game: GameRow; line: PlayerLine; snaps: number }[]; injury: Injury | null; injuries: Injury[];
    season: PlayerSeason | null; awards: Award[]; redshirt: boolean; redshirt_games: number; staff: (Partial<StaffPlayer> & { plan: LabPlan | null }) | null }>(`/api/leagues/${id}/players/${pid}`),
  schedule: (id: string, q: Record<string, string>) => req<GameRow[]>(`/api/leagues/${id}/schedule?` + new URLSearchParams(q)),
  game: (id: string, gid: number) => req<{ game: GameRow; detail: GameDetail | null; defenders: Record<string, { name: string; pos: string; team_id: number } | null> }>(`/api/leagues/${id}/games/${gid}`),
  standings: (id: string) => req<{ conference: string; rows: { team_id: number; w: number; l: number; cw: number; cl: number }[] }[]>(`/api/leagues/${id}/standings`),
  polls: (id: string) => req<Poll[]>(`/api/leagues/${id}/polls`),
  news: (id: string, q: Record<string, string> = {}) => req<NewsItem[]>(`/api/leagues/${id}/news?` + new URLSearchParams({ limit: "300", ...q })),
  writers: (id: string) => req<WriterProfile[]>(`/api/leagues/${id}/writers`),
  writer: (id: string, wid: number) => req<{ writer: WriterProfile; ballots: { date: string; team_ids: number[] }[]; stories: NewsItem[] }>(`/api/leagues/${id}/writers/${wid}`),
  ballots: (id: string, date: string) => req<{ writer_id: number; team_ids: number[] }[]>(`/api/leagues/${id}/ballots/${date}`),
  calendar: (id: string, from: string, to: string) => req<{ date: string; events: CalEvent[] }>(`/api/leagues/${id}/calendar?from=${from}&to=${to}`),
  live: (id: string, since = 0) => req<LiveResult | null>(`/api/leagues/${id}/live?since=${since}`),
  liveStart: (id: string, mode: Partial<LiveMode> = {}) => req<LiveResult>(`/api/leagues/${id}/live/start`, { method: "POST", body: JSON.stringify({ mode }) }),
  liveCall: (id: string, call: UserCall, since: number, to_end = false) => req<LiveResult>(`/api/leagues/${id}/live/call`, { method: "POST", body: JSON.stringify({ call, since, to_end }) }),
  liveMode: (id: string, mode: Partial<LiveMode>) => req<LiveResult>(`/api/leagues/${id}/live/mode`, { method: "POST", body: JSON.stringify({ mode }) }),
  liveSub: (id: string, slot: string, pid: number) => req<LiveResult>(`/api/leagues/${id}/live/sub`, { method: "POST", body: JSON.stringify({ slot, pid }) }),
  plan: (id: string) => req<PlanInfo>(`/api/leagues/${id}/plan`),
  liveLeave: (id: string) => req<{ ok: boolean }>(`/api/leagues/${id}/live/leave`, { method: "POST" }),
  act: (id: string, type: string, payload: unknown) => req<{ ok: boolean; date: string; days: number; played: number; stop: string | null }>(`/api/leagues/${id}/actions`, { method: "POST", body: JSON.stringify({ type, payload }) }),
};

/** Live updates: calls `onChange` whenever any client changes this league. */
export function subscribe(league: string, onChange: (msg: any) => void): () => void {
  let ws: WebSocket | null = null;
  let closed = false;
  const connect = () => {
    ws = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws?league=${league}`);
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.type !== "hello") onChange(m); };
    ws.onclose = () => { if (!closed) setTimeout(connect, 1500); };
  };
  connect();
  return () => { closed = true; ws?.close(); };
}
