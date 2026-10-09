import { useEffect, useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type Assignment, type ProspectRow, type RegionPlan, type ScoutReport, type StaffShare, type StaffTimeSplit } from "../api.ts";
import { Logo, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";
import { RangeBar, prospectLink } from "./Recruiting.tsx";
import { recruitStars } from "./ratings.tsx";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const GRADE_ABBR = ["FR", "SO", "JR", "SR"];
/** The last scout report you've read, per league (this browser). */
const seenKey = (league: string) => `cfb:reports-seen:${league}`;
const seenReport = (league: string) => { try { return Number(localStorage.getItem(seenKey(league)) ?? 0); } catch { return 0; } };

/** Strategy: every call about where your staff's time and money go, with a screen to fine-tune each. */
export function StrategyScreen({ sub }: { sub: string }) {
  if (sub === "scouting") return <ScoutingScreen />;
  if (sub === "reports") return <ReportsScreen />;
  return <Overview />;
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

const SHARES: { key: StaffShare; label: string; what: string }[] = [
  { key: "recruiting", label: "Recruiting", what: "Contact with prospects: calls, visits, building relationships." },
  { key: "scouting", label: "Scouting prospects", what: "Evaluation trips and regional work: finds prospects and narrows your reads." },
  { key: "develop", label: "Player development", what: "Individual development plans: how fast each plan works." },
  { key: "prep", label: "Practice and game plan", what: "Installing the plan and practicing it: what a week of preparation is worth on Saturday." },
  { key: "opponent", label: "Opponent film", what: "Film of the next opponent: finds his tendencies for the game plan." },
];

// The same rules the server plays by (core staff.ts and scouting.ts), to preview a split before saving it.
const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));
const paceOf = (develop: number, usual: number) => clamp(Math.sqrt(develop / usual), 0, 1.6);
const prepOf = (prep: number, usual: number, skill: number) => clamp(prep / usual, 0.3, 1.25) * (0.7 + 0.6 * skill / 100);
const knowOf = (hours: number) => 1 - Math.exp(-hours / 35);

function Overview() {
  const { id, state } = useLeague();
  const data = useData(() => api.strategy(id), [state.date]);
  const [draft, setDraft] = useState<Required<StaffTimeSplit> | null>(null);
  const { busy, err, act } = useAct();
  if (!data) return <p className="muted">Loading...</p>;
  if (!data.available || data.team_id == null) return <Panel title="Strategy"><p className="muted">{data.available ? "You need a team." : "This league has no recruiting, so there's no staff week to plan."}</p></Panel>;
  const t = draft ?? data.time;
  const sum = SHARES.reduce((a, s) => a + t[s.key], 0) || 1;
  const share = (k: StaffShare) => t[k] / sum;
  const hours = (k: StaffShare) => Math.round(data.staff_hours * share(k));
  const ratio = (k: StaffShare) => (data.time[k] > 0 ? share(k) / data.time[k] : 1);
  const film = data.staff_hours / 6 * share("opponent") * (0.6 + 0.8 * data.skills.scouting / 100);
  const seen = seenReport(id), fresh = Math.max(0, data.scouting.last_report - seen);
  const buys: Record<StaffShare, { text: string; href: string; link: string }> = {
    recruiting: { text: `${Math.round(data.recruiting.contact_hours * (data.in_season ? ratio("recruiting") : 1))} contact hours a week${data.recruiting.auto ? ", your staff works the board" : `, ${data.recruiting.hours_set} set by you`}`,
      href: `#/l/${id}/recruiting/board`, link: "Big board" },
    scouting: { text: `${Math.round(data.staff_hours * share("scouting"))} scouting hours a week in season (${data.scouting.trips + data.scouting.region_hours} planned)`, href: `#/l/${id}/strategy/scouting`, link: "Scouting" },
    develop: { text: `Plans work at ${paceOf(share("develop"), data.usual.develop).toFixed(2)}x the usual pace (${data.development.plans} of ${data.development.slots} plans)`, href: `#/l/${id}/development`, link: "Development" },
    prep: { text: `A week of preparation is worth ${prepOf(share("prep"), data.usual.prep, data.prep.skill).toFixed(2)}x`, href: `#/l/${id}/plan`, link: "Game plan" },
    opponent: { text: `Finds about ${pct(knowOf(film * 6 + 6))} of an opponent's tendencies by game day${data.film ? ` (next opponent: ${pct(data.film.knowledge)} so far)` : ""}`, href: `#/l/${id}/plan`, link: "Film room" },
  };
  const set = (k: StaffShare, v: number) => {
    // Moving one share takes from (or gives to) the others in proportion, so the week stays 100%.
    const others = SHARES.filter((s) => s.key !== k), rest = others.reduce((a, s) => a + share(s.key), 0);
    const next = { ...t };
    for (const s of others) next[s.key] = rest > 0 ? share(s.key) * (1 - v) / rest : (1 - v) / others.length;
    next[k] = v;
    setDraft(next);
  };
  const off = data.offseason;
  return (
    <div>
      <div className="pagehead"><h2>Strategy</h2><span className="muted">Where your staff's {data.staff_hours} hours a week go, and what each share buys. Each line has a screen to fine-tune it.</span></div>
      {err && <p className="error">{err}</p>}
      <Panel title="Your staff's week" right={<span className="small muted">{data.in_season ? "In season now" : "Out of season now: recruiting and scouting only"}</span>}>
        <table className="grid strategy"><thead><tr><th>Area</th><th>Share</th><th className="num">Hours</th><th>What it buys</th><th /></tr></thead><tbody>
          {SHARES.map((s) => <tr key={s.key}>
            <td title={s.what}><b>{s.label}</b><div className="muted small">{s.what}</div></td>
            <td className="nowrap"><input type="range" min={0} max={100} value={Math.round(100 * share(s.key))} onChange={(e) => set(s.key, Number(e.target.value) / 100)} /> <b>{pct(share(s.key))}</b>
              {Math.abs(share(s.key) - data.usual[s.key]) >= 0.005 && <span className="muted small"> usual {pct(data.usual[s.key])}</span>}</td>
            <td className="num">{hours(s.key)}</td>
            <td>{buys[s.key].text}</td>
            <td className="nowrap"><a href={buys[s.key].href}>{buys[s.key].link} ›</a></td>
          </tr>)}
        </tbody></table>
        <p>
          {draft && <><button className="primary" disabled={busy} onClick={async () => { await act("staff_time", draft); setDraft(null); }}>Save the week</button> <button className="link" onClick={() => setDraft(null)}>Cancel</button> </>}
          {!draft && Object.keys(data.usual).some((k) => Math.abs(data.time[k as StaffShare] - data.usual[k as StaffShare]) >= 0.005) && <button className="link" disabled={busy} onClick={() => act("staff_time", data.usual)}>Back to the usual week</button>}
        </p>
        <p className="small muted">This is the in-season week. Out of season there is no game to prepare for and plans run at their usual pace, so the same split becomes
          {" "}{pct(off.recruiting)} recruiting and {pct(off.scouting)} scouting ({Math.round(data.staff_hours * off.scouting)} scouting hours a week).
          Less practice costs you on the field; less development slows every plan; less recruiting means fewer contact hours with the prospects on your board.</p>
        <p><label className="check"><input type="checkbox" checked={data.recruiting.auto} disabled={busy} onChange={(e) => act("recruit_auto", { on: e.target.checked })} /> Let the staff run the recruiting board</label>
          <span className="muted small"> {data.recruiting.board} on your board · {data.recruiting.commits} committed for {state.year + 1}</span></p>
      </Panel>
      <div className="cols even">
        <Panel title="Scouting" right={<a className="small" href={`#/l/${id}/strategy/scouting`}>Assignments ›</a>}>
          <div className="skills">
            <div className="skill"><span>Hours this week</span><b>{Math.round(data.scouting.hours)}</b></div>
            <div className="skill"><span>Planned</span><b className={data.scouting.trips + data.scouting.region_hours > data.scouting.hours ? "bad" : ""}>{data.scouting.trips + data.scouting.region_hours}</b></div>
            <div className="skill"><span>Players assigned</span><b>{data.scouting.assignments}</b></div>
            <div className="skill"><span>Regional scouts</span><b>{data.scouting.paid}</b></div>
          </div>
          <p>{data.scouting.reports ? <a href={`#/l/${id}/strategy/reports`}>{data.scouting.reports} scout report{data.scouting.reports === 1 ? "" : "s"}{fresh ? `, ${fresh} new` : ""} ›</a> : <span className="muted">No scout reports yet. Assign players or put hours in a region and your scouts report back.</span>}</p>
          <p className="small muted">Spent {money(data.scouting.spend)} on scouting this year (operations budget).</p>
        </Panel>
        <Panel title="Staff skills" right={<a className="small" href={`#/l/${id}/staff`}>Staff ›</a>}>
          <div className="skills">{Object.entries(data.skill_names).map(([k, l]) => <div key={k} className="skill"><span>{l}</span><b>{data.skills[k]}</b></div>)}</div>
          <p className="small muted">{data.staff.map((c) => `${c.role} ${c.first} ${c.last}`).join(", ")}. Skills set what an hour is worth: recruiting per contact hour, scouting per look and per film hour, development the base pace, game planning a week's preparation.</p>
        </Panel>
      </div>
    </div>
  );
}

/** Hours this week against what's planned, as a bar. */
function HoursBar({ have, trips, regions }: { have: number; trips: number; regions: number }) {
  const total = Math.max(have, trips + regions, 1);
  const w = (x: number) => `${(100 * x) / total}%`;
  const left = have - trips - regions;
  return (
    <div className="hoursbar">
      <div className="track">
        <span className="trips" style={{ width: w(Math.min(trips, have)) }} />
        <span className="regions" style={{ width: w(Math.max(0, Math.min(regions, have - trips))) }} />
        {left < 0 && <span className="over" style={{ width: w(-left) }} />}
      </div>
      <div className="small"><span className="key trips" /> Trips {trips} h · <span className="key regions" /> Regions {regions} h · {left >= 0 ? <b>{Math.round(left * 10) / 10} h left</b> : <b className="bad">{Math.round(-left * 10) / 10} h over</b>} of {have} this week</div>
    </div>
  );
}

function ScoutingScreen() {
  const { id, state } = useLeague();
  const data = useData(() => api.scouting(id), [state.date]);
  const { busy, err, act } = useAct();
  const [q, setQ] = useState("");
  const [found, setFound] = useState<ProspectRow[] | null>(null);
  const [trips, setTrips] = useState(3);
  useEffect(() => {
    if (q.trim().length < 2) { setFound(null); return; }
    let live = true;
    const t = setTimeout(() => api.recruiting(id, { q, view: "known", limit: "8", cls: String(state.year + 1) }).then(async (a) => {
      // Search every class your staff knows, nearest class first.
      const more = await Promise.all([2, 3].map((k) => api.recruiting(id, { q, view: "known", limit: "4", cls: String(state.year + k) })));
      if (live) setFound([...a.prospects, ...more.flatMap((x) => x.prospects)].slice(0, 10));
    }).catch(() => {}), 250);
    return () => { live = false; clearTimeout(t); };
  }, [q, id, state.year]);
  if (!data) return <p className="muted">Loading...</p>;
  if (data.available === false) return <Panel title="Scouting"><p className="muted">You need a team in a league with recruiting.</p></Panel>;
  const assigned = new Set(data.assignments.map((a) => a.id));
  let left = data.hours;
  // Trips go in list order while the hours last.
  const goes = new Map(data.assignments.map((a) => { const ok = left >= a.trip_hours; if (ok) left -= a.trip_hours; return [a.id, ok]; }));
  const move = (a: Assignment, d: number) => act("scout_prospect", { pid: a.id, on: true, at: data.assignments.indexOf(a) + d, ...(a.trips_left != null ? { trips: a.trips_left } : {}) });
  return (
    <div>
      <div className="pagehead"><h2>Scouting</h2><span className="muted">Send scouts to see players or work a region. Each trip is a look that narrows your read; a region's hours find prospects there and come back as a report.</span></div>
      {err && <p className="error">{err}</p>}
      <Panel title="This week's hours" right={<a className="small" href={`#/l/${id}/strategy/overview`}>Change the staff's week ›</a>}>
        <HoursBar have={data.hours} trips={data.trips} regions={data.region_hours} />
        <p className="small muted">Your staff has {data.season_hours} scouting hours a week in season and {data.offseason_hours} out of season ({data.in_season ? "in season now" : "out of season now"}).
          Trips go first, in list order; regions share what's left. A trip takes {data.costs.trip_hours.near} hours and {money(data.costs.trip_near)} near home, {data.costs.trip_hours.far} hours and {money(data.costs.trip_far)} farther away.
          Hours nobody uses still go to looking around near home and in the regions you pay a scout for.</p>
      </Panel>
      <Panel title="Players your scouts are seeing" right={<span className="small muted">{data.assignments.length} assigned · spent {money(data.spend)} this year</span>}>
        {data.assignments.length ? (
          <table className="grid"><thead><tr><th /><th>Prospect</th><th>Pos</th><th>Class</th><th>Home</th><th>Service</th><th>Your read</th><th className="num">Looks</th><th>Trips left</th><th className="num">A trip</th><th /></tr></thead><tbody>
            {data.assignments.map((a, i) => <tr key={a.id} className={goes.get(a.id) ? "" : "dim"}>
              <td className="nowrap"><button className="link" disabled={busy || i === 0} onClick={() => move(a, -1)} title="Earlier in the list">▲</button><button className="link" disabled={busy || i === data.assignments.length - 1} onClick={() => move(a, 1)} title="Later in the list">▼</button></td>
              <td>{prospectLink(id, a)}</td><td>{a.pos}</td><td className="muted">{a.cls} {GRADE_ABBR[a.grade] ?? ""}</td>
              <td className="muted small">{a.home.city}{a.home.state ? `, ${a.home.state}` : ""}</td>
              <td className="nowrap">{a.service ? <>{recruitStars(a.service.stars)} <span className="muted small">No. {a.service.rank}</span></> : <span className="muted small">Unrated</span>}</td>
              <td>{a.potential && <RangeBar {...a.potential} />}</td>
              <td className="num">{a.evals}</td>
              <td><select value={a.trips_left ?? 0} disabled={busy} onChange={(e) => { const n = Number(e.target.value); act("scout_prospect", { pid: a.id, on: true, ...(n ? { trips: n } : {}) }); }}>
                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}<option value={0}>Every week</option></select></td>
              <td className="num small nowrap">{a.trip_hours} h · {money(a.trip_cost)}{goes.get(a.id) ? "" : <div className="bad">no hours left</div>}</td>
              <td><button className="link" disabled={busy} onClick={() => act("scout_prospect", { pid: a.id, on: false })}>Call off</button></td>
            </tr>)}
          </tbody></table>
        ) : <p className="muted">Nobody yet. Find a prospect below, or use Send scouts on any prospect's page.</p>}
        <div className="toolbar">
          <input placeholder="Find a prospect your staff knows..." value={q} onChange={(e) => setQ(e.target.value)} />
          <label className="small">Trips <select value={trips} onChange={(e) => setTrips(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n}>{n}</option>)}</select></label>
        </div>
        {found && (found.length ? <table className="grid tight"><tbody>{found.map((p) => <tr key={p.id}>
          <td>{prospectLink(id, p)}</td><td>{p.pos}</td><td className="muted">{p.cls}</td><td className="muted small">{p.home.city}{p.home.state ? `, ${p.home.state}` : ""}</td>
          <td>{p.service ? recruitStars(p.service.stars) : <span className="muted small">Unrated</span>}</td><td>{p.potential && <RangeBar {...p.potential} />}</td>
          <td>{assigned.has(p.id) ? <span className="muted small">Assigned</span> : <button disabled={busy} onClick={() => act("scout_prospect", { pid: p.id, on: true, trips })}>Send scouts</button>}</td>
        </tr>)}</tbody></table> : <p className="muted small">No prospect your staff knows by that name.</p>)}
      </Panel>
      <Panel title="Regions" right={<span className="small muted">A report every {data.report_hours} hours</span>}>
        <table className="grid"><thead><tr><th>Region</th><th>Regional scout</th><th>Hours a week</th><th>Next report</th><th className="num">Known</th><th className="num">Found by you</th></tr></thead><tbody>
          {data.regions.map((r) => <RegionRow key={r.key} r={r} cost={data.costs.region} busy={busy} act={act} every={data.report_hours} />)}
        </tbody></table>
        <p className="small muted">A regional scout ({money(data.costs.region)} a year) works a region all year: your staff finds more prospects there and reads everyone there better.
          Hours a week are your own staff's time: at 8 a week they look as hard as a regional scout, and every {data.report_hours} hours they file a report on the best players they saw there, including some your staff didn't know about.</p>
      </Panel>
    </div>
  );
}

function RegionRow({ r, cost, busy, act, every }: { r: RegionPlan; cost: number; busy: boolean; act: (t: string, x: unknown) => Promise<void>; every: number }) {
  const [h, setH] = useState<string | null>(null);
  const save = (v: number) => { setH(null); return act("region_hours", { region: r.key, hours: Math.max(0, Math.min(60, v)) }); };
  return (
    <tr className={r.paid || r.hours ? "mine" : ""}>
      <td>{r.name}{r.home && <span className="tag">Home</span>}</td>
      <td className="nowrap"><label className="small check"><input type="checkbox" checked={r.paid} disabled={busy} onChange={(e) => act("scout_region", { region: r.key, on: e.target.checked })} /> {money(cost)}/yr</label></td>
      <td className="nowrap">
        <button className="link" disabled={busy || r.hours <= 0} onClick={() => save(r.hours - 2)}>−</button>
        <input className="hrs" value={h ?? String(r.hours)} onChange={(e) => setH(e.target.value)} onBlur={() => h != null && save(Number(h) || 0)} onKeyDown={(e) => e.key === "Enter" && h != null && save(Number(h) || 0)} />
        <button className="link" disabled={busy} onClick={() => save(r.hours + 2)}>+</button>
      </td>
      <td>{r.hours || r.done ? <span className="meter small-meter" title={`${r.done} of ${every} hours`}><span style={{ width: `${Math.min(100, (100 * r.done) / every)}%` }} /></span> : <span className="muted small">No hours</span>}</td>
      <td className="num">{r.known.toLocaleString()}</td>
      <td className="num">{r.found.toLocaleString()}</td>
    </tr>
  );
}

function ReportsScreen() {
  const { id, state, team } = useLeague();
  const data = useData(() => api.reports(id), [state.date]);
  const [kind, setKind] = useState<"all" | "region" | "player">("all");
  const [seen] = useState(() => seenReport(id));
  useEffect(() => {
    const top = data?.reports[0]?.id;
    if (top) try { localStorage.setItem(seenKey(id), String(top)); } catch { /* private window */ }
  }, [data, id]);
  if (!data) return <p className="muted">Loading...</p>;
  const rows = data.reports.filter((r) => kind === "all" || r.kind === kind);
  return (
    <div>
      <div className="pagehead"><h2>Scout reports</h2><span className="muted">What your scouts send back: the best players in the regions they worked, and how your read moved on the players they went to see.</span></div>
      <div className="seg">{([["all", "All"], ["region", "Regions"], ["player", "Players"]] as const).map(([k, l]) => <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>{l}</button>)}</div>
      {!rows.length && <Panel title="No reports yet"><p className="muted">Assign players or put hours in a region on the <a href={`#/l/${id}/strategy/scouting`}>Scouting</a> screen. Reports come in on Sundays.</p></Panel>}
      {rows.map((r) => <ReportCard key={r.id} r={r} fresh={r.id > seen} league={id} team={team} />)}
    </div>
  );
}

function ReportCard({ r, fresh, league, team }: { r: ScoutReport; fresh: boolean; league: string; team: ReturnType<typeof useLeague>["team"] }) {
  const p = r.kind === "player" ? r.lines[0] : null;
  return (
    <Panel title={r.title} right={<span className="small muted">{fresh && <span className="tag gold">New</span>} {shortDate(r.date)}{r.trips ? ` · ${r.trips} trip${r.trips === 1 ? "" : "s"}` : ""}{r.hours ? ` · ${r.hours} hours` : ""}</span>}>
      <p>{r.summary}</p>
      {p && r.before && <div className="readmove"><span className="muted small">Before</span> <RangeBar {...r.before} /> <span className="muted small">Now</span> <RangeBar est={p.est} lo={p.lo} hi={p.hi} /></div>}
      {r.kind === "region" && r.lines.length > 0 && (
        <table className="grid tight"><thead><tr><th>Prospect</th><th>Pos</th><th>Class</th><th>Home</th><th>Service</th><th>Your read</th><th>Notes</th></tr></thead><tbody>
          {r.lines.map((x) => <tr key={x.pid} className={x.fresh ? "mine" : ""}>
            <td><a className="pname" href={`#/l/${league}/prospect/${x.pid}`}>{x.name}</a></td><td>{x.pos}</td><td className="muted">{x.cls}</td>
            <td className="muted small">{x.city}{x.state ? `, ${x.state}` : ""}</td>
            <td className="nowrap">{x.stars ? <>{recruitStars(x.stars)} <span className="muted small">No. {x.rank}</span></> : <span className="muted small">Unrated</span>}</td>
            <td><RangeBar est={x.est} lo={x.lo} hi={x.hi} /></td>
            <td className="small">{x.commit != null && <Logo team={team(x.commit)} size={16} />} {x.note}</td>
          </tr>)}
        </tbody></table>
      )}
    </Panel>
  );
}
