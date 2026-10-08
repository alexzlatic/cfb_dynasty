import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, subscribe, type LeagueState, type Team } from "./api.ts";
import { go, useRoute } from "./router.ts";
import { Logo, fmtDate, onColor } from "./util.tsx";
import { Start, NewLeague } from "./screens/Start.tsx";
import { Home } from "./screens/Home.tsx";
import { CalendarScreen } from "./screens/Calendar.tsx";
import { Schedule } from "./screens/Schedule.tsx";
import { Standings } from "./screens/Standings.tsx";
import { Polls } from "./screens/Polls.tsx";
import { Writers, WriterPage } from "./screens/Writers.tsx";
import { News } from "./screens/News.tsx";
import { TeamPage } from "./screens/Team.tsx";
import { GamePage } from "./screens/Game.tsx";
import { Postseason } from "./screens/Postseason.tsx";
import { SettingsScreen } from "./screens/Settings.tsx";
import { PlayerPage } from "./screens/Players.tsx";
import { DepthScreen } from "./screens/Depth.tsx";
import { LiveScreen } from "./screens/Live.tsx";

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
  if (route[0] === "l" && route[1]) return <LeagueShell id={route[1]} screen={route[2] || "home"} arg={route[3]} />;
  return <Start />;
}

const NAV: [string, string][] = [
  ["home", "Home"], ["calendar", "Calendar"], ["schedule", "Schedule"], ["standings", "Standings"], ["polls", "Polls"],
  ["postseason", "Postseason"], ["writers", "Writers"], ["news", "News"], ["settings", "Settings"],
];

function LeagueShell({ id, screen, arg }: { id: string; screen: string; arg?: string }) {
  const [state, setState] = useState<LeagueState | null>(null);
  const [teams, setTeams] = useState<Map<number, Team>>(new Map());
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(() => { api.state(id).then(setState).catch((e) => setErr(e.message)); setVersion((v) => v + 1); }, [id]);
  useEffect(() => { api.teams(id).then((t) => setTeams(new Map(t.map((x) => [x.id, x])))); refresh(); }, [id, refresh]);
  useEffect(() => subscribe(id, (m) => {
    refresh();
    if (m.type === "days" && m.news?.length) setToast(m.news[m.news.length - 1].headline);
  }), [id, refresh]);
  useEffect(() => { if (toast) { const t = setTimeout(() => setToast(null), 5000); return () => clearTimeout(t); } }, [toast]);

  const ctx = useMemo<LeagueCtx | null>(() => state && {
    id, state, teams, version, team: (t) => teams.get(t),
    rank: (t) => { const i = state.ap.findIndex((r) => r.team_id === t); return i >= 0 ? i + 1 : null; },
  }, [id, state, teams, version]);

  if (err) return <div className="page"><p className="error">{err}</p><a href="#/">Back to leagues</a></div>;
  if (!ctx || !state) return <div className="page muted">Loading league...</div>;
  const my = state.user_team_id != null ? teams.get(state.user_team_id) : undefined;
  const bg = my?.color ?? "#1d2733", fg = onColor(bg);

  const sim = async (kind: string, extra: Record<string, string> = {}) => {
    setBusy(true);
    try { await api.act(id, "sim", { kind, ...extra }); } catch (e) { setToast((e as Error).message); }
    setBusy(false);
  };

  return (
    <Ctx.Provider value={ctx}>
      <header className="topbar" style={{ background: bg, color: fg, borderBottomColor: my?.alt_color ?? "#000" }}>
        <a href="#/" className="brand" style={{ color: fg }}>CFB Dynasty</a>
        {my && <a className="myteam" href={`#/l/${id}/team/${my.id}`} style={{ color: fg }}><Logo team={my} size={34} /> {my.school} {my.mascot}</a>}
        <div className="today"><div className="date">{fmtDate(state.date, true)}</div><div className="small">{state.name}</div></div>
        <SimControls busy={busy} done={state.done} onSim={sim} date={state.date} />
      </header>
      <nav className="tabs">
        {NAV.map(([k, label]) => <a key={k} href={`#/l/${id}/${k}`} className={screen === k ? "on" : ""}>{label}</a>)}
        {my && <a href={`#/l/${id}/team/${my.id}`} className={screen === "team" && Number(arg) === my.id ? "on" : ""}>My team</a>}
        {my && <a href={`#/l/${id}/depth/${my.id}`} className={screen === "depth" && Number(arg) === my.id ? "on" : ""}>Depth chart</a>}
        {my && (state.my_next_game?.date === state.date || screen === "live") && <a href={`#/l/${id}/live`} className={"gameday" + (screen === "live" ? " on" : "")}>Game day</a>}
      </nav>
      <main className="page">
        {screen === "home" && <Home />}
        {screen === "calendar" && <CalendarScreen />}
        {screen === "schedule" && <Schedule date={arg} />}
        {screen === "standings" && <Standings />}
        {screen === "polls" && <Polls date={arg} />}
        {screen === "postseason" && <Postseason />}
        {screen === "writers" && <Writers />}
        {screen === "writer" && arg && <WriterPage wid={Number(arg)} />}
        {screen === "news" && <News />}
        {screen === "team" && arg && <TeamPage tid={Number(arg)} />}
        {screen === "game" && arg && <GamePage gid={Number(arg)} />}
        {screen === "settings" && <SettingsScreen />}
        {screen === "player" && arg && <PlayerPage pid={Number(arg)} />}
        {screen === "depth" && arg && <DepthScreen tid={Number(arg)} />}
        {screen === "live" && <LiveScreen />}
      </main>
      {toast && <div className="toast" onClick={() => setToast(null)}>{toast}</div>}
    </Ctx.Provider>
  );
}

function SimControls({ busy, done, onSim, date }: { busy: boolean; done: boolean; onSim: (k: string, x?: Record<string, string>) => void; date: string }) {
  const [to, setTo] = useState("");
  if (done) return <div className="sim"><span className="pill">Season complete</span></div>;
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
