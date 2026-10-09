import type { ConferenceDef, ConferenceSetup, TieIns, CalEvent, Coach, Game, GameDetail, NewsItem, Player, Poll, Settings, Team, Writer, PlayoffState, LiveView, LiveMode, UserCall, GamePlan, PracticePlan, Prep, PrepEdge, Injury as CoreInjury, Career, Award, AwardType, PlayerSeason, TeamSeason, SecurityStep, CareerStart, LabArea, LabPlan, TeamContext, PersonaView, DevPhase, BoxRow, LiveBox } from "@cfb/core";
import type { TeamRatings, UnitRates } from "@cfb/engine";
export type { PlayerSeason, TeamSeason, ConferenceDef, ConferenceSetup, TieIns, LiveView, LiveMode, UserCall, GamePlan, PracticePlan, Award, AwardType, CareerStart, LabArea, LabPlan, PersonaView };
export type ConfMove = { team_id: number; from: string; to: string; announced: number; effective: number; fee: number; reason: string };
export type ConferencesView = {
  conferences: ConferenceDef[]; tie_ins: TieIns; champs: Record<string, number>; year: number; mode: Settings["realignment"]; commissioner: boolean; can_edit: boolean;
  deals: Record<string, { per_school: number; expires: number }>; pending: ConfMove[]; history: ConfMove[]; pcsa: boolean;
};
export type CareerView = Career & { security: number; label: string };

// ---- coaches and the carousel ----
export type Role = "HC" | "OC" | "DC" | "STC";
export type SkillKey = "recruiting" | "scouting" | "development" | "game_planning" | "scheme";
export const SKILL_NAMES: Record<SkillKey, string> = { recruiting: "Recruiting", scouting: "Scouting", development: "Development", game_planning: "Game planning", scheme: "Scheme" };
export interface CoachView {
  id: number; first: string; last: string; age: number; role: Role | null; team_id: number | null; rep: number; side: "off" | "def"; off: string; def: string;
  since: number; salary: number; through: number; seasons: { year: number; team_id: number; role: Role; w: number; l: number; unit?: number }[];
  prior: { w: number; l: number; years: number } | null; left: { team_id: number; year: number; why: string } | null; source: string; user: boolean; gone: boolean;
  hc_record: { w: number; l: number }; skills: Record<SkillKey, number>;
}
export interface CoachMove { date: string; coach: number; name: string; kind: "fired" | "retired" | "not_retained" | "hired" | "resigned" | "left_coaching"; team_id: number | null; role: Role | null; from?: { team_id: number | null; role: Role | null }; note?: string }
export interface Opening { team_id: number; role: Role; opened: string; ready: string; why: string; prev: number | null; prev_name: string | null; offered?: boolean; declined?: boolean }
export interface JobOffer { team_id: number; date: string; expires: string; salary: number; years: number; status: string }
export interface StaffData {
  team_id: number | null; roles: Record<Role, string>; members: CoachView[]; open: Role[]; budget: number; pay: number; carousel: { open: boolean; close: string }; in_season: boolean;
  candidates: (CoachView & { ask: number })[];
}
export interface CoachesData { year: number; open: boolean; close: string; openings: Opening[]; moves: CoachMove[]; head_coaches: (CoachView & { hot: number | null })[]; past_years: number[] }
/** A player's season stats with who he is. */
export type StatRow = PlayerSeason & { pid: number; name: string; pos: string; class: string; years: number; ovr: number };
/** A row of the Stats section: a player's season line and his team's games (`tgp`, for qualifying); past seasons have no ratings. */
export type StatsPlayer = PlayerSeason & { pid: number; name: string; pos: string; class: string; years?: number; ovr?: number; tgp: number };
/** A past season at a glance: champion, Heisman, your season and the national leader in each key stat. */
export interface SeasonHistory {
  year: number; champion: number | null; heisman: { pid: number; name: string; pos: string; team_id: number } | null; playoff: number[];
  user: { team_id: number; w: number; l: number; rank: number | null } | null;
  leaders: Record<string, { pid: number; name: string; pos: string; team_id: number; value: number } | null>;
}
/** A team's season: its box score totals (`off`) and its opponents' (`def`). */
export type StatsTeam = TeamSeason & { team_id: number };
export type LiveResult = LiveView & { since: number; result?: Game };

export type { BoxRow, LiveBox, CalEvent, Coach, Game, GameDetail, NewsItem, Player, Poll, Settings, Team, PlayoffState };
export type WriterProfile = Omit<Writer, "voter"> & { homer?: number };
export type GameRow = Game & { home_rank: number | null; away_rank: number | null };
export type UnitRead = { development: number; fit: number; chemistry: number };
/** One of your players on the Development screen: what he's working on and his progress (overall points, your staff's read). */
export interface DevPlayer {
  pid: number; name: string; pos: string; class: string; years: number; ovr: number; starter: boolean; gp: number; plan: LabPlan | null;
  focus: { area: LabArea; by: "plan" | "staff"; attrs: { key: string; label: string; value: number }[] };
  /** Gained this year so far; gained this phase, what the staff planned for the whole phase and by today; trend against a normal pace over the last few weeks, and change since last Monday (in season). */
  so_far: number; gained: number; target: number; by_now: number; trend: number | null; last_week: number | null;
  leadership: number | null; adaptability: number | null;
}
export interface DevelopmentView {
  team_id: number | null; date: string; lab: Record<number, LabPlan>; slots: number; areas: Record<LabArea, string>; context: TeamContext;
  staff: { known: number; units: Record<"off" | "def", UnitRead> } | null;
  phase: DevPhase; since: string; done: boolean; weeks: number; trend_since: string | null;
  players: DevPlayer[]; depth: DepthChart;
}

// ---- keeping players and the portal ----
export type WatchLevel = "settled" | "restless" | "shopping" | "gone";
export interface WatchView {
  p: number; watch: WatchLevel; label: string; known: boolean; persona: string;
  reasons: { reason: string; weight: number; label: string }[]; leaving: boolean; value: number; pay: number;
  /** Pay that settles him (null: money won't fix it), and your staff's range for the least he'd stay for. */
  keep: number | null; walk_range: [number, number] | null; fix: string; promise: { year: number; broken?: boolean } | null;
}
export interface TalkView {
  status: string; label: string; ask: number | null; patience: number; offer: { amount: number; years: number; made: string; answer: string } | null; counter: number | null;
  deal: { amount: number; years: number; via: string } | null; outcome: "signed" | "let_go" | "portal" | "stayed" | null; mine: boolean;
  plan: { kind: "renew" | "offer" | "let_go" | "needs_you"; amount?: number } | null; market: number | null;
  /** A longer deal: how much more a year he wants per extra season, the longest he'll sign (your staff's read until you talk). */
  length: { premium: number; max: number; known: boolean };
}
export interface RetentionRow { pid: number; name: string; pos: string; ovr: number; years: number; cls: string; starter: boolean; importance: number; watch: WatchView; talk: TalkView | null; pay: number; next_deal: { amount: number; years: number } | null }
export interface RenewalRule { auto_up_to: number; offer_up_to: number; release_over: number; budget_share: number }
export interface NextBudget { total: number; committed: number; deals: number; contracts: number }
export interface RetentionData { talks_open: boolean; portal_open: boolean; rule: RenewalRule; budget: NextBudget; rows: RetentionRow[]; talks_left: number; dates: { talks: string | null; portal: string | null } }
export interface FutureData extends RetentionRow {
  comparables: { players: { pid: number; team_id: number; name: string; ovr: number; pay: number }[]; median: number | null };
  budget: NextBudget; rule: RenewalRule; talks_open: boolean; talked: string | null; eligibility: number; talks_left: number; dates: { talks: string | null; portal: string | null };
}
export interface PortalRow {
  pid: number; name: string; pos: string; ovr: number; next: number; potential: { est: number; lo: number; hi: number }; years: number; cls: string; stars: number;
  from: number; entered: string; reasons: string[]; ask: number; offers: number; status: "open" | "committed" | "none"; to: number | null;
  top: { team_id: number; share: number }[]; mine: { amount: number; years: number } | null; pitches: number; costs_season: boolean;
  offers_list: { team_id: number; amount: number | null; years: number; date: string }[]; pitched_today: boolean;
  /** His stats in the season he's leaving. */
  stats: PlayerSeason | null;
}
export interface PortalNeed { spots: number; starter: boolean; floor: number }
export interface PortalData { year: number | null; open: boolean; window: string | null; entries: PortalRow[]; needs: Record<string, PortalNeed>; budget: NextBudget | null; offered: number; pitches_left: number }

export interface Fortune { fans: number; donors: number; ad: number }
export interface FinanceYear { year: number; w: number; l: number; post: string | null; revenue: number; expenses: number; surplus: number; attendance: number; roster_budget: number; class: string; fortune: Fortune }
export type SalaryCell = { amount: number; kind: "paid" | "signed" | "locked" | "est" | "gone" };
export interface FrontOfficeData {
  team_id: number | null; year: number; mine: boolean; conference: string;
  class: { now: { key: string; label: string } | null; next: { key: string; label: string } };
  fortune: { now: Fortune; next: Fortune }; record: { w: number; l: number; exp: number; ratio: number }; postseason: { own: number; pooled: number };
  years: number[];
  players: { pid: number; name: string; pos: string; ovr: number; cls: string; years: number; value: number; value_next: number; last: number; nfl: boolean; cells: SalaryCell[] }[];
  totals: { year: number; budget: number; committed: number; est: number; room: number }[];
  lines: { year: number; revenue: Record<string, number>; expenses: Record<string, number>; surplus: number; projected: boolean }[];
  history: FinanceYear[];
  labels: { revenue: Record<string, string>; expenses: Record<string, string> };
}

export interface PayrollPlayer {
  pid: number; name: string; pos: string; class: string; years: number; ovr: number; value: number;
  contract: { amount: number; years: number; start: number; retention?: number; locked?: boolean } | null; nil: NilDeal | null; morale: number; eligibility: number; starter: boolean; gp: number;
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
  persona: PersonaView;
}
export type BoardRow = ProspectRow & { considering: Considering[]; you: { place: number; share: number } | null };
/** A map point: id, lat, lon, stars, your estimate, committed to, on your board (1/0), position, name. */
export type MapPoint = [number, number, number, number, number, number | null, number, string, string];
export interface StaffTimeSplit { recruiting: number; scouting: number; prep: number; opponent?: number }
export interface RecruitingView {
  available: boolean; team_id: number | null; year: number; date: string; cls: number;
  classes: { cls: number; grade: number; total: number; known: number; rated: number; found: number }[];
  total: number; prospects: ProspectRow[];
  settings: { auto: boolean; hours: Record<string, number>; scout: number[]; regions: string[]; spend: number; time: StaffTimeSplit; split: StaffTimeSplit; board: number[] };
  home: { lat: number | null; lon: number | null; state: string | null } | null;
  staff: { role: string; first: string; last: string; skills: Record<string, number> }[]; skills: Record<string, number>; skill_names: Record<string, string>;
  hours: number; regions: Record<string, { name: string; states: string[] }>; costs: { region: number; trip_near: number; trip_far: number; trip_hours: { near: number; far: number } };
}
export interface DraftPickRow { pick: number; round: number; nfl: string; pid: number; team_id: number; name: string; pos: string; ovr: number; early: boolean }
export interface DraftView {
  draft: { year: number; picks: DraftPickRow[] } | null;
  projected: { pid: number; team_id: number; name: string; pos: string; ovr: number; early: boolean }[];
  early: { pid: number; team_id: number; name: string; pos: string; ovr: number; rank: number }[];
  prospects: { pid: number; team_id: number; name: string; pos: string; ovr: number; cls: string; declared: boolean }[];
  history: Record<string, number[]>; dates: { deadline: string | null; draft: string | null }; prestige: Record<string, number>;
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
  /** Your staff's film on the next opponent. */
  film: {
    game_id: number; opponent: number; knowledge: number; hours: number; usual: number; share: number; off_name: string; def_name: string;
    insights: { id: string; side: "offense" | "defense" | "personnel"; text: string; counter: string; plain: number }[];
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
  createLeague: (name: string, team_id: number | null, settings?: Partial<Settings>, career?: CareerStart, conferences?: ConferenceSetup | null) =>
    req<{ id: string }>("/api/leagues", { method: "POST", body: JSON.stringify({ name, team_id, settings, career, conferences }) }),
  seedConferences: () => req<{ conferences: ConferenceDef[]; tie_ins: TieIns; bowls: { name: string; ny6: boolean; sides: [string[], string[]] }[]; pcsa_cap: number }>("/api/seed/conferences"),
  conferences: (id: string) => req<ConferencesView>(`/api/leagues/${id}/conferences`),
  seedCoaches: () => req<Record<number, Pick<Coach, "first" | "last" | "career">>>("/api/seed/coaches"),
  career: (id: string) => req<{ career: CareerView | null; trail: (SecurityStep & { game: GameRow })[]; coach: CoachView | null; offers: JobOffer[]; carousel: { open: boolean; close: string } | null }>(`/api/leagues/${id}/career`),
  staff: (id: string, role?: Role) => req<StaffData>(`/api/leagues/${id}/staff` + (role ? `?role=${role}` : "")),
  coaches: (id: string) => req<CoachesData>(`/api/leagues/${id}/coaches`),
  coachMoves: (id: string, year: number) => req<CoachMove[]>(`/api/leagues/${id}/coaches/moves?year=${year}`),
  coach: (id: string, cid: number) => req<CoachView & { moves: CoachMove[] }>(`/api/leagues/${id}/coaches/${cid}`),
  awards: (id: string) => req<{ names: Record<AwardType, string>; awards: Award[] }>(`/api/leagues/${id}/awards`),
  frontOffice: (id: string, team?: number) => req<FrontOfficeData>(`/api/leagues/${id}/front_office` + (team != null ? `?team=${team}` : "")),
  budget: (id: string, team?: number) => req<BudgetData>(`/api/leagues/${id}/budget` + (team != null ? `?team=${team}` : "")),
  collective: (id: string, team?: number) => req<CollectiveView>(`/api/leagues/${id}/collective` + (team != null ? `?team=${team}` : "")),
  payroll: (id: string, team?: number) => req<PayrollView>(`/api/leagues/${id}/payroll` + (team != null ? `?team=${team}` : "")),
  development: (id: string) => req<DevelopmentView>(`/api/leagues/${id}/development`),
  statYears: (id: string) => req<number[]>(`/api/leagues/${id}/stats/years`),
  statPlayers: (id: string, q: Record<string, string> = {}) => req<StatsPlayer[]>(`/api/leagues/${id}/stats/players?` + new URLSearchParams(q)),
  statTeams: (id: string, q: Record<string, string> = {}) => req<StatsTeam[]>(`/api/leagues/${id}/stats/teams?` + new URLSearchParams(q)),
  statHistory: (id: string) => req<SeasonHistory[]>(`/api/leagues/${id}/stats/history`),
  teamHistory: (id: string, tid: number) => req<(StatsTeam & { year: number; final_rank: number | null; champion: boolean })[]>(`/api/leagues/${id}/stats/team-history?team=${tid}`),
  leaders: (id: string) => req<Record<string, StatRow[]>>(`/api/leagues/${id}/leaders`),
  state: (id: string) => req<LeagueState>(`/api/leagues/${id}/state`),
  teams: (id: string) => req<Team[]>(`/api/leagues/${id}/teams`),
  team: (id: string, tid: number) => req<{ team: Team; roster: Player[]; coaches: Coach[]; staff: CoachView[] | null; games: GameRow[]; power: number; rank: number | null;
    players: RatedPlayer[]; depth: DepthChart; custom_depth: boolean; injuries: Injury[]; stats: StatRow[]; personas: Record<number, string> }>(`/api/leagues/${id}/teams/${tid}`),
  depth: (id: string, tid: number) => req<{ depth: DepthChart; custom: boolean; auto: DepthChart; players: RatedPlayer[]; injuries: Injury[];
    gp: Record<number, number>; redshirts: number[]; redshirt_games: number; fit: Record<number, number> }>(`/api/leagues/${id}/teams/${tid}/depth`),
  player: (id: string, pid: number) => req<{ player: RatedPlayer; team: Team; slots: string[]; log: { game: GameRow; line: PlayerLine; snaps: number }[]; injury: Injury | null; injuries: Injury[];
    season: PlayerSeason | null; career: (PlayerSeason & { year: number })[]; awards: Award[]; redshirt: boolean; redshirt_games: number; staff: (Partial<Pick<DevPlayer, "focus" | "so_far" | "gained" | "target" | "by_now" | "leadership" | "adaptability">> & { plan: LabPlan | null; phase: DevPhase["kind"] }) | null;
    potential: { est: number; lo: number; hi: number }; future: FutureData | null; portal: PortalRow | null; persona: PersonaView }>(`/api/leagues/${id}/players/${pid}`),
  retention: (id: string) => req<RetentionData | null>(`/api/leagues/${id}/retention`),
  portal: (id: string) => req<PortalData>(`/api/leagues/${id}/portal`),
  schedule: (id: string, q: Record<string, string>) => req<GameRow[]>(`/api/leagues/${id}/schedule?` + new URLSearchParams(q)),
  game: (id: string, gid: number) => req<{ game: GameRow; detail: GameDetail | null; box: { home: BoxRow[]; away: BoxRow[] } | null }>(`/api/leagues/${id}/games/${gid}`),
  standings: (id: string) => req<{ conference: string; rows: { team_id: number; w: number; l: number; cw: number; cl: number }[] }[]>(`/api/leagues/${id}/standings`),
  polls: (id: string) => req<Poll[]>(`/api/leagues/${id}/polls`),
  news: (id: string, q: Record<string, string> = {}) => req<NewsItem[]>(`/api/leagues/${id}/news?` + new URLSearchParams({ limit: "300", ...q })),
  writers: (id: string) => req<WriterProfile[]>(`/api/leagues/${id}/writers`),
  writer: (id: string, wid: number) => req<{ writer: WriterProfile; ballots: { date: string; team_ids: number[] }[]; stories: NewsItem[] }>(`/api/leagues/${id}/writers/${wid}`),
  ballots: (id: string, date: string) => req<{ writer_id: number; team_ids: number[] }[]>(`/api/leagues/${id}/ballots/${date}`),
  calendar: (id: string, from: string, to: string) => req<{ date: string; events: CalEvent[] }>(`/api/leagues/${id}/calendar?from=${from}&to=${to}`),
  liveBox: (id: string, at: number) => req<LiveBox | null>(`/api/leagues/${id}/live/box?at=${at}`),
  live: (id: string, since = 0) => req<LiveResult | null>(`/api/leagues/${id}/live?since=${since}`),
  liveStart: (id: string, mode: Partial<LiveMode> = {}) => req<LiveResult>(`/api/leagues/${id}/live/start`, { method: "POST", body: JSON.stringify({ mode }) }),
  liveCall: (id: string, call: UserCall, since: number, to_end = false) => req<LiveResult>(`/api/leagues/${id}/live/call`, { method: "POST", body: JSON.stringify({ call, since, to_end }) }),
  liveMode: (id: string, mode: Partial<LiveMode>) => req<LiveResult>(`/api/leagues/${id}/live/mode`, { method: "POST", body: JSON.stringify({ mode }) }),
  liveSub: (id: string, slot: string, pid: number) => req<LiveResult>(`/api/leagues/${id}/live/sub`, { method: "POST", body: JSON.stringify({ slot, pid }) }),
  plan: (id: string) => req<PlanInfo>(`/api/leagues/${id}/plan`),
  recruiting: (id: string, q: Record<string, string>) => req<RecruitingView>(`/api/leagues/${id}/recruiting?` + new URLSearchParams(q)),
  draft: (id: string) => req<DraftView>(`/api/leagues/${id}/draft`),
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
