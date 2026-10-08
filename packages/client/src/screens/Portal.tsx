import { useMemo, useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type PortalData, type PortalRow } from "../api.ts";
import { Logo, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";
import { POS_ORDER, Rating } from "./Players.tsx";

type Show = "open" | "mine" | "from_me" | "done";

/** Your bid and pitch controls for one entrant. */
function Bid({ r, data, compact = false }: { r: PortalRow; data?: PortalData | null; compact?: boolean }) {
  const { id, state } = useLeague();
  const [amount, setAmount] = useState(String(Math.round((r.mine?.amount ?? r.ask) / 1000)));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (state.user_team_id == null || r.status !== "open") return null;
  const act = async (type: string, payload: unknown) => {
    setBusy(true); setErr(null);
    try { await api.act(id, type, payload); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const k = Math.round(Number(amount) * 1000);
  return (
    <span className="nowrap">
      $<input className="num" style={{ width: "5em" }} value={amount} onChange={(e) => setAmount(e.target.value)} />K{" "}
      <button className={r.mine ? "" : "primary"} disabled={busy || !Number.isFinite(k)} onClick={() => act("portal_offer", { pid: r.pid, amount: k, years: 1 })}>{r.mine ? "Change" : "Offer"}</button>
      {r.mine && <button className="link small" disabled={busy} onClick={() => act("portal_offer", { pid: r.pid, amount: 0, years: 1 })}>Withdraw</button>}
      {" "}<button className="link small" disabled={busy || r.pitched_today || (data != null && data.pitches_left <= 0)} title="A pitch call builds his interest in your school (six a day)" onClick={() => act("portal_pitch", { pid: r.pid })}>
        {r.pitched_today ? "Called today" : `Pitch${r.pitches ? ` (${r.pitches})` : ""}`}</button>
      {!compact && err && <div className="error small">{err}</div>}
      {compact && err && <span className="error small"> {err}</span>}
    </span>
  );
}

/** Where he's leaning: his chance of picking each school if he chose today. */
function Leaning({ r }: { r: PortalRow }) {
  const { team, state } = useLeague();
  if (r.status === "committed") return <span><Logo team={team(r.to!)} size={16} /> {team(r.to!)?.school}</span>;
  if (r.status === "none") return <span className="muted">No school</span>;
  if (!r.top.length) return <span className="muted">No offers yet</span>;
  return <span className="leaning">{r.top.slice(0, 3).map((x) => (
    <span key={x.team_id} className={x.team_id === state.user_team_id ? "mine" : ""} title={team(x.team_id)?.school}><Logo team={team(x.team_id)} size={16} /> {x.share}%</span>
  ))}</span>;
}

/** The player page's Portal tab: why he left, his ask, who's in on him and your bid. */
export function PortalCard({ row: r }: { row: PortalRow }) {
  const { id, team, state } = useLeague();
  return (
    <div className="cols even">
      <Panel title="In the transfer portal" right={<a href={`#/l/${id}/portal`}>The portal</a>}>
        <table className="grid tight"><tbody>
          <tr><td>From</td><td><Logo team={team(r.from)} size={16} /> {team(r.from)?.school}, entered {shortDate(r.entered)}</td></tr>
          <tr><td>Why he left</td><td>{r.reasons.join(", ") || "Not saying"}</td></tr>
          <tr><td>Asking</td><td className="num">{money(r.ask)} a year</td></tr>
          <tr><td>Next season</td><td>{r.next} overall (potential {r.potential.est})</td></tr>
          <tr><td>Offers</td><td>{r.offers}</td></tr>
          {r.costs_season && <tr><td></td><td className="loss small">A second transfer: he'd lose a season of eligibility.</td></tr>}
        </tbody></table>
        {state.user_team_id != null && r.status === "open" && <p>Your offer: <Bid r={r} /></p>}
      </Panel>
      <Panel title="Where he's leaning">
        {r.status !== "open" ? <Leaning r={r} /> : r.top.length ? (
          <table className="grid tight"><tbody>{r.top.map((x) => (
            <tr key={x.team_id} className={x.team_id === state.user_team_id ? "mine" : ""}><td><Logo team={team(x.team_id)} size={16} /> {team(x.team_id)?.school}</td><td className="num">{x.share}%</td></tr>
          ))}</tbody></table>
        ) : <p className="muted">No offers yet.</p>}
        <p className="small muted">His chance of picking each school if he chose today, from money against his ask, playing time, development, winning, home and your pitch calls.</p>
      </Panel>
    </div>
  );
}

/** Recruiting > Transfer portal: everyone in it, what you still need, your budget and your bids. */
export function PortalScreen() {
  const { id, state, team } = useLeague();
  const data = useData(() => api.portal(id), [state.date]);
  const [show, setShow] = useState<Show>("open");
  const [pos, setPos] = useState<string>("");
  const [needOnly, setNeedOnly] = useState(false);
  const me = state.user_team_id;
  const rows = useMemo(() => {
    const all = data?.entries ?? [];
    const by = show === "mine" ? all.filter((r) => r.mine) : show === "from_me" ? all.filter((r) => r.from === me) : show === "done" ? all.filter((r) => r.status !== "open") : all.filter((r) => r.status === "open");
    return by.filter((r) => (!pos || r.pos === pos) && (!needOnly || (data?.needs[r.pos] && r.next >= data.needs[r.pos].floor))).sort((a, b) => b.next - a.next || a.pid - b.pid);
  }, [data, show, pos, needOnly, me]);
  if (!data) return <p className="muted">Loading...</p>;
  if (!data.open && !data.entries.length) {
    return <Panel title="Transfer portal"><p className="muted">The portal opens {data.window ? shortDate(data.window) : "January 2"}, after renewal talks. Players whose school's season is still going enter the day after their last game.</p></Panel>;
  }
  const b = data.budget, left = b ? b.total - b.committed - data.offered : 0;
  const needs = POS_ORDER.filter((p) => data.needs[p]);
  return (
    <div>
      <div className="cols even">
        {me != null && <Panel title="What you need next season" right={<span className="small muted">by position</span>}>
          {needs.length ? <div className="needs-grid">{needs.map((p) => {
            const n = data.needs[p];
            return <button key={p} className={"need" + (pos === p ? " on" : "") + (n.starter ? " starter" : "")} onClick={() => setPos(pos === p ? "" : p)} title={`${n.spots} spot${n.spots === 1 ? "" : "s"}; worth it at ${n.floor}+ next season`}>
              <b>{p}</b><span>{n.starter ? "Starter" : `${n.spots} spot${n.spots === 1 ? "" : "s"}`}</span></button>;
          })}</div> : <p className="muted">Your roster is full.</p>}
          <p className="small muted">Counted from returning players, your signed recruits and transfers already in. Click a position to filter.</p>
        </Panel>}
        {b && <Panel title="Your money">
          <table className="grid tight"><tbody>
            <tr><td>Next season's budget</td><td className="num">{money(b.total)}</td></tr>
            <tr><td>Committed (renewals, deals, transfers in)</td><td className="num">{money(b.committed)}</td></tr>
            <tr><td>Out in offers</td><td className="num">{money(data.offered)}</td></tr>
            <tr><td><b>Left to offer</b></td><td className="num"><b>{money(left)}</b></td></tr>
          </tbody></table>
          <p className="small muted">{data.pitches_left} pitch calls left today. Players with offers commit slowly at first and faster as the window runs; anyone without a school by signing day leaves college football.</p>
        </Panel>}
      </div>
      <Panel title={`Transfer portal: ${data.entries.filter((r) => r.status === "open").length} open, ${data.entries.filter((r) => r.status === "committed").length} committed`} right={<span className="seg small">
        {(["open", "mine", "from_me", "done"] as const).filter((k) => me != null || k === "open" || k === "done").map((k) => <button key={k} className={show === k ? "on" : ""} onClick={() => setShow(k)}>
          {k === "open" ? "Available" : k === "mine" ? `Your offers (${data.entries.filter((r) => r.mine).length})` : k === "from_me" ? `From ${me != null ? team(me)?.school : ""} (${data.entries.filter((r) => r.from === me).length})` : "Decided"}</button>)}</span>}>
        <div className="filters small">
          <select value={pos} onChange={(e) => setPos(e.target.value)}><option value="">All positions</option>{POS_ORDER.map((p) => <option key={p}>{p}</option>)}</select>
          {me != null && <label><input type="checkbox" checked={needOnly} onChange={(e) => setNeedOnly(e.target.checked)} /> Only players who fill a need</label>}
          <span className="muted">{rows.length} players</span>
        </div>
        <table className="grid tight">
          <thead><tr><th>Player</th><th>From</th><th className="num" title="Overall now">Ovr</th><th className="num" title="Expected overall next season">Next</th><th>Why he left</th><th className="num">Asks</th><th className="num">Offers</th><th>Leaning</th>{me != null && show !== "done" && <th>Your bid</th>}</tr></thead>
          <tbody>{rows.slice(0, 300).map((r) => (
            <tr key={r.pid} className={r.mine ? "mine" : ""}>
              <td><a href={`#/l/${id}/player/${r.pid}`}>{r.name}</a> <span className="muted small">{r.pos} · {r.cls}{r.stars ? ` · ${"★".repeat(r.stars)}` : ""}</span>{r.costs_season && <span className="tag" title="A second transfer costs him a season">-1 yr</span>}</td>
              <td className="nowrap"><Logo team={team(r.from)} size={16} /> {team(r.from)?.school}</td>
              <td className="num"><Rating v={r.ovr} /></td><td className="num">{r.next}</td>
              <td className="small">{r.reasons.join(", ")}</td>
              <td className="num">{money(r.ask)}</td><td className="num">{r.offers}</td>
              <td className="small"><Leaning r={r} /></td>
              {me != null && show !== "done" && <td><Bid r={r} data={data} compact /></td>}
            </tr>
          ))}</tbody>
        </table>
        {rows.length > 300 && <p className="muted small">Showing the top 300; filter by position to see more.</p>}
      </Panel>
    </div>
  );
}
