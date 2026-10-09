import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, subscribe, type LeagueState, type Team } from "./api.ts";
import { go, useRoute } from "./router.ts";
import { Logo, fmtDate, onColor } from "./util.tsx";
import { Start, NewLeague } from "./screens/Start.tsx";
import { Home } from "./screens/Home.tsx";
import { CalendarScreen } from "./screens/Calendar.tsx";
import { Schedule } from "./screens/Schedule.tsx";
import { Standings } from "./screens/Standings.tsx";
import { Conferences } from "./screens/Conferences.tsx";
import { Polls } from "./screens/Polls.tsx";
import { Writers, WriterPage } from "./screens/Writers.tsx";
import { News } from "./screens/News.tsx";
import { Inbox } from "./screens/Inbox.tsx";
import { TeamPage } from "./screens/Team.tsx";
import { GamePage } from "./screens/Game.tsx";
import { Postseason } from "./screens/Postseason.tsx";
import { SettingsScreen } from "./screens/Settings.tsx";
import { PlayerPage } from "./screens/Players.tsx";
import { DepthScreen } from "./screens/Depth.tsx";
import { LiveScreen } from "./screens/Live.tsx";
import { PlanScreen } from "./screens/Plan.tsx";
import { AwardsScreen } from "./screens/Awards.tsx";
import { CareerScreen } from "./screens/Career.tsx";
import { DevelopmentScreen } from "./screens/Development.tsx";
import { PayrollScreen } from "./screens/Payroll.tsx";
import { CollectiveScreen } from "./screens/Collective.tsx";
import { BudgetScreen } from "./screens/Budget.tsx";
import { FrontOfficeScreen } from "./screens/FrontOffice.tsx";
import { RecruitingScreen } from "./screens/Recruiting.tsx";
import { ProspectPage } from "./screens/Prospect.tsx";
import { DraftScreen } from "./screens/Draft.tsx";
import { RetentionScreen } from "./screens/Retention.tsx";
import { PortalScreen } from "./screens/Portal.tsx";
import { StaffScreen } from "./screens/Staff.tsx";
import { CoachesScreen, CoachPage } from "./screens/Coaches.tsx";
import { StatsScreen } from "./screens/Stats.tsx";

export interface LeagueCtx {
  id: string;
  state: LeagueState;
  teams: Map<number, Team>;
  /** Bumped on every change pushed from the server, so screens refetch. */
  version: number;
  team: (id: number) => Team | undefined;
  rank: (id: number) => number | null;
}

const Ctx = createContext<LeagueCtx | null>(null);
export const useLeague = () => useContext(Ctx)!;

/** Refetch `load` whenever the league changes. */
export function useData<T>(load: () => Promise<T>, deps: unknown[]): T | null {
  const { version } = useLeague();
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    load().then((d) => live && setData(d)).catch(() => {});
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);
  return data;
}

export function App() {
  const route = useRoute();
  if (route[0] === "new") return <NewLeague />;
  if (route[0] === "l" && route[1]) return <LeagueShell id={route[1]} screen={route[2] || "home"} arg={route[3]} sub={route[4]} />;
  return <Start />;
}

/** The menu: a few sections, each with its pages. `mine` pages need a team; `on` says which screens belong to a page. */
interface NavPage { label: string; href: (id: string, my: number | null) => string; on: (screen: string, arg: string | undefined, my: number | null) => boolean; mine?: boolean }
interface NavSection { key: string; label: string; pages: NavPage[] }
const page = (label: string, path: string, screens: string[] = [path.split("/")[0]], mine = false): NavPage => ({
  label, mine, href: (id) => `#/l/${id}/${path}`,
  on: (screen, arg) => screens.includes(screen) && (!path.includes("/") || arg === path.split("/")[1]),
});
const myPage = (label: string, screen: string): NavPage => ({
  label, mine: true, href: (id, my) => `#/l/${id}/${screen}/${my}`, on: (s, arg, my) => s === screen && Number(arg) === my,
});
const NAV: NavSection[] = [
  { key: "home", label: "Home", pages: [page("Dashboard", "home"), page("Inbox", "inbox", ["inbox"], true), page("News", "news"), page("Calendar", "calendar")] },
  { key: "team", label: "My Team", pages: [myPage("Roster", "team"), myPage("Depth chart", "depth"), page("Game plan", "plan", ["plan"], true),
    page("Development", "development", ["development"], true), page("Staff", "staff", ["staff"], true), page("Retention", "retention", ["retention"], true), page("Game day", "live", ["live"], true)] },
  { key: "recruiting", label: "Recruiting", pages: [page("Big board", "recruiting/board", ["recruiting"], true), page("Transfer portal", "portal"), page("Prospects", "recruiting/list", ["recruiting"]),
    page("Map", "recruiting/map", ["recruiting"]), page("Class rankings", "recruiting/rankings", ["recruiting"]), page("Scouting and staff", "recruiting/staff", ["recruiting"], true)] },
  { key: "money", label: "Money", pages: [page("Front office", "front", ["front"], true), page("Payroll", "payroll", ["payroll"], true), page("Collective", "collective", ["collective"], true), page("Budget", "budget", ["budget"], true)] },
  { key: "stats", label: "Stats", pages: [page("Players", "stats/players", ["stats"]), page("Teams", "stats/teams", ["stats"]), page("Leaders", "stats/leaders", ["stats"]), page("History", "stats/history", ["stats"])] },
  { key: "league", label: "League", pages: [page("Schedule", "schedule"), page("Standings", "standings"), page("Conferences", "conferences"), page("Polls", "polls"), page("Postseason", "postseason"),
    page("Awards", "awards"), page("Coaching carousel", "coaches", ["coaches", "coach"]), page("NFL draft", "draft"), page("Writers", "writers", ["writers", "writer"])] },
  { key: "office", label: "Office", pages: [page("Career", "career", ["career"], true), page("Settings", "settings")] },
];
/** Which section a screen belongs to (pages about other teams, games and players sit under League). */
function sectionOf(screen: string, arg: string | undefined, my: number | null): string {
  for (const sec of NAV) if (sec.pages.some((p) => p.on(screen, arg, my))) return sec.key;
  if (screen === "prospect") return "recruiting";
  if (screen === "player" || screen === "team" || screen === "depth" || screen === "game") return "league";
  return "home";
}

function LeagueShell({ id, screen, arg, sub }: { id: string; screen: string; arg?: string; sub?: string }) {
  const [state, setState] = useState<LeagueState | null>(null);
  const [teams, setTeams] = useState<Map<number, Team>>(new Map());
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => { api.state(id).then(setState).catch((e) => setErr(e.message)); setVersion((v) => v + 1); }, [id]);
  const loadTeams = useCallback(() => api.teams(id).then((t) => setTeams(new Map(t.map((x) => [x.id, x])))), [id]);
  useEffect(() => { loadTeams(); refresh(); }, [id, refresh, loadTeams]);
  // Teams change conferences when the conferences are edited and at a new season.
  const year = state?.year;
  useEffect(() => { if (year != null) loadTeams(); }, [year, loadTeams]);
  useEffect(() => subscribe(id, (m) => {
    refresh();
    if (m.type === "action" && m.action.type === "set_conferences") loadTeams();
    if (m.type === "days" && m.news?.length) setToast(m.news[m.news.length - 1].headline);
  }), [id, refresh]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); } }, [toast]);

  const ctx = useMemo<LeagueCtx | null>(() => state && {
    id, state, teams, version, team: (t) => teams.get(t),
    rank: (t) => { const i = state.ap.findIndex((r) => r.team_id === t); return i >= 0 ? i + 1 : null; },
  }, [id, state, teams, version]);

  if (err) return <div className="page"><p className="error">{err}</p><a href="#/">Back to leagues</a></div>;
  if (!ctx || !state) return <div className="page muted">Loading league...</div>;
  return <Shell id={id} screen={screen} arg={arg} sub={sub} ctx={ctx} state={state} teams={teams} busy={busy} setBusy={setBusy} toast={toast} setToast={setToast} />;
}

/** The league's frame: the top bar in your school's colors, the menu and the page. */
function Shell({ id, screen, arg, sub, ctx, state, teams, busy, setBusy, toast, setToast }: {
  id: string; screen: string; arg?: string; sub?: string; ctx: LeagueCtx; state: LeagueState; teams: Map<number, Team>; busy: boolean;
  setBusy: (b: boolean) => void; toast: string | null; setToast: (t: string | null) => void;
}) {
  const my = state.user_team_id != null ? teams.get(state.user_team_id) : undefined;
  const bg = my?.color ?? "#1d2733", fg = onColor(bg), alt = my?.alt_color ?? "#c9a227";
  // Your school's colors run through the whole game (accents, headings, highlights).
  useEffect(() => {
    const r = document.documentElement.style;
    r.setProperty("--team", bg); r.setProperty("--team2", alt); r.setProperty("--onteam", fg);
  }, [bg, alt, fg]);

  const sim = async (kind: string, extra: Record<string, string> = {}) => {
    setBusy(true);
    try { await api.act(id, "sim", { kind, ...extra }); } catch (e) { setToast((e as Error).message); }
    setBusy(false);
  };

  return (
    <Ctx.Provider value={ctx}>
      <header className="topbar" style={{ background: bg, color: fg, borderBottomColor: my?.alt_color ?? "#000" }}>
        <span className="histnav">
          <button title="Back (Alt+Left)" onClick={() => history.back()}>‹</button>
          <button title="Forward (Alt+Right)" onClick={() => history.forward()}>›</button>
        </span>
        <a href="#/" className="brand" style={{ color: fg }}>CFB Dynasty</a>
        {my && <a className="myteam" href={`#/l/${id}/team/${my.id}`} style={{ color: fg }}><Logo team={my} size={34} /> {my.school} {my.mascot}</a>}
        <div className="today"><div className="date">{fmtDate(state.date, true)}</div><div className="small">{state.name}</div></div>
        <SimControls busy={busy} done={state.done} year={state.year} onSim={sim} date={state.date} />
      </header>
      <Nav id={id} screen={screen} arg={arg} my={my?.id ?? null} gameday={state.my_next_game?.date === state.date} unread={state.inbox_unread ?? 0} />
      <main className="page">
        {screen === "home" && <Home />}
        {screen === "calendar" && <CalendarScreen />}
        {screen === "schedule" && <Schedule date={arg} />}
        {screen === "standings" && <Standings />}
        {screen === "conferences" && <Conferences />}
        {screen === "polls" && <Polls date={arg} />}
        {screen === "postseason" && <Postseason />}
        {screen === "writers" && <Writers />}
        {screen === "writer" && arg && <WriterPage wid={Number(arg)} />}
        {screen === "news" && <News />}
        {screen === "inbox" && <Inbox />}
        {screen === "team" && arg && <TeamPage key={arg} tid={Number(arg)} tab={sub} />}
        {screen === "game" && arg && <GamePage gid={Number(arg)} />}
        {screen === "settings" && <SettingsScreen />}
        {screen === "player" && arg && <PlayerPage key={arg} pid={Number(arg)} tab={sub} />}
        {screen === "depth" && arg && <DepthScreen tid={Number(arg)} />}
        {screen === "live" && <LiveScreen />}
        {screen === "plan" && <PlanScreen />}
        {screen === "awards" && <AwardsScreen />}
        {screen === "career" && <CareerScreen />}
        {screen === "development" && <DevelopmentScreen />}
        {screen === "payroll" && <PayrollScreen tid={arg ? Number(arg) : undefined} />}
        {screen === "collective" && <CollectiveScreen tid={arg ? Number(arg) : undefined} />}
        {screen === "budget" && <BudgetScreen tid={arg ? Number(arg) : undefined} />}
        {screen === "front" && <FrontOfficeScreen tid={arg ? Number(arg) : undefined} />}
        {screen === "recruiting" && <RecruitingScreen sub={arg ?? "list"} />}
        {screen === "prospect" && arg && <ProspectPage pid={Number(arg)} />}
        {screen === "stats" && <StatsScreen key={`${arg}/${sub}`} sub={arg ?? "players"} year={sub ? Number(sub) : undefined} />}
        {screen === "draft" && <DraftScreen />}
        {screen === "retention" && <RetentionScreen />}
        {screen === "portal" && <PortalScreen />}
        {screen === "staff" && <StaffScreen />}
        {screen === "coaches" && <CoachesScreen />}
        {screen === "coach" && arg && <CoachPage key={arg} cid={Number(arg)} />}
      </main>
      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
    </Ctx.Provider>
  );
}

/** The two-level menu: sections across the top, the open section's pages underneath. */
function Nav({ id, screen, arg, my, gameday, unread }: { id: string; screen: string; arg?: string; my: number | null; gameday: boolean; unread: number }) {
  const cur = sectionOf(screen, arg, my);
  const visible = (p: NavPage) => (!p.mine || my != null) && (p.label !== "Game day" || gameday || screen === "live");
  const sec = NAV.find((x) => x.key === cur)!;
  return (
    <nav className="nav">
      <div className="sections">
        {NAV.filter((x) => x.pages.some(visible)).map((x) => {
          const first = x.pages.find(visible)!;
          return <a key={x.key} href={first.href(id, my)} className={x.key === cur ? "on" : ""}>{x.label}{x.key === "team" && gameday && <span className="dot" title="Game day" />}{x.key === "home" && my != null && unread > 0 && <span className="badge" title="Unread messages">{unread}</span>}</a>;
        })}
      </div>
      <div className="pages">
        {sec.pages.filter(visible).map((p) => <a key={p.label} href={p.href(id, my)} className={(p.on(screen, arg, my) ? "on" : "") + (p.label === "Game day" ? " gameday" : "")}>{p.label}{p.label === "Inbox" && unread > 0 && <span className="badge">{unread}</span>}</a>)}
      </div>
    </nav>
  );
}

function SimControls({ busy, done, year, onSim, date }: { busy: boolean; done: boolean; year: number; onSim: (k: string, x?: Record<string, string>) => void; date: string }) {
  const [to, setTo] = useState("");
  // Simming on after the season ends rolls the league into the next one.
  if (done) return (
    <div className="sim">
      <span className="pill">{year} season complete</span>
      <button disabled={busy} onClick={() => onSim("day")}>Start the {year + 1} season</button>
      {busy && <span className="spinner" />}
    </div>
  );
  return (
    <div className="sim">
      <button disabled={busy} onClick={() => onSim("day")}>Sim 1 day</button>
      <button disabled={busy} onClick={() => onSim("next_event")}>To next event</button>
      <button disabled={busy} onClick={() => onSim("my_next_game")}>To my next game</button>
      <span className="simdate">
        <input type="date" value={to} min={date} onChange={(e) => setTo(e.target.value)} />
        <button disabled={busy || !to} onClick={() => onSim("date", { date: to })}>Sim to date</button>
      </span>
      <button disabled={busy} onClick={() => confirm("Sim to the end of the season?") && onSim("end_of_season")}>End of season</button>
      {busy && <span className="spinner" />}
    </div>
  );
}

export { go };
