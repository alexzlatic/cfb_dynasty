import { useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type ProspectRow, type StaffTimeSplit } from "../api.ts";
import { Logo, heightStr, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";

const GRADES = ["Freshmen", "Sophomores", "Juniors", "Seniors"];
const POS = ["", "QB", "RB", "WR", "TE", "OL", "DE", "DT", "LB", "CB", "S", "K", "P", "LS"];
const VIEWS: [string, string][] = [["all", "Everyone"], ["rated", "Rated by the service"], ["mine", "On your board"], ["committed", "Committed to you"]];
const stars = (n: number) => "★".repeat(n);
const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * Recruiting: four high school classes as your staff sees them, your board (offers, contact hours and
 * scouting trips), your staff's week, regional scouts and the national class rankings.
 */
export function RecruitingScreen() {
  const { id, state, team } = useLeague();
  const [cls, setCls] = useState<number | null>(null);
  const [pos, setPos] = useState("");
  const [region, setRegion] = useState("");
  const [view, setView] = useState("rated");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [time, setTime] = useState<StaffTimeSplit | null>(null);
  const [hours, setHours] = useState<Record<number, string>>({});
  const q: Record<string, string> = { view, limit: "50", offset: String(page * 50) };
  if (cls != null) q.cls = String(cls);
  if (pos) q.pos = pos;
  if (region) q.region = region;
  const data = useData(() => api.recruiting(id, q), [state.date, cls, pos, region, view, page]);
  const ranks = useData(() => api.classRanks(id, cls ?? state.year + 1), [state.date, cls]);
  if (!data) return <p className="muted">Loading...</p>;
  if (!data.available) return <Panel title="Recruiting"><p className="muted">This league has no recruiting.</p></Panel>;
  const me = data.team_id, u = data.settings;
  const act = async (type: string, payload: unknown) => {
    setBusy(true); setErr(null);
    try { await api.act(id, type, payload); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const t = time ?? u.time;
  const tsum = t.recruiting + t.scouting + t.prep || 1;
  const pages = Math.ceil(data.total / 50);
  const filter = (f: () => void) => { f(); setPage(0); };
  return (
    <div>
      {err && <p className="error">{err}</p>}
      <div className="tabs sub">
        {data.classes.map((c) => <a key={c.cls} className={c.cls === data.cls ? "on" : ""} onClick={() => filter(() => setCls(c.cls))}>{c.cls} class <span className="muted small">({GRADES[c.grade]})</span></a>)}
      </div>
      <div className="cols">
        <Panel title={`The ${data.cls} class`} right={<span className="small muted">{data.total} prospects</span>}>
          <div className="row small">
            <select value={view} onChange={(e) => filter(() => setView(e.target.value))}>{VIEWS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>{" "}
            <select value={pos} onChange={(e) => filter(() => setPos(e.target.value))}>{POS.map((p) => <option key={p} value={p}>{p || "All positions"}</option>)}</select>{" "}
            <select value={region} onChange={(e) => filter(() => setRegion(e.target.value))}>
              <option value="">Everywhere</option>
              {Object.entries(data.regions).map(([k, r]) => <option key={k} value={k}>{r.name}</option>)}
            </select>
          </div>
          <table className="grid tight">
            <thead><tr><th className="num">Rk</th><th>Prospect</th><th>Home</th><th>Potential</th><th>Now</th><th>Status</th><th className="num">Offers</th>{me != null && <th>Your board</th>}</tr></thead>
            <tbody>{data.prospects.map((p) => <ProspectLine key={p.id} p={p} me={me} manual={!u.auto} open={open === p.id} onOpen={() => setOpen(open === p.id ? null : p.id)}
              busy={busy} act={act} scouting={u.scout.includes(p.id)} hours={hours[p.id] ?? String(u.hours[p.id] ?? "")} setHours={(v) => setHours({ ...hours, [p.id]: v })} team={team} />)}</tbody>
          </table>
          {pages > 1 && <p className="small">
            <button className="link" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button> page {page + 1} of {pages}{" "}
            <button className="link" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next</button></p>}
          <p className="small muted">Potential is your staff's 90% range for what he'll be on arrival; it narrows every day as he gets older,
            faster near home, in regions where you have a scout and with each evaluation. The service re-rates on May 15, August 1 and December 15.</p>
        </Panel>
        <div>
          {me != null && <Panel title="Your staff's week">
            <p className="small">
              <label><input type="checkbox" checked={u.auto} disabled={busy} onChange={(e) => act("recruit_auto", { on: e.target.checked })} /> Let the staff run the board</label>
            </p>
            <table className="grid tight"><tbody>
              {(["recruiting", "scouting", "prep"] as const).map((k) => <tr key={k}>
                <td>{k === "prep" ? "Game preparation" : k === "recruiting" ? "Recruiting" : "Scouting"}</td>
                <td><input type="range" min={0} max={100} value={Math.round(100 * t[k] / tsum)} onChange={(e) => setTime({ ...t, [k]: Number(e.target.value) / 100 })} /></td>
                <td className="num">{pct(t[k] / tsum)}</td><td className="num muted small">{Math.round(data.hours * t[k] / tsum)} h</td></tr>)}
            </tbody></table>
            {time && <p><button disabled={busy} onClick={async () => { await act("staff_time", time); setTime(null); }}>Save</button> <button className="link" onClick={() => setTime(null)}>Cancel</button></p>}
            <p className="small muted">In season the usual week is 30% recruiting, 10% scouting and 60% preparing for Saturday; less preparation costs you on the field.
              Out of season there is no game to prepare for.</p>
            <table className="grid tight"><tbody>
              {Object.entries(data.skill_names).map(([k, l]) => <tr key={k}><td>{l}</td><td className="num">{data.skills[k]}</td></tr>)}
            </tbody></table>
            <p className="small muted">{data.staff.map((c) => `${c.role} ${c.first} ${c.last}`).join(", ")}</p>
          </Panel>}
          {me != null && <Panel title="Regional scouts" right={<span className="small muted">Spent {money(u.spend)} this year</span>}>
            <table className="grid tight"><tbody>
              {Object.entries(data.regions).map(([k, r]) => <tr key={k}><td>{r.name}</td>
                <td><label className="small"><input type="checkbox" checked={u.regions.includes(k)} disabled={busy} onChange={(e) => act("scout_region", { region: k, on: e.target.checked })} /> {money(data.costs.region)}/yr</label></td></tr>)}
            </tbody></table>
            <p className="small muted">A regional scout tightens your reads there. Evaluation trips cost {money(data.costs.trip_near)} and {data.costs.trip_hours.near} staff hours near home,
              {" "}{money(data.costs.trip_far)} and {data.costs.trip_hours.far} hours away. Scouting comes out of your operations budget.</p>
          </Panel>}
          <Panel title={`${data.cls} class rankings`}>
            <table className="grid tight"><thead><tr><th className="num">#</th><th>School</th><th className="num">Commits</th><th className="num">5★/4★</th><th className="num">Points</th></tr></thead><tbody>
              {(ranks ?? []).map((r, i) => <tr key={r.team_id} className={r.team_id === me ? "mine" : ""}><td className="num">{i + 1}</td>
                <td><Logo team={team(r.team_id)} size={18} /> {team(r.team_id)?.school}</td><td className="num">{r.commits}</td><td className="num muted">{r.five}/{r.four}</td><td className="num">{r.points.toFixed(1)}</td></tr>)}
            </tbody></table>
          </Panel>
        </div>
      </div>
    </div>
  );
}

function ProspectLine({ p, me, manual, open, onOpen, busy, act, scouting, hours, setHours, team }: {
  p: ProspectRow; me: number | null; manual: boolean; open: boolean; onOpen: () => void; busy: boolean; act: (type: string, payload: unknown) => Promise<void>;
  scouting: boolean; hours: string; setHours: (v: string) => void; team: ReturnType<typeof useLeague>["team"];
}) {
  const offered = me != null && p.offers.includes(me);
  const signed = !!p.commit?.signed;
  const cols = me != null ? 8 : 7;
  return (
    <>
      <tr className={p.commit?.team_id === me ? "mine" : ""}>
        <td className="num">{p.service?.rank ?? ""}</td>
        <td><a onClick={onOpen} className="link">{p.name}</a> <span className="muted small">{p.pos}{p.service ? ` ${stars(p.service.stars)}` : ""}</span></td>
        <td className="small">{p.home.city}{p.home.state ? `, ${p.home.state}` : ""} <span className="muted">{heightStr(p.height != null ? Math.round(p.height) : null)} {p.weight ?? ""}</span></td>
        <td className="small nowrap">{p.potential ? <><b>{p.potential.est}</b> <span className="muted">{p.potential.lo}-{p.potential.hi}</span></> : ""}</td>
        <td className="small muted nowrap">{p.ovr ? `${p.ovr.lo}-${p.ovr.hi}` : ""}</td>
        <td className="small nowrap">{p.commit ? <><Logo team={team(p.commit.team_id)} size={16} /> {signed ? "Signed" : "Verbal"}</> : <span className="muted">Open</span>}</td>
        <td className="num">{p.offers.length}</td>
        {me != null && <td className="small">
          {!signed && p.grade >= 1 && <button className="link small" disabled={busy} onClick={() => act("recruit_offer", { pid: p.id, on: !offered })}>{offered ? "Pull offer" : "Offer"}</button>}{" "}
          <button className="link small" disabled={busy} onClick={() => act("scout_prospect", { pid: p.id, on: !scouting })}>{scouting ? "Stop scouting" : "Scout"}</button>
          {p.evals > 0 && <span className="muted"> {p.evals} eval{p.evals === 1 ? "" : "s"}</span>}
          {manual && !signed && <> <input className="small" style={{ width: 36 }} value={hours} onChange={(e) => setHours(e.target.value)} />h
            <button className="link small" disabled={busy} onClick={() => act("recruit_hours", { pid: p.id, hours: Number(hours) || 0 })}>Set</button></>}
        </td>}
      </tr>
      {open && <tr><td colSpan={cols} className="small">
        {p.service && <>Service: {stars(p.service.stars)} {p.service.rating.toFixed(4)}, No. {p.service.rank} nationally. </>}
        {p.commit && <>Committed to {team(p.commit.team_id)?.school} {shortDate(p.commit.date)}. </>}
        {p.top_schools.length > 0 ? <>Schools in his picture: {p.top_schools.map((x) => `${team(x.team_id)?.school ?? x.team_id}${x.offered ? " (offer)" : ""}`).join(", ")}.</> : <span className="muted">No school has been in touch.</span>}
        {me != null && <> Your contact so far: {Math.round(p.interest)} hours.</>}
      </td></tr>}
    </>
  );
}
