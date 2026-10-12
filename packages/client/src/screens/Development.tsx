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

const PHASES = [["offseason", "Offseason"], ["camp", "Fall camp"], ["season", "In season"]] as const;

/**
 * Your staff's hint of how a player is developing this year against a normal year for his class (plus his
 * plan). Only the hint shows: what he has gained lands in his rating at the rollover. `read` is how far into
 * the development year we are; the spread of a year's surprise grows with it.
 */
export function devHint(ahead: number | undefined, read: number): { text: string; tone: string; rank: number } {
  if (ahead == null || read < 0.05) return { text: "No read yet", tone: "muted", rank: 0 };
  const z = ahead / Math.max(0.6, 3 * read);
  if (z >= 1.5) return { text: "▲▲ Well ahead", tone: "win", rank: 2 };
  if (z >= 0.4) return { text: "▲ Ahead", tone: "win", rank: 1 };
  if (z <= -1.5) return { text: "▼▼ Well behind", tone: "loss", rank: -2 };
  if (z <= -0.4) return { text: "▼ Behind", tone: "loss", rank: -1 };
  return { text: "On track", tone: "muted", rank: 0 };
}

/** A week-to-week move on the staff's read, in words. */
function trendWord(x: number): { text: string; tone: string } {
  if (x >= 1) return { text: "▲▲ Surging", tone: "win" };
  if (x > 0) return { text: "▲ Rising", tone: "win" };
  if (x <= -1) return { text: "▼▼ Falling", tone: "loss" };
  return { text: "▼ Slipping", tone: "loss" };
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
  const hint = (p: DevPlayer) => devHint(p.ahead, data.read);
  const Hint = ({ p }: { p: DevPlayer }) => { const h = hint(p); return <span className={h.tone + " nowrap"}>{h.text}</span>; };
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
    // Position battles: at each position, the weakest starter against the best backup.
    const groups = new Map<string, { st: DevPlayer[]; bk: DevPlayer[] }>();
    for (const p of data.players) { const g = groups.get(p.pos) ?? { st: [], bk: [] }; (p.starter ? g.st : g.bk).push(p); groups.set(p.pos, g); }
    const battles = [...groups].filter(([pos, g]) => g.st.length && g.bk.length && !["K", "P", "LS"].includes(pos)).map(([pos, g]) => {
      const st = g.st.reduce((a, b) => (b.ovr < a.ovr ? b : a)), ch = g.bk.reduce((a, b) => (b.ovr > a.ovr || (b.ovr === a.ovr && hint(b).rank > hint(a).rank) ? b : a));
      // A backup developing faster than the starter makes it more of a battle than the ratings say.
      return { pos, st, ch, gap: st.ovr - ch.ovr, edge: hint(ch).rank - hint(st).rank };
    }).filter((b) => b.gap <= 3).sort((a, b) => a.gap - b.gap || posRank(a.pos) - posRank(b.pos));
    phasePanel = (
      <Panel title="Position battles">
        <p className="small muted">Fall camp is when starting jobs are won. These backups are within three points of a starter at their position, or ahead of him. A backup who is developing faster than the starter may be closer than the ratings say. Make the call on the depth chart.</p>
        {!battles.length ? <p className="muted small">No close battles: every starter is clearly ahead of his backups.</p> : (
          <table className="grid tight"><thead><tr><th>Pos</th><th>Starter</th><th className="num">Ovr</th><th>Development</th><th>Challenger</th><th className="num">Ovr</th><th>Development</th><th>Verdict</th></tr></thead>
            <tbody>{battles.map((b) => (
              <tr key={b.pos}><td>{b.pos}</td>
                <td><a href={`#/l/${id}/player/${b.st.pid}`}>{b.st.name}</a> <span className="muted small">{b.st.class}</span></td><td className="num">{b.st.ovr}</td><td><Hint p={b.st} /></td>
                <td><a href={`#/l/${id}/player/${b.ch.pid}`}>{b.ch.name}</a> <span className="muted small">{b.ch.class}</span></td><td className="num">{b.ch.ovr}</td><td><Hint p={b.ch} /></td>
                <td className={b.gap < 0 ? "loss" : b.gap <= 1 || b.edge > 0 ? "" : "muted"}>{b.gap < 0 ? "Backup is rated higher: your call" : b.gap <= 1 ? "Dead even" : b.edge > 0 ? "Backup is closing in" : "Starter holding on"}</td></tr>
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
        <td className={trendWord(p.trend!).tone + " nowrap"}>{trendWord(p.trend!).text}</td></tr>)}</tbody></table>
    );
    phasePanel = (
      <Panel title="Trending this season">
        {data.done ? <p className="small muted">This year's development is done (it tops out by mid-November). What each player gained shows up in his ratings when the season rolls over, and your staff sends you the new ratings that day; from here practice is about getting ready for the next game.</p>
          : <p className="small muted">In season, practice is mostly about the next opponent, so growth is small: the last 15% or so of the year's work. Trending is who your staff sees moving faster or slower than a normal week's growth {data.trend_since ? `since ${shortDate(data.trend_since)}` : "over the last few weeks"}.</p>}
        {data.weeks === 0 && !data.done ? <p className="muted small">The first weekly read comes on Monday.</p> : (
          <div className="cols even"><div><h4>Trending up</h4>{list(up)}</div><div><h4>Trending down</h4>{list(down)}</div></div>
        )}
      </Panel>
    );
  } else {
    const top = [...data.players].filter((p) => hint(p).rank > 0).sort((a, b) => b.ahead - a.ahead).slice(0, 5);
    phasePanel = (
      <Panel title="Ahead of schedule this offseason">
        <p className="small muted">Spring practice (March and April) and summer workouts are the biggest growth period of the year: about half of a player's yearly growth comes before fall camp. Plans set now get the most days of work.</p>
        {data.read < 0.05 ? <p className="muted small">Spring practice opens March 1; nobody has started yet.</p> : !top.length ? <p className="muted small">Nobody is clearly ahead of schedule yet.</p> : (
          <table className="grid tight"><tbody>{top.map((p) => <tr key={p.pid}><td><a href={`#/l/${id}/player/${p.pid}`}>{p.name}</a> <span className="muted small">{p.pos}, {p.class}</span></td>
            <td className="muted small">{data.areas[p.focus.area]}</td><td><Hint p={p} /></td></tr>)}</tbody></table>
        )}
      </Panel>
    );
  }

  // ---- every player: what he's working on and how far he has come ----
  const cols: Col[] = [
    { key: "name", label: "Player", sort: (p) => p.name, cell: (p) => <><a href={`#/l/${id}/player/${p.pid}`}>{p.name}</a>{p.starter ? "" : <span className="muted small"> backup</span>}</> },
    { key: "pos", label: "Pos", sort: (p) => posRank(p.pos) * 1000 - p.ovr, cell: (p) => p.pos },
    { key: "class", label: "Class", sort: (p) => p.years, cell: (p) => <span className="muted">{p.class}</span> },
    { key: "ovr", label: "Ovr", num: true, title: "His rating: what plays in games and what everyone sees. It moves once a year, at the rollover.", sort: (p) => p.ovr, cell: (p) => p.ovr },
    { key: "dev", label: "Development", title: "Your staff's hint of how he is developing this year against a normal year for his class (and his plan). What he gains shows up in his rating at the rollover.",
      sort: (p) => hint(p).rank * 100 + p.ahead, cell: (p) => <Hint p={p} /> },
    { key: "focus", label: "Working on", sort: (p) => p.focus.area, cell: (p) => (
      <span>{data.areas[p.focus.area]}{p.focus.by === "staff" && <span className="muted small"> (staff)</span>}
        {p.focus.attrs.length > 0 && <div className="muted small">{p.focus.attrs.map((a) => `${a.label} ${a.value}`).join(", ")}</div>}</span>) },
    ...(kind === "season" ? [
      { key: "gp", label: "GP", num: true, title: "Games played: game snaps are reps too", sort: (p: DevPlayer) => p.gp, cell: (p: DevPlayer) => p.gp },
    ] : []),
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
        <p className="small muted">Ratings move once a year, at the rollover in February, and your staff sends you the new ratings that day. Until then your staff gives you a hint of how each player is developing: ahead of, on track with, or behind a normal year for his class (young players grow fastest) plus any individual plan. Players who are ahead, and players on an individual plan, already play a little better than their rating says; players who are behind, a little worse.</p>
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
        <SortTable key={kind} cols={cols} rows={data.players} initial={kind === "camp" ? ["pos", 1] : ["dev", -1]} rowClass={(p) => (data.lab[p.pid] ? "mine" : "")} />
      </Panel>
    </div>
  );
}
