import { Fragment, useMemo, useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type FrontOfficeData, type SalaryCell } from "../api.ts";
import { Logo, money } from "../util.tsx";
import { Panel } from "./common.tsx";

type Tab = "salaries" | "projections" | "history";
const fy = (y: number) => `${y}-${String(y + 1).slice(2)}`;
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, x) => a + x, 0);
const pct = (x: number) => `${x >= 1 ? "+" : ""}${Math.round((x - 1) * 100)}%`;

/** The front office: salaries by season, roster budgets ahead, projected budgets and the money history. */
export function FrontOfficeScreen({ tid }: { tid?: number }) {
  const { id, state, team } = useLeague();
  const data = useData(() => api.frontOffice(id, tid), [state.date, tid]);
  const [tab, setTab] = useState<Tab>("salaries");
  if (!data) return <p className="muted">Loading...</p>;
  if (data.team_id == null) return <Panel title="Front office"><p className="muted">This school has no football budget in the game.</p></Panel>;
  const t = team(data.team_id);
  return (
    <div>
      <Panel title={<><Logo team={t} size={22} /> {t?.school} front office</>} right={<span className="seg small">
        {(["salaries", "projections", "history"] as const).map((k) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{k === "salaries" ? "Salaries" : k === "projections" ? "Projections" : "History"}</button>)}</span>}>
        <Outlook d={data} />
      </Panel>
      {tab === "salaries" && <Salaries d={data} />}
      {tab === "projections" && <Projections d={data} />}
      {tab === "history" && <History d={data} />}
    </div>
  );
}

/** The headline: budget class now and next year, and how this season is moving the program's money. */
function Outlook({ d }: { d: FrontOfficeData }) {
  const f = d.fortune;
  const moved = d.class.now && d.class.now.key !== d.class.next.key;
  return (
    <div>
      <p>Budget class: <b>{d.class.now?.label ?? "-"}</b>{moved ? <> → <b className={d.totals[1].budget >= d.totals[0].budget ? "win" : "loss"}>{d.class.next.label}</b> next season on this season's results</> : <span className="muted"> (holding next season)</span>}.
        {" "}{d.record.w}-{d.record.l} against {d.record.exp} expected wins; football's revenue is running at {Math.round(d.record.ratio * 100)}% of budget.</p>
      <table className="grid tight"><thead><tr><th></th><th className="num">Now</th><th className="num">Next season</th><th>What it moves</th></tr></thead><tbody>
        <tr><td>Fans</td><td className="num">{pct(f.now.fans)}</td><td className="num">{pct(f.next.fans)}</td><td className="small muted">The usual home crowd (winning and a playoff berth fill seats)</td></tr>
        <tr><td>Donors</td><td className="num">{pct(f.now.donors)}</td><td className="num">{pct(f.next.donors)}</td><td className="small muted">Booster giving and your collective (winning beyond expectations, playoff runs)</td></tr>
        <tr><td>Athletic department</td><td className="num">{pct(f.now.ad)}</td><td className="num">{pct(f.next.ad)}</td><td className="small muted">Revenue share for football, up to the cap (football beating its budget)</td></tr>
      </tbody></table>
      {(d.postseason.own > 0 || d.postseason.pooled > 0) && <p className="small">Postseason money this year: {money(d.postseason.own)} from your own games and {money(d.postseason.pooled)} as your share of what the {d.conference} pooled.</p>}
    </div>
  );
}

const CELL_CLASS: Record<SalaryCell["kind"], string> = { paid: "", signed: "", locked: "", est: "muted", gone: "muted" };

/** Every player's pay by season, like OOTP's salaries page: what's signed, what's locked, what keeping him would likely cost. */
function Salaries({ d }: { d: FrontOfficeData }) {
  const { id } = useLeague();
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "y0", dir: -1 });
  const rows = useMemo(() => {
    const k = sort.key;
    const val = (p: FrontOfficeData["players"][number]): number | string => (k === "name" ? p.name : k === "pos" ? p.pos : k === "ovr" ? p.ovr : k === "value" ? p.value : k === "last" ? p.last
      : p.cells[Number(k.slice(1))].kind === "gone" ? -1 : p.cells[Number(k.slice(1))].amount);
    return [...d.players].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir || b.value - a.value; });
  }, [d, sort]);
  const th = (key: string, label: React.ReactNode, num = false) => (
    <th className={(num ? "num " : "") + "sortable"} onClick={() => setSort({ key, dir: sort.key === key ? (-sort.dir as 1 | -1) : num ? -1 : 1 })}>
      {label}{sort.key === key ? (sort.dir < 0 ? " ▾" : " ▴") : ""}</th>
  );
  return (
    <div>
      <Panel title="Roster budget by season">
        <table className="grid tight"><thead><tr><th></th>{d.totals.map((x) => <th key={x.year} className="num">{fy(x.year)}</th>)}</tr></thead><tbody>
          <tr><td>Roster budget{" "}<span className="muted small">(revenue share and boosters; later years projected)</span></td>{d.totals.map((x) => <td key={x.year} className="num">{money(x.budget)}</td>)}</tr>
          <tr><td>Committed (paid, signed, locked)</td>{d.totals.map((x) => <td key={x.year} className="num">{money(x.committed)}</td>)}</tr>
          <tr><td>Keeping everyone else <span className="muted small">(estimate at your pay rate)</span></td>{d.totals.map((x) => <td key={x.year} className="num muted">{x.est ? money(x.est) : ""}</td>)}</tr>
          <tr><td><b>Room</b></td>{d.totals.map((x) => <td key={x.year} className={"num " + (x.room < 0 ? "loss" : "win")}><b>{money(x.room)}</b></td>)}</tr>
        </tbody></table>
        <p className="small muted">Room is what's left for recruits, transfers and raises once everyone you'd keep is paid. Next season's budget moves with this season's results (fans, donors, your AD); later seasons grow with the revenue-share cap.</p>
      </Panel>
      <Panel title="Salaries">
        <table className="grid tight">
          <thead><tr>{th("name", "Player")}{th("pos", "Pos")}{th("ovr", "Ovr", true)}{th("value", "Value", true)}{d.years.map((y, i) => <Fragment key={y}>{th(`y${i}`, fy(y), true)}</Fragment>)}{th("last", "Eligible through", true)}</tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.pid}>
              <td><a href={`#/l/${id}/player/${p.pid}`}>{p.name}</a> <span className="muted small">{p.cls}</span>{p.nfl && <span className="small loss" title="Projected to go in the first 100 picks: he may leave for the NFL"> NFL?</span>}</td>
              <td className="muted">{p.pos}</td><td className="num">{p.ovr}</td><td className="num">{money(p.value)}</td>
              {p.cells.map((c, i) => <td key={i} className={"num " + CELL_CLASS[c.kind]} title={c.kind === "est" ? "Estimate: what keeping him would likely cost" : c.kind === "locked" ? "Locked multi-year deal" : c.kind === "signed" ? "Signed (renegotiated each winter)" : ""}>
                {c.kind === "gone" ? "" : c.kind === "est" ? <i>{money(c.amount)}</i> : <>{money(c.amount)}{c.kind === "locked" ? " 🔒" : ""}</>}</td>)}
              <td className="num muted">{fy(p.last)}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="small muted">Plain numbers are paid or signed; 🔒 marks a multi-year deal he agreed to (no renegotiating until it ends); <i>italic</i> numbers are estimates of what keeping him would cost at what you pay for value now. Blank: out of eligibility.</p>
      </Panel>
    </div>
  );
}

/** Football's budget this year and projected for the next two. */
function Projections({ d }: { d: FrontOfficeData }) {
  const line = (title: string, key: "revenue" | "expenses", labels: Record<string, string>) => (
    <>
      <tr><th>{title}</th>{d.lines.map((l) => <th key={l.year} className="num">{money(sum(l[key]))}</th>)}</tr>
      {Object.keys(d.lines[0][key]).map((k) => <tr key={k}><td>{labels[k] ?? k}</td>{d.lines.map((l) => <td key={l.year} className={"num" + (l.projected ? " muted" : "")}>{money(l[key][k] ?? 0)}</td>)}</tr>)}
    </>
  );
  return (
    <Panel title="Football budget, projected">
      <table className="grid tight">
        <thead><tr><th></th>{d.lines.map((l) => <th key={l.year} className="num">{fy(l.year)}{l.projected ? " (projected)" : ""}</th>)}</tr></thead>
        <tbody>
          {line("Revenue", "revenue", d.labels.revenue)}
          {line("Expenses", "expenses", d.labels.expenses)}
          <tr><td><b>Surplus (deficit)</b></td>{d.lines.map((l) => <td key={l.year} className={"num " + (l.surplus >= 0 ? "win" : "loss")}><b>{money(l.surplus)}</b></td>)}</tr>
        </tbody>
      </table>
      <p className="small muted">Projections assume a typical season from here: no postseason money until it's earned, crowds and giving at next season's projected fortune, and the revenue-share cap growing 4% a year.
        Bowls and playoff rounds pay by game; your conference pools part of every member's payout and splits it. Your AD gives football more revenue share (up to the cap) when football beats its budget.</p>
    </Panel>
  );
}

/** Past seasons: record, postseason, revenue, crowds, roster budget and class. */
function History({ d }: { d: FrontOfficeData }) {
  if (!d.history.length) return <Panel title="History"><p className="muted">Your first season is still being played: the books close at the end of the season.</p></Panel>;
  return (
    <Panel title="History">
      <table className="grid tight">
        <thead><tr><th>Season</th><th>Record</th><th>Postseason</th><th className="num">Revenue</th><th className="num">Surplus</th><th className="num">Avg crowd</th><th className="num">Roster budget</th><th>Class</th></tr></thead>
        <tbody>{[...d.history].reverse().map((h) => (
          <tr key={h.year}><td>{fy(h.year)}</td><td>{h.w}-{h.l}</td><td className="small">{h.post ?? <span className="muted">none</span>}</td><td className="num">{money(h.revenue)}</td>
            <td className={"num " + (h.surplus < 0 ? "loss" : "")}>{money(h.surplus)}</td><td className="num">{h.attendance ? h.attendance.toLocaleString() : ""}</td><td className="num">{money(h.roster_budget)}</td><td className="small">{h.class}</td></tr>
        ))}</tbody>
      </table>
    </Panel>
  );
}
