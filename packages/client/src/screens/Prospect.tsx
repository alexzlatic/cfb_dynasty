import { useState } from "react";
import { ATTR_LABELS } from "@cfb/core/players";
import { useData, useLeague } from "../App.tsx";
import { api, type Considering } from "../api.ts";
import { Logo, heightStr, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";
import { Dial, DualBar, recruitStars } from "./ratings.tsx";
import { PersonaPanel } from "./Players.tsx";

const GRADE = ["Freshman", "Sophomore", "Junior", "Senior"];

/**
 * A prospect's page: who he is, how your staff rates him now and on arrival, how that read has moved, the
 * schools he's considering and your recruiting of him.
 */
export function ProspectPage({ pid }: { pid: number }) {
  const { id, team, state } = useLeague();
  const p = useData(() => api.prospect(id, pid), [pid, state.date]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [hours, setHours] = useState<string | null>(null);
  if (!p) return <p className="muted">Loading...</p>;
  const me = state.user_team_id;
  const act = async (type: string, payload: unknown) => {
    setBusy(true); setErr(null);
    try { await api.act(id, type, payload); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const committed = p.commit ? team(p.commit.team_id) : undefined;
  const offered = me != null && p.offers.includes(me);
  const signed = !!p.commit?.signed;
  const now = p.ovr ? Math.round((p.ovr.lo + p.ovr.hi) / 2) : null;
  return (
    <div>
      {err && <p className="error">{err}</p>}
      <div className="hero prospect">
        <div className="jersey">{p.pos}</div>
        <div className="who">
          <div className="kicker">{p.cls} class · {GRADE[p.grade]} · {p.listed}</div>
          <h1>{p.name}</h1>
          <div className="bio">{[p.home.city && `${p.home.city}, ${p.home.state ?? ""}`, heightStr(p.height), p.weight ? `${p.weight} lb` : null].filter(Boolean).join(" · ")}</div>
          <div className="chips">
            {p.service ? <span className="chip">{recruitStars(p.service.stars)} No. {p.service.rank} nationally · {p.service.rating.toFixed(4)}</span> : <span className="chip">Not rated by the service</span>}
            {committed ? <span className="chip strong"><Logo team={committed} size={18} /> {signed ? "Signed with" : "Committed to"} {committed.school} {shortDate(p.commit!.date)}</span> : <span className="chip">Uncommitted</span>}
            {p.board >= 0 && <span className="chip gold">No. {p.board + 1} on your board</span>}
          </div>
        </div>
        <div className="dials">
          {now != null && <Dial v={now} label="Now" range={[p.ovr!.lo, p.ovr!.hi]} />}
          {p.potential && <Dial v={p.potential.est} label="Potential" range={[p.potential.lo, p.potential.hi]} faded />}
        </div>
      </div>
      {me != null && (
        <div className="actionbar">
          <button disabled={busy} className={p.board >= 0 ? "" : "primary"} onClick={() => act("recruit_board", { pid: p.id, on: p.board < 0 })}>{p.board >= 0 ? "Remove from big board" : "Add to big board"}</button>
          {!signed && p.grade >= 1 && <button disabled={busy} onClick={() => act("recruit_offer", { pid: p.id, on: !offered })}>{offered ? "Pull offer" : "Offer"}</button>}
          <button disabled={busy} onClick={() => act("scout_prospect", { pid: p.id, on: !p.scouting })}>{p.scouting ? "Stop scouting" : "Send scouts"}</button>
          {!signed && <span className="hours">Contact <input value={hours ?? String(p.hours || "")} onChange={(e) => setHours(e.target.value)} /> h/week
            <button disabled={busy || hours == null} onClick={async () => { await act("recruit_hours", { pid: p.id, hours: Number(hours) || 0 }); setHours(null); }}>Set</button></span>}
          <span className="muted small">{p.evals} evaluation{p.evals === 1 ? "" : "s"} · {Math.round(p.interest)} contact hours so far</span>
        </div>
      )}
      <div className="cols">
        <div>
          <Panel title="Ratings" right={<span className="small muted">now / on arrival, as your staff projects them</span>}>
            {p.ratings.length ? p.ratings.map((r) => <DualBar key={r.attr} label={ATTR_LABELS[r.attr] ?? r.attr} now={r.now} pot={r.arrival} />)
              : <p className="muted">Your staff hasn't seen enough of him to project ratings.</p>}
            <p className="small muted">His strengths and weaknesses are what your scouts see; the level is their estimate, so it moves as their read narrows.</p>
          </Panel>
          <Panel title="Your staff's read over time" right={<span className="small muted">potential, 90% range</span>}>
            <ReadChart history={p.history} />
            <p className="small muted">Ranges narrow as he gets older, faster near home, where you have a regional scout and with every evaluation.
              {p.years_out > 0 ? ` He arrives on campus in about ${p.years_out.toFixed(1)} years.` : ""}</p>
          </Panel>
        </div>
        <div>
          <Panel title="Schools he's considering" right={<span className="small muted">his chance if he chose today</span>}>
            {p.considering.length ? <ConsideringList rows={p.considering} me={me} />
              : <p className="muted">{p.grade < 1 ? "Too young: schools are only scouting him for now." : signed ? "He has signed." : "No school is in his picture yet."}</p>}
          </Panel>
          <PersonaPanel v={p.persona} />
          <Panel title="Offers">
            {p.offers.length ? <div className="logos">{p.offers.map((t) => <span key={t} title={team(t)?.school}><Logo team={team(t)} size={26} /></span>)}</div> : <p className="muted">No offers yet.</p>}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** Schools a prospect is considering with his chance of picking each, yours highlighted. */
export function ConsideringList({ rows, me, compact = false }: { rows: Considering[]; me: number | null; compact?: boolean }) {
  const { id, team } = useLeague();
  return (
    <div className={"considering" + (compact ? " compact" : "")}>
      {rows.map((c, i) => (
        <div key={c.team} className={"crow" + (c.team === me ? " mine" : "")}>
          <span className="place">{i + 1}</span>
          <Logo team={team(c.team)} size={compact ? 18 : 22} />
          {!compact && <a href={`#/l/${id}/team/${c.team}`} className="cname">{team(c.team)?.school}</a>}
          <span className="cbar"><span style={{ width: `${Math.max(2, c.share * 100)}%` }} /></span>
          <span className="cpct">{Math.round(c.share * 100)}%</span>
          {!compact && <span className="small muted">{c.offered ? "offer" : ""}</span>}
        </div>
      ))}
    </div>
  );
}

/** Your read of his potential week by week: the estimate as a line, the 90% range as a band. */
function ReadChart({ history }: { history: { date: string; est: number; lo: number; hi: number }[] }) {
  if (history.length < 2) return <p className="muted small">Not enough history yet.</p>;
  const W = 520, H = 160, pad = 28;
  const lo = Math.floor(Math.min(...history.map((h) => h.lo)) - 1), hi = Math.ceil(Math.max(...history.map((h) => h.hi)) + 1);
  const x = (i: number) => pad + (i / (history.length - 1)) * (W - pad - 8);
  const y = (v: number) => 8 + ((hi - v) / (hi - lo)) * (H - 30);
  const band = history.map((h, i) => `${x(i)},${y(h.hi)}`).join(" ") + " " + history.map((h, i) => `${x(history.length - 1 - i)},${y(history[history.length - 1 - i].lo)}`).join(" ");
  const ticks = [lo, Math.round((lo + hi) / 2), hi];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="readchart">
      {ticks.map((t) => <g key={t}><line x1={pad} x2={W - 8} y1={y(t)} y2={y(t)} className="grid" /><text x={pad - 4} y={y(t) + 4} textAnchor="end">{t}</text></g>)}
      <polygon points={band} className="band" />
      <polyline points={history.map((h, i) => `${x(i)},${y(h.est)}`).join(" ")} className="est" />
      <text x={pad} y={H - 4}>{shortDate(history[0].date)}</text>
      <text x={W - 8} y={H - 4} textAnchor="end">today</text>
    </svg>
  );
}
