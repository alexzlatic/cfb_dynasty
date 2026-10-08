import { useMemo, useState } from "react";
import { SortTable } from "../sort.tsx";
import { useData, useLeague } from "../App.tsx";
import { api, type ProspectRow, type RecruitingView, type StaffTimeSplit } from "../api.ts";
import { Logo, money } from "../util.tsx";
import { Panel } from "./common.tsx";
import { ConsideringList } from "./Prospect.tsx";
import { RecruitMap } from "./RecruitMap.tsx";
import { recruitStars } from "./ratings.tsx";

const GRADES = ["Freshmen", "Sophomores", "Juniors", "Seniors"];
export const POS = ["", "QB", "RB", "WR", "TE", "OL", "DE", "DT", "LB", "CB", "S", "K", "P", "LS"];
const VIEWS: [string, string][] = [["known", "Everyone you know"], ["rated", "Rated by the service"], ["found", "Found by your staff"], ["board", "On your big board"], ["mine", "You're recruiting"], ["committed", "Committed to you"]];
const SORTS: [string, string][] = [["rank", "Service rank"], ["est", "Your estimate"], ["hi", "Highest ceiling"]];
const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Recruiting: your big board, the prospects your staff knows, the map, class rankings and your scouting and staff. */
export function RecruitingScreen({ sub }: { sub: string }) {
  const { id, state } = useLeague();
  const [cls, setCls] = useState<number | null>(null);
  // The class tabs and your settings come with every list; the board and map screens use them too.
  const head = useData(() => api.recruiting(id, { limit: "0", ...(cls != null ? { cls: String(cls) } : {}) }), [state.date, cls]);
  if (!head) return <p className="muted">Loading...</p>;
  if (!head.available) return <Panel title="Recruiting"><p className="muted">This league has no recruiting.</p></Panel>;
  const c = cls ?? head.cls;
  const classTabs = sub !== "board" && sub !== "staff" && (
    <div className="classtabs">
      {head.classes.map((x) => (
        <button key={x.cls} className={x.cls === c ? "on" : ""} onClick={() => setCls(x.cls)}>
          <b>{x.cls}</b> <span>{GRADES[x.grade]}</span>
          <small>{x.known.toLocaleString()} known of {x.total.toLocaleString()}</small>
        </button>
      ))}
    </div>
  );
  return (
    <div>
      {classTabs}
      {sub === "list" && <ProspectList cls={c} head={head} />}
      {sub === "board" && <BigBoard head={head} />}
      {sub === "map" && <MapView cls={c} head={head} />}
      {sub === "rankings" && <Rankings cls={c} />}
      {sub === "staff" && <StaffAndScouting head={head} />}
    </div>
  );
}

function useAct() {
  const { id } = useLeague();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (type: string, payload: unknown) => {
    setBusy(true); setErr(null);
    try { await api.act(id, type, payload); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  return { busy, err, act };
}

/** A potential range as a little bar on the 40-99 scale with the estimate marked. */
export function RangeBar({ lo, hi, est }: { lo: number; hi: number; est: number }) {
  const x = (v: number) => `${((Math.max(40, Math.min(99, v)) - 40) / 59) * 100}%`;
  return (
    <span className="rangebar" title={`${lo}-${hi}, best guess ${est}`}>
      <span className="rtrack">
        <span className="span" style={{ left: x(lo), width: `calc(${x(hi)} - ${x(lo)})` }} />
        <span className="tick" style={{ left: x(est) }} />
      </span>
      <b>{est}</b> <small>{lo}-{hi}</small>
    </span>
  );
}

export const prospectLink = (league: string, p: { id: number; name: string }) => <a href={`#/l/${league}/prospect/${p.id}`} className="pname">{p.name}</a>;

function ProspectList({ cls, head }: { cls: number; head: RecruitingView }) {
  const { id, state } = useLeague();
  const [pos, setPos] = useState("");
  const [region, setRegion] = useState("");
  const [view, setView] = useState("known");
  const [sort, setSort] = useState("rank");
  const [stars, setStars] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const { busy, err, act } = useAct();
  const [rev, setRev] = useState(false);
  const query: Record<string, string> = { cls: String(cls), view, sort, limit: "50", offset: String(page * 50) };
  if (rev) query.dir = "rev";
  if (pos) query.pos = pos;
  if (region) query.region = region;
  if (stars) query.stars = stars;
  if (status) query.status = status;
  if (q) query.q = q;
  const data = useData(() => api.recruiting(id, query), [state.date, cls, pos, region, view, sort, rev, stars, status, q, page]);
  const me = head.team_id;
  const k = head.classes.find((x) => x.cls === cls)!;
  const filter = (f: () => void) => { f(); setPage(0); };
  const pages = data ? Math.ceil(data.total / 50) : 0;
  // Headers sort on the server (the list is paged): a click picks the column, a second click flips it.
  const sortTh = (key: string, label: string, className = "") => (
    <th className={`sortable${sort === key ? " sorted" : ""} ${className}`} onClick={() => filter(() => { if (sort === key) setRev(!rev); else { setSort(key); setRev(false); } })}>
      {label}{sort === key ? <span className="arrow">{(key === "rank" || key === "name" || key === "pos" || key === "home" || key === "board" || key === "status") !== rev ? "▲" : "▼"}</span> : null}</th>
  );
  return (
    <Panel title={`The ${cls} class`} right={<span className="small muted">{k.rated.toLocaleString()} rated by the service · {k.found.toLocaleString()} more found by your staff</span>}>
      {err && <p className="error">{err}</p>}
      <div className="toolbar">
        <input placeholder="Search name or town" value={q} onChange={(e) => filter(() => setQ(e.target.value))} />
        <select value={view} onChange={(e) => filter(() => setView(e.target.value))}>{VIEWS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select value={pos} onChange={(e) => filter(() => setPos(e.target.value))}>{POS.map((p) => <option key={p} value={p}>{p || "All positions"}</option>)}</select>
        <select value={stars} onChange={(e) => filter(() => setStars(e.target.value))}><option value="">All stars</option>{[5, 4, 3, 2].map((s) => <option key={s} value={s}>{s} stars</option>)}<option value="0">Unrated</option></select>
        <select value={status} onChange={(e) => filter(() => setStatus(e.target.value))}><option value="">Any status</option><option value="open">Uncommitted</option><option value="committed">Verbal</option><option value="signed">Signed</option></select>
        <select value={region} onChange={(e) => filter(() => setRegion(e.target.value))}>
          <option value="">Everywhere</option>
          {Object.entries(head.regions).map(([key, r]) => <option key={key} value={key}>{r.name}</option>)}
        </select>
        <select value={sort} onChange={(e) => filter(() => { setSort(e.target.value); setRev(false); })}>{SORTS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}</select>
      </div>
      {!data ? <p className="muted">Loading...</p> : (
        <div className="scrollx">
          <table className="grid prospects">
            <thead><tr>{sortTh("rank", "Rk", "num")}{sortTh("name", "Prospect")}{sortTh("pos", "Pos")}{sortTh("rank", "Stars")}{sortTh("home", "Home")}{sortTh("est", "Potential")}{sortTh("now", "Now")}{sortTh("status", "Status")}<th>In his picture</th>{me != null && sortTh("board", "")}</tr></thead>
            <tbody>{data.prospects.map((p) => <Row key={p.id} p={p} me={me} busy={busy} act={act} />)}</tbody>
          </table>
          {!data.prospects.length && <p className="muted">Nobody here your staff knows about. Scout a region to find more prospects there.</p>}
        </div>
      )}
      {pages > 1 && <p className="small pager">
        <button disabled={page === 0} onClick={() => setPage(page - 1)}>‹ Previous</button> page {page + 1} of {pages}{" "}
        <button disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>Next ›</button></p>}
      <p className="small muted">Your staff knows every prospect the service rates (about 50 freshmen, 500 sophomores and every junior and senior) plus the ones it finds:
        most near home, more wherever you pay a regional scout, and the best sooner. Potential is your staff's 90% range for what he'll be on arrival.</p>
    </Panel>
  );
}

function Row({ p, me, busy, act }: { p: ProspectRow; me: number | null; busy: boolean; act: (t: string, x: unknown) => Promise<void> }) {
  const { id, team } = useLeague();
  return (
    <tr className={p.commit?.team_id === me && me != null ? "mine" : p.board >= 0 ? "onboard" : ""}>
      <td className="num muted">{p.service?.rank ?? ""}</td>
      <td>{prospectLink(id, p)}</td>
      <td><span className="pos">{p.pos}</span></td>
      <td className="nowrap">{recruitStars(p.service?.stars)}</td>
      <td className="small">{p.home.city}{p.home.state ? `, ${p.home.state}` : ""}</td>
      <td>{p.potential ? <RangeBar {...p.potential} /> : ""}</td>
      <td className="small muted nowrap">{p.ovr ? `${p.ovr.lo}-${p.ovr.hi}` : ""}</td>
      <td className="small nowrap">{p.commit ? <><Logo team={team(p.commit.team_id)} size={18} /> {p.commit.signed ? "Signed" : "Verbal"}</> : <span className="muted">Open</span>}</td>
      <td className="nowrap">{p.top_schools.slice(0, 3).map((x) => <span key={x.team_id} title={`${team(x.team_id)?.school}${x.offered ? " (offer)" : ""}`} className={x.offered ? "offered" : ""}><Logo team={team(x.team_id)} size={18} /></span>)}</td>
      {me != null && <td className="nowrap">
        <button className={"star" + (p.board >= 0 ? " on" : "")} disabled={busy} title={p.board >= 0 ? "Take off your big board" : "Add to your big board"}
          onClick={() => act("recruit_board", { pid: p.id, on: p.board < 0 })}>{p.board >= 0 ? "★" : "☆"}</button>
      </td>}
    </tr>
  );
}

/** Your big board: the prospects you're tracking, in your order, with where each stands and where you stand with him. */
function BigBoard({ head }: { head: RecruitingView }) {
  const { id, state, team } = useLeague();
  const data = useData(() => api.board(id), [state.date]);
  const { busy, err, act } = useAct();
  const [cls, setCls] = useState<number | "all">("all");
  const me = head.team_id;
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => cls === "all" || r.cls === cls), [data, cls]);
  if (me == null) return <p className="muted">You need a team to keep a big board.</p>;
  return (
    <div>
      {err && <p className="error">{err}</p>}
      <div className="boardhead">
        <h2>Big board</h2>
        <div className="seg">
          <button className={cls === "all" ? "on" : ""} onClick={() => setCls("all")}>All classes</button>
          {head.classes.map((c) => <button key={c.cls} className={cls === c.cls ? "on" : ""} onClick={() => setCls(c.cls)}>{c.cls}</button>)}
        </div>
        <span className="muted small">{head.settings.auto ? "Your staff works the board each week (Scouting and staff to run it yourself)." : "You run the board: set contact hours below."}</span>
      </div>
      {!data ? <p className="muted">Loading...</p> : !rows.length ? (
        <Panel title="Nobody on your board yet"><p>Add prospects with the ☆ on the <a href={`#/l/${id}/recruiting/list`}>Prospects</a> list, a prospect's page or the <a href={`#/l/${id}/recruiting/map`}>map</a>.</p></Panel>
      ) : (
        <div className="board">
          {rows.map((r) => {
            const i = data.rows.indexOf(r);
            const committed = r.commit ? team(r.commit.team_id) : undefined;
            return (
              <div key={r.id} className={"bcard" + (r.commit?.team_id === me ? " mine" : r.commit ? " gone" : "")}>
                <div className="brank">{i + 1}</div>
                <div className="bwho">
                  <div>{prospectLink(id, r)} <span className="pos">{r.pos}</span> {recruitStars(r.service?.stars)}</div>
                  <div className="small muted">{r.cls} · {r.home.city}{r.home.state ? `, ${r.home.state}` : ""}{r.service ? ` · No. ${r.service.rank}` : ""}</div>
                </div>
                <div className="bpot">{r.potential && <RangeBar {...r.potential} />}</div>
                <div className="bstatus">{committed ? <><Logo team={committed} size={22} /> <span className="small">{r.commit!.signed ? "Signed" : "Verbal"}</span></> : <span className="muted small">Open</span>}</div>
                <div className="bcons">{r.considering.length ? <ConsideringList rows={r.considering} me={me} compact /> : <span className="muted small">{r.grade < 1 ? "Too young to recruit" : "No schools yet"}</span>}</div>
                <div className="byou">{r.you ? <><b>{ordinal(r.you.place)}</b> <span className="small">({pct(r.you.share)})</span></> : <span className="muted small">not in his picture</span>}
                  <div className="small muted">{Math.round(r.interest)} h · {r.offers.includes(me) ? "offered" : "no offer"}</div></div>
                <div className="bact">
                  <button className="link" disabled={busy || i === 0} onClick={() => act("recruit_board", { pid: r.id, on: true, at: i - 1 })} title="Move up">▲</button>
                  <button className="link" disabled={busy || i === data.rows.length - 1} onClick={() => act("recruit_board", { pid: r.id, on: true, at: i + 1 })} title="Move down">▼</button>
                  {!r.commit?.signed && r.grade >= 1 && <button className="link" disabled={busy} onClick={() => act("recruit_offer", { pid: r.id, on: !r.offers.includes(me) })}>{r.offers.includes(me) ? "Pull offer" : "Offer"}</button>}
                  <button className="link" disabled={busy} onClick={() => act("scout_prospect", { pid: r.id, on: !r.scouting })}>{r.scouting ? "Stop scouting" : "Scout"}</button>
                  <button className="link muted" disabled={busy} onClick={() => act("recruit_board", { pid: r.id, on: false })}>Remove</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <p className="small muted">Each prospect's chances are the schools he's considering and how likely he'd pick each if he chose today: what he thinks of the
        school, the relationship (contact hours) and offers. When your staff runs recruiting it works these prospects too.</p>
    </div>
  );
}
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th"}`;

function MapView({ cls, head }: { cls: number; head: RecruitingView }) {
  const { id, state } = useLeague();
  const [pos, setPos] = useState("");
  const [min, setMin] = useState(0);
  const [hideCommitted, setHideCommitted] = useState(false);
  const data = useData(() => api.recruitMap(id, cls, pos), [state.date, cls, pos]);
  return (
    <Panel title={`Where the ${cls} class is`} right={<span className="small muted">{data ? `${data.points.length.toLocaleString()} prospects your staff knows` : ""}</span>}>
      <div className="toolbar">
        <select value={pos} onChange={(e) => setPos(e.target.value)}>{POS.map((p) => <option key={p} value={p}>{p || "All positions"}</option>)}</select>
        <select value={min} onChange={(e) => setMin(Number(e.target.value))}><option value={0}>Everyone</option><option value={3}>3 stars and up</option><option value={4}>4 stars and up</option><option value={5}>5 stars</option></select>
        <label className="check"><input type="checkbox" checked={hideCommitted} onChange={(e) => setHideCommitted(e.target.checked)} /> Hide committed</label>
        <span className="legend"><i className="s5" /> 5★ <i className="s4" /> 4★ <i className="s3" /> 3★ <i className="s0" /> other <i className="ring" /> your board</span>
      </div>
      {data ? <RecruitMap points={data.points.filter((p) => p[3] >= min && (!hideCommitted || p[5] == null))} home={head.home} regions={head.settings.regions} regionDefs={head.regions} league={id} me={head.team_id} />
        : <p className="muted">Loading...</p>}
      <p className="small muted">Shaded: regions where you pay a scout. Click a prospect for his page.</p>
    </Panel>
  );
}

function Rankings({ cls }: { cls: number }) {
  const { id, state, team } = useLeague();
  const ranks = useData(() => api.classRanks(id, cls), [state.date, cls]);
  const me = state.user_team_id;
  return (
    <Panel title={`${cls} class rankings`}>
      <SortTable className="grid" rows={ranks ?? []} rowKey={(r) => r.team_id} rowClass={(r) => (r.team_id === me ? "mine" : undefined)} cols={[
        { key: "rank", label: "#", className: "num", asc: true, by: (r) => -r.points, cell: (_, i) => i + 1 },
        { key: "school", label: "School", by: (r) => team(r.team_id)?.school, cell: (r) => <><Logo team={team(r.team_id)} size={22} /> <a href={`#/l/${id}/team/${r.team_id}`}>{team(r.team_id)?.school}</a></> },
        { key: "commits", label: "Commits", className: "num", by: (r) => r.commits, cell: (r) => r.commits },
        { key: "five", label: "5★", className: "num", by: (r) => r.five, cell: (r) => r.five || "" },
        { key: "four", label: "4★", className: "num", by: (r) => r.four, cell: (r) => r.four || "" },
        { key: "points", label: "Points", className: "num", by: (r) => r.points, cell: (r) => <b>{r.points.toFixed(1)}</b> },
      ]} />
    </Panel>
  );
}

function StaffAndScouting({ head }: { head: RecruitingView }) {
  const [time, setTime] = useState<StaffTimeSplit | null>(null);
  const { busy, err, act } = useAct();
  const u = head.settings;
  if (head.team_id == null) return <p className="muted">You need a team.</p>;
  const t0 = time ?? u.time;
  const t = { ...t0, opponent: t0.opponent ?? 0.15 };
  const tsum = t.recruiting + t.scouting + t.prep + t.opponent || 1;
  return (
    <div className="cols even">
      <div>
        {err && <p className="error">{err}</p>}
        <Panel title="Your staff's week">
          <p><label className="check"><input type="checkbox" checked={u.auto} disabled={busy} onChange={(e) => act("recruit_auto", { on: e.target.checked })} /> Let the staff run the board</label></p>
          <table className="grid tight"><tbody>
            {(["recruiting", "scouting", "prep", "opponent"] as const).map((k) => <tr key={k}>
              <td>{k === "prep" ? "Practice and game plan" : k === "opponent" ? "Opponent film" : k === "recruiting" ? "Recruiting" : "Scouting prospects"}</td>
              <td><input type="range" min={0} max={100} value={Math.round(100 * t[k] / tsum)} onChange={(e) => setTime({ ...t, [k]: Number(e.target.value) / 100 })} /></td>
              <td className="num">{pct(t[k] / tsum)}</td><td className="num muted small">{Math.round(head.hours * t[k] / tsum)} h</td></tr>)}
          </tbody></table>
          {time && <p><button className="primary" disabled={busy} onClick={async () => { await act("staff_time", time); setTime(null); }}>Save</button> <button className="link" onClick={() => setTime(null)}>Cancel</button></p>}
          <p className="small muted">In season the usual week is 30% recruiting, 10% scouting prospects, 45% practice and the game plan and 15% film of the next opponent.
            Less practice costs you on the field; more film finds more of the opponent's tendencies (Game plan, Film room). More scouting time finds more prospects and narrows reads.
            Out of season there is no game to prepare for.</p>
        </Panel>
        <Panel title="Staff skills">
          <div className="skills">{Object.entries(head.skill_names).map(([k, l]) => <div key={k} className="skill"><span>{l}</span><b>{head.skills[k]}</b></div>)}</div>
          <p className="small muted">{head.staff.map((c) => `${c.role} ${c.first} ${c.last}`).join(", ")}</p>
        </Panel>
      </div>
      <Panel title="Regional scouts" right={<span className="small muted">Spent {money(u.spend)} this year</span>}>
        <table className="grid tight"><tbody>
          {Object.entries(head.regions).map(([k, r]) => <tr key={k} className={u.regions.includes(k) ? "mine" : ""}><td>{r.name}</td>
            <td className="nowrap"><label className="small check"><input type="checkbox" checked={u.regions.includes(k)} disabled={busy} onChange={(e) => act("scout_region", { region: k, on: e.target.checked })} /> {money(head.costs.region)}/yr</label></td></tr>)}
        </tbody></table>
        <p className="small muted">A regional scout finds prospects there your staff didn't know about and tightens your reads on everyone there. Evaluation trips cost {money(head.costs.trip_near)} and {head.costs.trip_hours.near} staff hours near home,
          {" "}{money(head.costs.trip_far)} and {head.costs.trip_hours.far} hours away. Scouting comes out of your operations budget.</p>
      </Panel>
    </div>
  );
}
