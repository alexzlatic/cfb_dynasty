import { useMemo, useState, type ReactNode } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type DevPlayer, type DevelopmentView, type LabArea, type UnitRead } from "../api.ts";
import { shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";

/** A hidden score in points of margin, as a staff would say it. */
export function readWord(x: number): { text: string; tone: string } {
  if (x >= 3) return { text: "Big plus", tone: "win" };
  if (x >= 1.2) return { text: "Plus", tone: "win" };
  if (x > -1.2) return { text: "Even", tone: "muted" };
  if (x > -3) return { text: "Minus", tone: "loss" };
  return { text: "Big minus", tone: "loss" };
}

function contextLine(c: DevelopmentView["context"]): string {
  if (c.new_coach && c.new_qb) return "A new staff and a new quarterback: nobody knows yet how this team fits together, including the media.";
  if (c.new_coach) return "A new staff: how the roster fits the new systems is the big unknown this year.";
  if (c.new_qb) return "A new quarterback: chemistry on offense is the big unknown this year.";
  if (c.continuity) return "Same staff, same quarterback, most starters back: fewer surprises, and the locker room you had carries over.";
  return "Same staff, with some new starters.";
}

/** What each team-level read means, in the staff's words: good, even and bad. */
const UNIT_SAYS: Record<keyof UnitRead, { label: string; what: string; say: [string, string, string] }> = {
  development: { label: "Development", what: "Are the starters growing faster or slower than scouts expected?",
    say: ["growing faster than anyone outside expected", "growing about as expected", "growing slower than expected"] },
  fit: { label: "Scheme fit", what: "Do the starters suit what the coordinators want to run?",
    say: ["the system suits this group", "the fit is fine", "the system is a struggle for this group"] },
  chemistry: { label: "Chemistry", what: "Do they play for each other? Good chemistry also speeds up everyone's development.",
    say: ["a tight locker room", "a normal locker room", "friction in the locker room"] },
};

const r1 = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)}`;
const PHASES = [["offseason", "Offseason"], ["camp", "Fall camp"], ["season", "In season"]] as const;

/** How a player is doing against the work the staff planned for this phase. */
function status(p: DevPlayer, done: boolean): { text: string; tone: string; rank: number } {
  if (done) return { text: "Year's work done", tone: "muted", rank: 0 };
  const d = p.gained - p.by_now;
  if (d >= 0.5) return { text: "Ahead", tone: "win", rank: 1 };
  if (d <= -0.5) return { text: "Behind", tone: "loss", rank: -1 };
  return { text: "On track", tone: "muted", rank: 0 };
}

/** Progress this phase toward what the staff planned for all of it, with a tick at where he should be by today. */
function Bar({ p }: { p: DevPlayer }) {
  const top = Math.max(p.target, p.gained, 0.1);
  const pct = (x: number) => `${Math.max(0, Math.min(100, (x / top) * 100))}%`;
  const color = p.gained - p.by_now >= 0.5 ? "var(--up)" : p.gained - p.by_now <= -0.5 ? "var(--down)" : "var(--accent)";
  return (
    <span className="nowrap" title={`${r1(p.gained)} of ${r1(p.target)} planned for this phase (${r1(p.by_now)} by today)`}>
      <span style={{ display: "inline-block", position: "relative", width: 90, height: 8, background: "var(--line)", borderRadius: 4, verticalAlign: "middle" }}>
        <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: pct(p.gained), background: color, borderRadius: 4 }} />
        <span style={{ position: "absolute", left: pct(p.by_now), top: -2, bottom: -2, width: 2, background: "var(--ink)" }} />
      </span>{" "}
      <span className="small">{r1(p.gained)}</span> <span className="muted small">of {r1(p.target)}</span>
    </span>
  );
}

interface Col { key: string; label: string; title?: string; num?: boolean; sort?: (p: DevPlayer) => number | string; cell: (p: DevPlayer) => ReactNode }

/** A table whose columns sort by clicking their headers (click again to flip). */
function SortTable({ cols, rows, initial, rowClass }: { cols: Col[]; rows: DevPlayer[]; initial: [string, 1 | -1]; rowClass?: (p: DevPlayer) => string }) {
  const [[key, dir], setSort] = useState<[string, 1 | -1]>(initial);
  const col = cols.find((c) => c.key === key);
  const sorted = useMemo(() => {
    if (!col?.sort) return rows;
    const f = col.sort;
    return [...rows].sort((a, b) => { const x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : b.ovr - a.ovr) * dir; });
  }, [rows, col, dir]);
  const click = (c: Col) => c.sort && setSort(([k, d]) => [c.key, k === c.key ? (-d as 1 | -1) : c.num ? -1 : 1]);
  return (
    <table className="grid tight">
      <thead><tr>{cols.map((c) => (
        <th key={c.key} className={c.num ? "num" : ""} title={c.title} onClick={() => click(c)} style={c.sort ? { cursor: "pointer", userSelect: "none" } : undefined}>
          {c.label}{c.key === key ? (dir === 1 ? " ▲" : " ▼") : ""}
        </th>))}</tr></thead>
      <tbody>{sorted.map((p) => <tr key={p.pid} className={rowClass?.(p) ?? ""}>{cols.map((c) => <td key={c.key} className={c.num ? "num" : ""}>{c.cell(p)}</td>)}</tr>)}</tbody>
    </table>
  );
}

const POS_ORDER = ["QB", "RB", "WR", "TE", "OL", "DE", "DT", "LB", "CB", "S", "K", "P", "LS"];
const posRank = (pos: string) => POS_ORDER.indexOf(pos);

/** Your staff's read on your team's development, scheme fit and chemistry, and what each player is working on. */
export function DevelopmentScreen() {
  const { id, state } = useLeague();
  const data = useData(() => api.development(id), [state.date]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <p className="muted">Loading...</p>;
  if (data.team_id == null || !data.staff) return <Panel title="Player development"><p className="muted">Pick a team in Settings to run its development.</p></Panel>;
  const v = data.staff, ph = data.phase, kind = ph.kind;
  const plans = Object.entries(data.lab).map(([pid, l]) => ({ pid: Number(pid), ...l }));
  const byId = new Map(data.players.map((p) => [p.pid, p]));
  const setPlan = async (pid: number, area: LabArea | null) => {
    setBusy(true); setErr(null);
    try { await api.act(id, "set_lab", { pid, area }); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const planSelect = (pid: number) => (
    <select value={data.lab[pid]?.area ?? ""} disabled={busy || (!data.lab[pid] && plans.length >= data.slots)} onChange={(e) => setPlan(pid, (e.target.value || null) as LabArea | null)}>
      <option value="">Staff's choice</option>
      {Object.entries(data.areas).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
  const now = (p: DevPlayer) => Math.round(p.ovr + p.so_far);
  const unitLine = (k: keyof UnitRead) => {
    const u = UNIT_SAYS[k];
    return (
      <tr key={k}><td title={u.what}><b>{u.label}</b><div className="muted small">{u.what}</div></td>
        {(["off", "def"] as const).map((side) => {
          const x = v.units[side][k], w = readWord(x);
          return <td key={side}><span className={w.tone}>{w.text}</span><div className="small muted">{x >= 1.2 ? u.say[0] : x <= -1.2 ? u.say[2] : u.say[1]}</div></td>;
        })}</tr>
    );
  };

  // ---- the phase's own panel ----
  let phasePanel: ReactNode = null;
  if (kind === "camp") {
    // Position battles: at each position, the weakest starter against the best backup, by where the staff has them now.
    const groups = new Map<string, { st: DevPlayer[]; bk: DevPlayer[] }>();
    for (const p of data.players) { const g = groups.get(p.pos) ?? { st: [], bk: [] }; (p.starter ? g.st : g.bk).push(p); groups.set(p.pos, g); }
    const battles = [...groups].filter(([pos, g]) => g.st.length && g.bk.length && !["K", "P", "LS"].includes(pos)).map(([pos, g]) => {
      const st = g.st.reduce((a, b) => (now(b) < now(a) ? b : a)), ch = g.bk.reduce((a, b) => (now(b) > now(a) ? b : a));
      return { pos, st, ch, gap: now(st) - now(ch) };
    }).filter((b) => b.gap <= 3).sort((a, b) => a.gap - b.gap || posRank(a.pos) - posRank(b.pos));
    phasePanel = (
      <Panel title="Position battles">
        <p className="small muted">Fall camp is when starting jobs are won. These backups are within three points of a starter at their position, or ahead of him, on your staff's read of where each player is now (his overall plus what he has gained this year). Make the call on the depth chart.</p>
        {!battles.length ? <p className="muted small">No close battles: every starter is clearly ahead of his backups.</p> : (
          <table className="grid tight"><thead><tr><th>Pos</th><th>Starter</th><th className="num">Now</th><th>Challenger</th><th className="num">Now</th><th>Verdict</th></tr></thead>
            <tbody>{battles.map((b) => (
              <tr key={b.pos}><td>{b.pos}</td>
                <td><a href={`#/l/${id}/player/${b.st.pid}`}>{b.st.name}</a> <span className="muted small">{b.st.class}</span></td><td className="num">{now(b.st)}</td>
                <td><a href={`#/l/${id}/player/${b.ch.pid}`}>{b.ch.name}</a> <span className="muted small">{b.ch.class}, {r1(b.ch.gained)} in camp</span></td><td className="num">{now(b.ch)}</td>
                <td className={b.gap < -1 ? "loss" : b.gap <= 1 ? "" : "muted"}>{b.gap < -1 ? "Backup is ahead: your call" : b.gap <= 1 ? "Dead even" : "Starter holding on"}</td></tr>
            ))}</tbody></table>
        )}
        <p className="small"><a href={`#/l/${id}/depth`}>Open the depth chart</a></p>
      </Panel>
    );
  } else if (kind === "season") {
    const withTrend = data.players.filter((p) => p.trend != null && !["K", "P", "LS"].includes(p.pos));
    const up = [...withTrend].sort((a, b) => b.trend! - a.trend!).filter((p) => p.trend! >= 0.2).slice(0, 5);
    const down = [...withTrend].sort((a, b) => a.trend! - b.trend!).filter((p) => p.trend! <= -0.2).slice(0, 5);
    const list = (xs: DevPlayer[]) => !xs.length ? <p className="muted small">Nobody yet.</p> : (
      <table className="grid tight"><tbody>{xs.map((p) => <tr key={p.pid}><td><a href={`#/l/${id}/player/${p.pid}`}>{p.name}</a> <span className="muted small">{p.pos}{p.starter ? "" : " (backup)"}</span></td>
        <td className={"num " + (p.trend! > 0 ? "win" : "loss")}>{r1(p.trend!)}</td></tr>)}</tbody></table>
    );
    phasePanel = (
      <Panel title="Trending this season">
        {data.done ? <p className="small muted">This year's development is done (it tops out by mid-November). What each player gained shows up in his ratings when the season rolls over; from here practice is about getting ready for the next game.</p>
          : <p className="small muted">In season, practice is mostly about the next opponent, so growth is small: the last 15% or so of the year's work. Trending is how a player has moved {data.trend_since ? `since ${shortDate(data.trend_since)}` : "over the last few weeks"} beyond a normal week's growth, on your staff's weekly read.</p>}
        {data.weeks === 0 && !data.done ? <p className="muted small">The first weekly read comes on Monday.</p> : (
          <div className="cols even"><div><h4>Trending up</h4>{list(up)}</div><div><h4>Trending down</h4>{list(down)}</div></div>
        )}
      </Panel>
    );
  } else {
    const top = [...data.players].filter((p) => p.target > 0).sort((a, b) => b.gained - a.gained).slice(0, 5);
    phasePanel = (
      <Panel title="Biggest gains this offseason">
        <p className="small muted">Spring practice (March and April) and summer workouts are the biggest growth period of the year: about half of a player's yearly growth comes before fall camp. Plans set now get the most days of work.</p>
        {!top.length || top[0].gained <= 0 ? <p className="muted small">Spring practice opens March 1; nobody has started yet.</p> : (
          <table className="grid tight"><tbody>{top.map((p) => <tr key={p.pid}><td><a href={`#/l/${id}/player/${p.pid}`}>{p.name}</a> <span className="muted small">{p.pos}, {p.class}</span></td>
            <td className="muted small">{data.areas[p.focus.area]}</td><td className="num win">{r1(p.gained)}</td></tr>)}</tbody></table>
        )}
      </Panel>
    );
  }

  // ---- every player: what he's working on and how far he has come ----
  const cols: Col[] = [
    { key: "name", label: "Player", sort: (p) => p.name, cell: (p) => <><a href={`#/l/${id}/player/${p.pid}`}>{p.name}</a>{p.starter ? "" : <span className="muted small"> backup</span>}</> },
    { key: "pos", label: "Pos", sort: (p) => posRank(p.pos) * 1000 - p.ovr, cell: (p) => p.pos },
    { key: "class", label: "Class", sort: (p) => p.years, cell: (p) => <span className="muted">{p.class}</span> },
    { key: "ovr", label: "Ovr", num: true, title: "His rating (what scouts and the media see). Ratings move up when the season rolls over.", sort: (p) => p.ovr, cell: (p) => p.ovr },
    { key: "now", label: "Now", num: true, title: "Where your staff has him now: his overall plus what he has gained this year", sort: (p) => p.ovr + p.so_far, cell: (p) => <b>{now(p)}</b> },
    { key: "focus", label: "Working on", sort: (p) => p.focus.area, cell: (p) => (
      <span>{data.areas[p.focus.area]}{p.focus.by === "staff" && <span className="muted small"> (staff)</span>}
        {p.focus.attrs.length > 0 && <div className="muted small">{p.focus.attrs.map((a) => `${a.label} ${a.value}`).join(", ")}</div>}</span>) },
    { key: "phase", label: kind === "offseason" ? "This offseason" : kind === "camp" ? "This camp" : "This season", title: "Overall points gained this phase against what the staff planned for all of it; the tick is where he should be by today",
      sort: (p) => p.gained, cell: (p) => <Bar p={p} /> },
    { key: "status", label: "Status", sort: (p) => status(p, data.done).rank * 100 + (p.gained - p.by_now), cell: (p) => { const s = status(p, data.done); return <span className={s.tone}>{s.text}</span>; } },
    ...(kind === "season" ? [
      { key: "gp", label: "GP", num: true, title: "Games played: game snaps are reps too", sort: (p: DevPlayer) => p.gp, cell: (p: DevPlayer) => p.gp },
      { key: "week", label: "Last wk", num: true, title: "Change in the staff's read since last Monday", sort: (p: DevPlayer) => p.last_week ?? 0,
        cell: (p: DevPlayer) => p.last_week == null ? "" : <span className={p.last_week >= 0.2 ? "win" : p.last_week <= -0.2 ? "loss" : "muted"}>{r1(p.last_week)}</span> },
    ] : []),
    { key: "year", label: "Year", num: true, title: "Overall points gained this year so far (your staff's read)", sort: (p) => p.so_far, cell: (p) => <span className="muted">{r1(p.so_far)}</span> },
    { key: "lead", label: "Lead", num: true, title: "Leadership: leaders build chemistry (a quarterback's counts three times)", sort: (p) => p.leadership ?? 0, cell: (p) => p.leadership },
    { key: "adapt", label: "Adapt", num: true, title: "Adaptability: how quickly he takes to a new system", sort: (p) => p.adaptability ?? 0, cell: (p) => p.adaptability },
    { key: "plan", label: "Plan", cell: (p) => planSelect(p.pid) },
  ];

  return (
    <div>
      <Panel title="Where we are in the development year">
        <div className="seg small">{PHASES.map(([k, l]) => <button key={k} className={k === kind ? "on" : ""} disabled={k !== kind} style={{ opacity: 1 }}>{l}</button>)}</div>
        <p className="small">
          {kind === "offseason" && "The offseason is where players grow the most: spring practice in March and April, then summer workouts. Put your plans on the players you most need to grow."}
          {kind === "camp" && `Fall camp runs to the opener on ${shortDate(ph.end)}. Players are still growing fast, and starting jobs are won and lost here.`}
          {kind === "season" && (data.done ? "The season's development is done; ratings move up at the rollover in February." : "In season the work is practice reps and game snaps. Growth is smaller now; it tops out by mid-November.")}
        </p>
        <p className="small muted">Ratings themselves move once a year, at the rollover. Until then, each player's progress here is your staff's read of how many overall points he has gained, counted from {shortDate(data.since)} for this phase. Each player has a plan for the phase: his share of a normal year's growth for his class (young players grow fastest) plus any individual plan. The bar shows how much of it he has done; the tick is where he should be by today.</p>
      </Panel>
      <div className="cols even">
        <Panel title="What your staff sees">
          <p className="small">{contextLine(data.context)}</p>
          <table className="grid tight"><thead><tr><th></th><th>Offense</th><th>Defense</th></tr></thead><tbody>
            {(["development", "fit", "chemistry"] as const).map(unitLine)}
          </tbody></table>
          <p className="small muted">How each unit plays against what the preseason ratings say. Your staff is about {Math.round(v.known * 100)}% sure of this read; it sharpens through fall camp and the season. The media, the polls and your opponents only see the preseason ratings until the results show them otherwise.</p>
        </Panel>
        <div>
          {phasePanel}
          <Panel title={`Individual plans (${plans.length} of ${data.slots})`}>
            <p className="small muted">Every player works on something: without a plan, his position coach picks the area of his weakest important rating. Your coaches can also give {data.slots} players an individual plan, which adds about two overall points over 80 days of work (two and a half at most in a year). A leadership plan builds team chemistry instead.</p>
            {!plans.length ? <p className="muted small">No plans yet. Pick an area next to a player.</p> : (
              <table className="grid tight"><tbody>{plans.map((l) => {
                const p = byId.get(l.pid);
                return <tr key={l.pid}><td><a href={`#/l/${id}/player/${l.pid}`}>{p?.name}</a> <span className="muted small">{p?.pos}</span></td><td>{planSelect(l.pid)}</td><td className="muted small nowrap">since {shortDate(l.from)}</td></tr>;
              })}</tbody></table>
            )}
            {err && <p className="error small">{err}</p>}
          </Panel>
        </div>
      </div>
      <Panel title="Player development">
        <SortTable key={kind} cols={cols} rows={data.players} initial={kind === "camp" ? ["pos", 1] : ["phase", -1]} rowClass={(p) => (data.lab[p.pid] ? "mine" : "")} />
      </Panel>
    </div>
  );
}
