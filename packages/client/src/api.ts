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
  contract: { amount: number; years: number; start: number; retention?: number } | null; nil: NilDeal | null; morale: number; eligibility: number; starter: boolean; gp: number;
  /** Completed a season here (can be paid from the retention fund); the most the NIL review approves for him. */
  returning: boolean; ceiling: number;
}
/** A school's one roster pool: the AD's revenue share (and retention fund) plus the collective's money. */
export interface RosterPool { revenue_share: number; retention: number; collective: number; total: number; signed: number; room: number }
export interface NilDeal { amount: number; asked?: number; status: "approved" | "cut"; date: string }
export interface CollectiveView {
  team_id: number | null; mine: boolean; base: number; reserve: number; focus: string[]; focus_max: number; positions: string[]; spent: number;
  deals: { pid: number; name: string; pos: string; ovr: number; value: number; ceiling: number; revenue_share: number; deal: NilDeal }[];
  conference: { team_id: number; base: number; spent: number }[];
}
export interface PayrollView {
  team_id: number | null; year: number; cap: number; football_share: number; pcsa: boolean; pool: RosterPool; mine: boolean;
  players: PayrollPlayer[]; conference: ({ team_id: number } & RosterPool)[];
  /** Your locker room: what pay and playing time are doing to each unit's chemistry, in points a game. */
  mood: { off: number; def: number } | null;
}

export interface BudgetData {
  team_id: number | null; mine: boolean; year: number; source: "knight-newhouse" | "estimate";
  revenue: Record<string, number>; expenses: Record<string, number>; surplus: number;
  labels: { revenue: Record<string, string>; expenses: Record<string, string> }; usual_price: number; capacity: number;
  home: { game: GameRow; price: number; custom: boolean; attendance: number | null; revenue: number | null; options: { price: number; attendance: number; revenue: number }[] }[];
  conference: { team_id: number; revenue: number; expenses: number; surplus: number }[];
  facilities: Record<string, number> | null; areas: Record<string, string>;
  projects: { area: string; to: number; cost: number; years: number; start: string; done: string }[];
  requests: { date: string; area: string; approved: boolean; reason: string }[];
}

export interface ProspectRow {
  id: number; name: string; cls: number; grade: number; pos: string; listed: string; region: string | null;
  home: { city: string | null; state: string | null }; height: number | null; weight: number | null;
  service: { stars: number; rating: number; rank: number } | null;
  potential: { est: number; lo: number; hi: number } | null; ovr: { lo: number; hi: number } | null;
  evals: number; hours: number; commit: { team_id: number; signed: boolean; date: string } | null;
  offers: number[]; interest: number; top_schools: { team_id: number; hours: number; offered: boolean }[];
  /** Place on your big board (-1 when not on it). */
  board: number; scouting: boolean; lat: number; lon: number;
}
/** A school a prospect is considering: his chance of picking it if he chose today. */
export interface Considering { team: number; share: number; offered: boolean; hours: number }
export interface ProspectPageData extends ProspectRow {
  considering: Considering[];
  history: { date: string; est: number; lo: number; hi: number }[];
  ratings: { attr: string; now: number; arrival: number }[];
  years_out: number;
}
export type BoardRow = ProspectRow & { considering: Considering[]; you: { place: number; share: number } | null };
/** A map point: id, lat, lon, stars, your estimate, committed to, on your board (1/0), position, name. */
export type MapPoint = [number, number, number, number, number, number | null, number, string, string];
export interface StaffTimeSplit { recruiting: number; scouting: number; prep: number }
export interface RecruitingView {
  available: boolean; team_id: number | null; year: number; date: string; cls: number;
  classes: { cls: number; grade: number; total: number; known: number; rated: number; found: number }[];
  total: number; prospects: ProspectRow[];
  settings: { auto: boolean; hours: Record<string, number>; scout: number[]; regions: string[]; spend: number; time: StaffTimeSplit; split: StaffTimeSplit; board: number[] };
  home: { lat: number | null; lon: number | null; state: string | null } | null;
  staff: { role: string; first: string; last: string; skills: Record<string, number> }[]; skills: Record<string, number>; skill_names: Record<string, string>;
  hours: number; regions: Record<string, { name: string; states: string[] }>; costs: { region: number; trip_near: number; trip_far: number; trip_hours: { near: number; far: number } };
}
export interface ClassRank { team_id: number; points: number; commits: number; five: number; four: number }

export interface LeagueState {
  id: string; name: string; year: number; date: string; user_team_id: number | null; settings: Settings; done: boolean;
  champion: number | null; upcoming: CalEvent[]; my_next_game: Game | null; ap: { team_id: number; points: number }[];
  playoff: PlayoffState | null; news: NewsItem[]; career: CareerView | null; past: SeasonSummary[];
}

export type { RatedPlayer, SeasonSummary } from "@cfb/core";
import type { SeasonSummary } from "@cfb/core";
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
  budget: (id: string, team?: number) => req<BudgetData>(`/api/leagues/${id}/budget` + (team != null ? `?team=${team}` : "")),
  collective: (id: string, team?: number) => req<CollectiveView>(`/api/leagues/${id}/collective` + (team != null ? `?team=${team}` : "")),
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
    season: PlayerSeason | null; awards: Award[]; redshirt: boolean; redshirt_games: number; staff: (Partial<StaffPlayer> & { plan: LabPlan | null }) | null;
    potential: { est: number; lo: number; hi: number } }>(`/api/leagues/${id}/players/${pid}`),
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
  recruiting: (id: string, q: Record<string, string>) => req<RecruitingView>(`/api/leagues/${id}/recruiting?` + new URLSearchParams(q)),
  prospect: (id: string, pid: number) => req<ProspectPageData>(`/api/leagues/${id}/recruiting/prospect?pid=${pid}`),
  board: (id: string) => req<{ rows: BoardRow[] }>(`/api/leagues/${id}/recruiting/board`),
  recruitMap: (id: string, cls: number, pos = "") => req<{ cls: number; points: MapPoint[] }>(`/api/leagues/${id}/recruiting/map?cls=${cls}${pos ? `&pos=${pos}` : ""}`),
  classRanks: (id: string, cls: number) => req<ClassRank[]>(`/api/leagues/${id}/recruiting/rankings?cls=${cls}&limit=25`),
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
