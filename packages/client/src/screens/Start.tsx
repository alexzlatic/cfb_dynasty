import { useEffect, useMemo, useState } from "react";
import { api, subscribe, type ConferenceSetup, type LeagueSummary, type Team } from "../api.ts";
import { ConferenceEditor, sortConfs } from "./Conferences.tsx";
import { go } from "../router.ts";
import { Logo, fmtDate } from "../util.tsx";

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h ago`;
  const d = Math.round(m / 1440);
  return d === 1 ? "yesterday" : `${d} days ago`;
};

export function Start() {
  const [leagues, setLeagues] = useState<LeagueSummary[] | null>(null);
  const [teams, setTeams] = useState<Map<number, Team>>(new Map());
  const [health, setHealth] = useState<{ saves: string; can_quit: boolean } | null>(null);
  const [quit, setQuit] = useState(false);
  useEffect(() => {
    api.leagues().then(setLeagues).catch(() => setLeagues([]));
    api.seedTeams().then((t) => setTeams(new Map(t.map((x) => [x.id, x])))).catch(() => {});
    api.health().then(setHealth).catch(() => {});
    // Keeps a launcher-started server awake while this window is open.
    return subscribe("", () => {});
  }, []);
  if (quit) return <div className="page narrow"><h1>CFB Dynasty</h1><p>The game is closed and everything is saved. You can close this window.</p></div>;
  const [last, ...rest] = leagues ?? [];
  const t = last?.user_team_id != null ? teams.get(last.user_team_id) : undefined;
  return (
    <div className="page narrow">
      <h1>CFB Dynasty</h1>
      <p className="muted">The 2026 college football season, day by day.</p>
      {!leagues ? <p className="muted">Loading...</p> : last && (
        <a className="continue" href={`#/l/${last.id}/home`} style={{ borderColor: t?.color }}>
          {t && <Logo team={t} size={56} />}
          <span className="what">
            <span className="small muted">Continue</span>
            <strong>{last.name}</strong>
            <span className="small">{t ? `${t.school} · ` : ""}{fmtDate(last.date, true)} · played {ago(last.played_at)}</span>
          </span>
          <span className="go">Play</span>
        </a>
      )}
      <p><button className={last ? "" : "primary"} onClick={() => go("new")}>New league</button></p>
      {rest.length > 0 && <>
        <h2>Other saved leagues</h2>
        <table className="grid"><tbody>{rest.map((l) => {
          const lt = l.user_team_id != null ? teams.get(l.user_team_id) : undefined;
          return (
            <tr key={l.id}>
              <td>{lt && <Logo team={lt} size={22} />}</td>
              <td><a href={`#/l/${l.id}/home`}>{l.name}</a></td>
              <td className="muted">{fmtDate(l.date, true)}</td>
              <td className="muted small">played {ago(l.played_at)}</td>
            </tr>
          );
        })}</tbody></table>
      </>}
      {health && <p className="small muted savesat">Saves are kept in {health.saves}</p>}
      {health?.can_quit && <p><button onClick={() => api.quit().then(() => setQuit(true))}>Quit game</button></p>}
    </div>
  );
}

export function NewLeague() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [pick, setPick] = useState<number | null>(null);
  const [name, setName] = useState("My Dynasty");
  const [format, setFormat] = useState("playoff-12");
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [coaches, setCoaches] = useState<Record<number, { first: string; last: string }>>({});
  const [mode, setMode] = useState<"real" | "fresh">("real");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [real, setReal] = useState<Awaited<ReturnType<typeof api.seedConferences>> | null>(null);
  const [custom, setCustom] = useState<ConferenceSetup | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.seedTeams().then(setTeams); api.seedCoaches().then(setCoaches).catch(() => {});
    api.seedConferences().then(setReal).catch(() => {});
  }, []);
  // Schools grouped by conference: the real ones, or yours while you edit them.
  const byConf = useMemo(() => {
    const byId = new Map(teams.map((t) => [t.id, t]));
    const confs = custom?.conferences ?? real?.conferences;
    const match = (t: Team) => !q || t.school.toLowerCase().includes(q.toLowerCase());
    if (confs) return sortConfs(confs, byId).map((c) => [c.name, c.members.map((id) => byId.get(id)).filter((t): t is Team => !!t && match(t))] as [string, Team[]]).filter(([, ts]) => ts.length);
    const m = new Map<string, Team[]>();
    for (const t of teams) if (match(t)) m.set(t.conference, [...(m.get(t.conference) || []), t]);
    return [...m].sort((a, b) => b[1].reduce((s, t) => s + t.prestige, 0) / b[1].length - a[1].reduce((s, t) => s + t.prestige, 0) / a[1].length);
  }, [teams, q, custom, real]);
  const chosen = teams.find((t) => t.id === pick);
  const create = async () => {
    setBusy(true);
    const [f, n] = format.split("-");
    const playoff = f === "playoff" ? { format: "playoff", teams: Number(n), byes: n === "12" ? 4 : n === "24" ? 8 : 0, auto_bids: Number(n) >= 12 ? 5 : 0 } : { format: f };
    try {
      const { id } = await api.createLeague(name, pick, { playoff } as never, mode === "real" ? { mode } : { mode, first, last }, custom);
      go("l", id, "home");
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="page">
      <h1>New league</h1>
      <div className="newleague">
        <label>League name <input value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Postseason <select value={format} onChange={(e) => setFormat(e.target.value)}>
          <option value="playoff-12">12-team playoff (current rules)</option>
          <option value="playoff-4">4-team playoff</option>
          <option value="playoff-8">8-team playoff</option>
          <option value="playoff-16">16-team playoff</option>
          <option value="playoff-24">24-team playoff</option>
          <option value="bcs">BCS title game</option>
          <option value="bowls">Bowls only, AP champion</option>
        </select></label>
        <div className="careerpick">
          <span>Your career</span>
          <label><input type="radio" checked={mode === "real"} onChange={() => setMode("real")} />
            Take over as the real head coach{chosen && coaches[chosen.id] ? ` (${coaches[chosen.id].first} ${coaches[chosen.id].last})` : ""}</label>
          <label><input type="radio" checked={mode === "fresh"} onChange={() => setMode("fresh")} /> Start fresh under your own name, an unknown</label>
          {mode === "fresh" && <div className="names"><input placeholder="First name" value={first} onChange={(e) => setFirst(e.target.value)} /><input placeholder="Last name" value={last} onChange={(e) => setLast(e.target.value)} /></div>}
        </div>
        <label>Conferences <select value={custom ? "custom" : "real"} disabled={!real} onChange={(e) => setCustom(e.target.value === "custom" && real ? { conferences: structuredClone(real.conferences), tie_ins: structuredClone(real.tie_ins) } : null)}>
          <option value="real">Real 2026 conferences</option>
          <option value="custom">Custom conferences</option>
        </select></label>
        <label>Find a school <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" /></label>
        <button className="primary" disabled={busy || !pick || (mode === "fresh" && !last.trim())} onClick={create}>{chosen ? `Start as ${chosen.school}` : "Pick a team"}</button>
      </div>
      {err && <p className="warn">{err}</p>}
      {custom && real && <ConferenceEditor teams={teams} value={custom} onChange={setCustom} bowls={real.bowls} cap={real.pcsa_cap} />}
      {byConf.map(([conf, ts]) => (
        <section key={conf} className="confpick">
          <h3>{conf}</h3>
          <div className="teamgrid">
            {ts.sort((a, b) => a.school.localeCompare(b.school)).map((t) => (
              <button key={t.id} className={"teamcard" + (pick === t.id ? " on" : "")} style={{ borderColor: pick === t.id ? t.color : undefined }} onClick={() => setPick(t.id)}>
                <Logo team={t} size={40} /><span>{t.school}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
