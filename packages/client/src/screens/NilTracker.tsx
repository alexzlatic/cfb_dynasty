import { useMemo, useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type NilData } from "../api.ts";
import { Stat } from "../charts.tsx";
import { SortTable, type Col } from "../sort.tsx";
import { Logo, money } from "../util.tsx";
import { Panel } from "./common.tsx";
import { recruitStars } from "./ratings.tsx";

type Recruit = NilData["recruits"][number];
type RosterRow = NilData["roster"][number];
const POS_ORDER = ["QB", "RB", "WR", "TE", "OL", "DE", "DT", "LB", "CB", "S", "K", "P", "LS"];
const CLASS_ORDER = ["FR", "SO", "JR", "SR", "GR"];
const NIL_WORDS: Record<string, string> = { waiting: "Offer out", agreed: "Agreed", countered: "Countered", done: "Talks over", pulled: "Pulled" };

/** One line of a summary: offers, commits and NIL money for a group of recruits. */
interface Group { key: string; label: string; order: number; offers: number; commits: number; out: number; out_n: number; agreed: number; agreed_n: number; locked: number; value: number }
function group(rows: Recruit[], me: number, keyOf: (r: Recruit) => string, order: (k: string) => number, label = (k: string) => k): Group[] {
  const by = new Map<string, Group>();
  for (const r of rows) {
    const k = keyOf(r);
    const g = by.get(k) ?? by.set(k, { key: k, label: label(k), order: order(k), offers: 0, commits: 0, out: 0, out_n: 0, agreed: 0, agreed_n: 0, locked: 0, value: 0 }).get(k)!;
    if (r.offered) g.offers++;
    const mine = r.commit?.team_id === me;
    if (mine) g.commits++;
    if (r.nil?.status === "waiting") { g.out += r.nil.amount; g.out_n++; }
    if (r.agreed && (!r.commit || mine)) { g.agreed += r.agreed.amount; g.agreed_n++; if (mine) g.locked += r.agreed.amount; }
    if (mine) g.value += r.value;
  }
  return [...by.values()].sort((a, b) => a.order - b.order);
}

const groupCols = (first: string): Col<Group>[] => [
  { key: "key", label: first, cell: (g) => <b>{g.label}</b>, by: (g) => g.order, asc: true },
  { key: "offers", label: "Offers", className: "num", title: "Scholarship offers out", cell: (g) => g.offers || "", by: (g) => g.offers },
  { key: "commits", label: "Commits", className: "num", cell: (g) => g.commits || "", by: (g) => g.commits },
  { key: "out", label: "NIL offered", className: "num", title: "NIL offers waiting for an answer (a year)", cell: (g) => (g.out_n ? <>{money(g.out)} <span className="muted small">({g.out_n})</span></> : ""), by: (g) => g.out },
  { key: "agreed", label: "NIL agreed", className: "num", title: "Deals recruits have agreed to (a year), not counting any who committed elsewhere", cell: (g) => (g.agreed_n ? <>{money(g.agreed)} <span className="muted small">({g.agreed_n})</span></> : ""), by: (g) => g.agreed },
  { key: "locked", label: "Committed money", className: "num", title: "Agreed deals with recruits committed to you: theirs when they enroll", cell: (g) => (g.locked ? <b>{money(g.locked)}</b> : ""), by: (g) => g.locked },
  { key: "avg", label: "Avg deal", className: "num", cell: (g) => (g.agreed_n ? money(g.agreed / g.agreed_n) : ""), by: (g) => (g.agreed_n ? g.agreed / g.agreed_n : null) },
  { key: "value", label: "Commits' value", className: "num", title: "What your commits are worth a year on the market", cell: (g) => (g.value ? money(g.value) : ""), by: (g) => g.value },
];

/**
 * NIL and offers at a glance: next season's roster budget with what your recruits have agreed to, every
 * offer and NIL talk by class and by position, and this season's roster pay by position and class.
 */
export function NilTracker() {
  const { id, state, team } = useLeague();
  const d = useData(() => api.nil(id), [state.date]);
  const [cls, setCls] = useState<number | "all">("all");
  const me = state.user_team_id;
  const recruits = useMemo(() => (d?.available ? d.recruits.filter((r) => cls === "all" || r.cls === cls) : []), [d, cls]);
  if (!d) return <p className="muted">Loading...</p>;
  if (!d.available || me == null) return <Panel title="NIL tracker"><p className="muted">You need a team and a league with recruiting.</p></Panel>;
  const classes = [...new Set(d.recruits.map((r) => r.cls))].sort();
  const byClass = group(d.recruits, me, (r) => String(r.cls), Number);
  const byPos = group(recruits, me, (r) => r.pos, (k) => POS_ORDER.indexOf(k));
  const talks = recruits.filter((r) => r.nil || r.agreed || r.offered || r.commit?.team_id === me);
  const next = d.next, pool = d.pool;
  const out = d.recruits.filter((r) => r.nil?.status === "waiting").reduce((a, r) => a + r.nil!.amount, 0);
  return (
    <div>
      <div className="stats-row">
        <Stat label={`${d.year} roster pool`} value={pool ? money(pool.signed) : "—"} note={pool ? `paid of ${money(pool.total)} · ${money(pool.room)} left` : undefined} />
        <Stat label={`${d.year + 1} budget committed`} value={money(next.committed)} note={`of ${money(next.total)} · ${money(next.total - next.committed)} left`} />
        <Stat label={`${d.year + 1} recruits' NIL`} value={money(next.recruits)} note="agreed with seniors, theirs when they enroll" />
        <Stat label="NIL offers out" value={money(out)} note="waiting for answers (a year)" />
      </div>
      <Panel title="Recruits by class">
        <div className="scrollx"><SortTable rows={byClass} rowKey={(g) => g.key} cols={groupCols("Class")} /></div>
      </Panel>
      <Panel title="Recruits by position" right={<span className="seg">
        <button className={cls === "all" ? "on" : ""} onClick={() => setCls("all")}>All classes</button>
        {classes.map((c) => <button key={c} className={cls === c ? "on" : ""} onClick={() => setCls(c)}>{c}</button>)}</span>}>
        <div className="scrollx"><SortTable rows={byPos} rowKey={(g) => g.key} cols={groupCols("Pos")} /></div>
      </Panel>
      <Panel title={`Every offer and NIL talk${cls === "all" ? "" : ` · ${cls}`}`} right={<span className="small muted">{talks.length} recruits</span>}>
        {talks.length ? <div className="scrollx"><SortTable rows={talks} rowKey={(r) => r.pid} rowClass={(r) => (r.commit?.team_id === me ? "mine" : undefined)} cols={[
          { key: "name", label: "Recruit", cell: (r) => <a href={`#/l/${id}/pitch/${r.pid}`} className="pname">{r.name}</a>, by: (r) => r.name, asc: true },
          { key: "pos", label: "Pos", cell: (r) => <span className="pos">{r.pos}</span>, by: (r) => POS_ORDER.indexOf(r.pos), asc: true },
          { key: "cls", label: "Class", className: "num", cell: (r) => r.cls, by: (r) => r.cls, asc: true },
          { key: "stars", label: "Stars", cell: (r) => recruitStars(r.stars), by: (r) => r.rank ?? 99999, asc: true },
          { key: "status", label: "Status", cell: (r) => (r.commit ? <span className="nowrap"><Logo team={team(r.commit.team_id)} size={18} /> {r.commit.signed ? "Signed" : "Verbal"}</span> : <span className="muted">Open</span>), by: (r) => (r.commit?.team_id === me ? 0 : r.commit ? 2 : 1), asc: true },
          { key: "offer", label: "Offer", cell: (r) => (r.offered ? "Yes" : ""), by: (r) => (r.offered ? 1 : 0) },
          { key: "nil", label: "NIL talks", cell: (r) => (r.nil ? <span className={"nilword " + r.nil.status}>{NIL_WORDS[r.nil.status]}{r.nil.status === "countered" && r.nil.counter != null ? `: wants ${money(r.nil.counter)}` : ""}</span> : ""), by: (r) => r.nil?.status },
          { key: "amount", label: "A year", className: "num", cell: (r) => (r.agreed ? money(r.agreed.amount) : r.nil?.status === "waiting" ? <span className="muted">{money(r.nil.amount)}</span> : ""), by: (r) => r.agreed?.amount ?? r.nil?.amount },
          { key: "years", label: "Seasons", className: "num", cell: (r) => r.agreed?.years ?? (r.nil?.status === "waiting" ? r.nil.years : ""), by: (r) => r.agreed?.years },
          { key: "value", label: "Value", className: "num", title: "His market value a year", cell: (r) => money(r.value), by: (r) => r.value },
        ]} /></div> : <p className="muted">No offers or NIL talks{cls === "all" ? "" : ` in the ${cls} class`} yet. Open a prospect's pitch page to make one.</p>}
      </Panel>
      <RosterPay rows={d.roster} />
    </div>
  );
}

/** This season's roster pay (revenue share and NIL) by position and by class. */
function RosterPay({ rows }: { rows: RosterRow[] }) {
  const sum = (key: (r: RosterRow) => string, order: string[]) => {
    const by = new Map<string, { key: string; n: number; paid: number; rs: number; nil: number; top: RosterRow | null }>();
    for (const r of rows) {
      const k = key(r), g = by.get(k) ?? by.set(k, { key: k, n: 0, paid: 0, rs: 0, nil: 0, top: null }).get(k)!;
      g.n++; g.rs += r.revenue_share; g.nil += r.nil;
      if (r.revenue_share + r.nil > 0) g.paid++;
      if (!g.top || r.revenue_share + r.nil > g.top.revenue_share + g.top.nil) g.top = r;
    }
    return [...by.values()].sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
  };
  const total = rows.reduce((a, r) => a + r.revenue_share + r.nil, 0) || 1;
  const cols = (first: string, order: string[]): Col<ReturnType<typeof sum>[number]>[] => [
    { key: "key", label: first, cell: (g) => <b>{g.key}</b>, by: (g) => order.indexOf(g.key), asc: true },
    { key: "n", label: "Players", className: "num", cell: (g) => `${g.paid}/${g.n}`, by: (g) => g.n },
    { key: "rs", label: "Rev. share", className: "num", cell: (g) => money(g.rs), by: (g) => g.rs },
    { key: "nil", label: "NIL", className: "num", cell: (g) => money(g.nil), by: (g) => g.nil },
    { key: "total", label: "Total", className: "num", cell: (g) => <b>{money(g.rs + g.nil)}</b>, by: (g) => g.rs + g.nil },
    { key: "share", label: "Share", className: "num", cell: (g) => `${Math.round(((g.rs + g.nil) / total) * 100)}%`, by: (g) => g.rs + g.nil },
    { key: "top", label: "Top paid", cell: (g) => (g.top && g.top.revenue_share + g.top.nil > 0 ? <span className="small nowrap">{g.top.name} {money(g.top.revenue_share + g.top.nil)}</span> : ""), by: (g) => (g.top ? g.top.revenue_share + g.top.nil : 0) },
  ];
  return (
    <div className="cols even">
      <Panel title="This season's roster pay by position"><div className="scrollx"><SortTable rows={sum((r) => r.pos, POS_ORDER)} rowKey={(g) => g.key} cols={cols("Pos", POS_ORDER)} /></div></Panel>
      <Panel title="By class"><div className="scrollx"><SortTable rows={sum((r) => r.cls, CLASS_ORDER)} rowKey={(g) => g.key} cols={cols("Class", CLASS_ORDER)} /></div></Panel>
    </div>
  );
}
