import { useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type BudgetData, type FacilityOption, type FacilityPlans } from "../api.ts";
import { Chart, HBars, Stat } from "../charts.tsx";
import { Logo, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";

type Tab = "overview" | "gameday" | "facilities" | "conference";
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, x) => a + x, 0);
const fy = (y: number) => `${y}-${String(y + 1).slice(2)}`;
const pct = (x: number) => `${x > 0 ? "+" : ""}${x}%`;

/** Football's budget for the fiscal year with its projections, game-day ticket prices and crowds, facilities and the conference's budgets. */
export function BudgetScreen({ tid }: { tid?: number }) {
  const { id, state, team } = useLeague();
  const data = useData(() => api.budget(id, tid), [state.date, tid]);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (!data) return <p className="muted">Loading...</p>;
  if (data.team_id == null) return <Panel title="Budget"><p className="muted">This school has no football budget in the game.</p></Panel>;
  const t = team(data.team_id);
  const act = async (type: string, payload: unknown) => {
    setBusy(true); setErr(null);
    try { await api.act(id, type, payload); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const tabs: [Tab, string][] = [["overview", "Overview"], ["gameday", "Game day"], ["facilities", "Facilities"], ["conference", t?.conference ?? "Conference"]];
  return (
    <div className="budget">
      {err && <p className="error">{err}</p>}
      <Panel title={<><Logo team={t} size={22} /> {t?.school} football budget, {fy(data.year)}</>} right={<span className="seg small">
        {tabs.map(([k, l]) => <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{l}</button>)}</span>}>
        <Headline d={data} />
      </Panel>
      {tab === "overview" && <Overview d={data} />}
      {tab === "gameday" && <GameDay d={data} busy={busy} act={act} />}
      {tab === "facilities" && <Facilities d={data} busy={busy} act={act} />}
      {tab === "conference" && <Conference d={data} />}
    </div>
  );
}

/** The year in four numbers: revenue, expenses, surplus now and projected next year. */
function Headline({ d }: { d: BudgetData }) {
  const next = d.lines?.[1];
  const fac = d.expenses.facilities ?? 0;
  return (
    <div className="stats-row" style={{ marginBottom: 4 }}>
      <Stat label="Revenue" value={money(sum(d.revenue))} note={next ? `${money(sum(next.revenue))} projected in ${fy(next.year)}` : undefined} />
      <Stat label="Expenses" value={money(sum(d.expenses))} note={next ? `${money(sum(next.expenses))} projected in ${fy(next.year)}` : undefined} />
      <Stat label={d.surplus >= 0 ? "Surplus to the athletic department" : "Deficit the department covers"} value={money(Math.abs(d.surplus))} tone={d.surplus >= 0 ? "win" : "loss"}
        note={next ? `${next.surplus >= 0 ? "Surplus" : "Deficit"} of ${money(Math.abs(next.surplus))} projected next year` : undefined} />
      <Stat label="Facilities and debt service" value={money(fac)} note={`${Math.round((fac / Math.max(1, sum(d.expenses))) * 100)}% of expenses`} />
    </div>
  );
}

/** The budget by line, the seasons behind and ahead, and the full projection as a table. */
function Overview({ d }: { d: BudgetData }) {
  const lines = d.lines ?? [];
  // Past seasons from the money history, then this year and the projections.
  const past = d.history.filter((h) => h.year < d.year);
  const labels = [...past.map((h) => fy(h.year)), ...lines.map((l) => fy(l.year))];
  const proj = (i: number) => i >= past.length + 1;
  const rows = (o: Record<string, number>, lbl: Record<string, string>) => Object.entries(o).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ key: k, label: lbl[k] ?? k, value: v }));
  return (
    <div>
      <Panel title="Football's money by season">
        <Chart desc="Football revenue, expenses and surplus by season, with projections" labels={labels} faded={proj}
          series={[
            { name: "Revenue", slot: 1, kind: "bar", values: [...past.map((h) => h.revenue), ...lines.map((l) => sum(l.revenue))] },
            { name: "Expenses", slot: 2, kind: "bar", values: [...past.map((h) => h.expenses), ...lines.map((l) => sum(l.expenses))] },
            { name: "Surplus", slot: 3, kind: "line", values: [...past.map((h) => h.surplus), ...lines.map((l) => l.surplus)] },
          ]} />
        <p className="small muted">Lighter bars and the dashed line are projections: a typical season from here (no postseason money until it's earned), crowds and giving at
          next season's projected fortune, revenue share and giving growing 4% a year, and the facility payments already scheduled.
          {d.source === "estimate" ? " Lines are estimated from the conference and the program's size until real athletic department finances are loaded." : " From the school's Knight-Newhouse football report."}</p>
      </Panel>
      <div className="cols even">
        <Panel title={`Where the money comes from (${money(sum(d.revenue))})`}>
          <HBars slot={1} rows={rows(d.revenue, d.labels.revenue)} />
          <p className="small muted">Tickets count games played and the crowds expected at the rest; postseason shares arrive as you play in them.</p>
        </Panel>
        <Panel title={`Where it goes (${money(sum(d.expenses))})`}>
          <HBars slot={2} rows={rows(d.expenses, d.labels.expenses)} />
          <p className="small muted">Revenue share is what your roster is paid from the school's money; your collective's NIL deals are the boosters' and aren't in football's budget.</p>
        </Panel>
      </div>
      <Panel title="Budget by line, projected">
        <div style={{ overflowX: "auto" }}>
          <table className="grid tight">
            <thead><tr><th></th>{lines.map((l) => <th key={l.year} className="num">{fy(l.year)}{l.projected ? " (proj.)" : ""}</th>)}</tr></thead>
            <tbody>
              {(["revenue", "expenses"] as const).map((key) => <Group key={key} title={key === "revenue" ? "Revenue" : "Expenses"} k={key} d={d} />)}
              <tr><td><b>Surplus (deficit)</b></td>{lines.map((l) => <td key={l.year} className={"num " + (l.surplus >= 0 ? "win" : "loss")}><b>{money(l.surplus)}</b></td>)}</tr>
            </tbody>
          </table>
        </div>
        <p className="small muted">The fiscal year runs July to June; football's surplus or deficit goes back to the athletic department.</p>
      </Panel>
    </div>
  );
}

function Group({ title, k, d }: { title: string; k: "revenue" | "expenses"; d: BudgetData }) {
  const lines = d.lines ?? [];
  return (
    <>
      <tr><th>{title}</th>{lines.map((l) => <th key={l.year} className="num">{money(sum(l[k]))}</th>)}</tr>
      {Object.keys(d[k]).map((key) => <tr key={key}><td>{d.labels[k][key] ?? key}</td>{lines.map((l) => <td key={l.year} className={"num" + (l.projected ? " muted" : "")}>{money(l[k][key] ?? 0)}</td>)}</tr>)}
    </>
  );
}

/** Home games: price, crowd and ticket money, and for the game picked, how money and crowd move with its price. */
function GameDay({ d, busy, act }: { d: BudgetData; busy: boolean; act: (type: string, payload: unknown) => void }) {
  const { team } = useLeague();
  const [price, setPrice] = useState<Record<number, string>>({});
  const open = d.home.filter((h) => h.game.status !== "final");
  const [sel, setSel] = useState<number | null>(open[0]?.game.id ?? null);
  const h = d.home.find((x) => x.game.id === sel);
  const total = d.home.reduce((a, x) => a + (x.revenue ?? 0), 0);
  const crowds = d.home.map((x) => x.attendance ?? 0).filter((x) => x > 0);
  const avg = crowds.length ? Math.round(crowds.reduce((a, x) => a + x, 0) / crowds.length) : 0;
  // The lowest price that brings in (within half a percent) the most money: no reason to turn fans away for nothing.
  const top = h && h.options.length ? Math.max(...h.options.map((o) => o.revenue)) : 0;
  const best = h?.options.find((o) => o.revenue >= 0.995 * top) ?? null;
  const at = (p: number) => (h ? h.options.reduce((bi, o, i, all) => (Math.abs(o.price - p) < Math.abs(all[bi].price - p) ? i : bi), 0) : 0);
  return (
    <div>
      <div className="stats-row">
        <Stat label="Ticket money this season" value={money(total)} note={`${d.home.length} home games, played and expected`} />
        <Stat label="Average crowd" value={avg.toLocaleString()} note={`${Math.round((avg / Math.max(1, d.capacity)) * 100)}% of ${d.capacity.toLocaleString()} seats`} />
        <Stat label="Usual ticket price" value={`$${d.usual_price}`} note="Higher prices bring in more per fan and fewer fans" />
      </div>
      <div className="cols">
        <Panel title="Home games">
          <div style={{ overflowX: "auto" }}>
            <table className="grid tight gameday">
              <thead><tr><th>Date</th><th>Opponent</th><th className="num">Crowd</th><th className="num">Tickets</th><th className="num">Price</th></tr></thead>
              <tbody>{d.home.map((x) => {
                const g = x.game, opp = team(g.away_id), final = g.status === "final";
                return (
                  <tr key={g.id} className={sel === g.id ? "sel" : ""} onClick={() => !final && setSel(g.id)}>
                    <td className="muted">{shortDate(g.date)}</td>
                    <td className="opp"><Logo team={opp} size={18} /> {opp?.school}</td>
                    <td className="num">{x.attendance?.toLocaleString() ?? ""}{!final && <span className="muted small"> exp.</span>}</td>
                    <td className="num">{x.revenue != null ? money(x.revenue) : ""}</td>
                    <td className="num price">{final || !d.mine ? <>${x.price}{!x.custom && <span className="muted small"> usual</span>}</> : <>
                      $<input className="num" value={price[g.id] ?? String(x.price)} onClick={(e) => e.stopPropagation()} onChange={(e) => setPrice({ ...price, [g.id]: e.target.value })} />{" "}
                      <button disabled={busy} onClick={(e) => { e.stopPropagation(); act("set_ticket_price", { game_id: g.id, price: Number(price[g.id] ?? x.price) }); }}>Set</button>
                      {x.custom && <> <button className="link small" disabled={busy} onClick={(e) => { e.stopPropagation(); act("set_ticket_price", { game_id: g.id, price: null }); }}>Usual</button></>}
                    </>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <Chart desc="Ticket money by home game" height={170} labels={d.home.map((x) => team(x.game.away_id)?.abbr ?? shortDate(x.game.date))}
            faded={(i) => d.home[i].game.status !== "final"} series={[{ name: "Ticket money", slot: 1, kind: "bar", values: d.home.map((x) => x.revenue) }]} />
          <p className="small muted">Pick a game still to play to see how its price moves the crowd and the money. A winning team, a ranked opponent and a sellout crowd let you charge more.</p>
        </Panel>
        {h && h.options.length > 0 ? (
          <Panel title={`Pricing ${team(h.game.away_id)?.school}`}>
            <Chart desc="Ticket money at each price" height={190} labels={h.options.map((o) => `$${o.price}`)} marks={[{ at: at(h.price), label: `Now $${h.price}` }]}
              series={[{ name: "Ticket money", slot: 1, kind: "line", values: h.options.map((o) => o.revenue) }]} />
            <Chart desc="Crowd at each price" height={170} fmt={(x) => `${Math.round(x / 1000)}K`} labels={h.options.map((o) => `$${o.price}`)} marks={[{ at: at(h.price), label: `Now $${h.price}` }]}
              series={[{ name: "Crowd", slot: 3, kind: "line", values: h.options.map((o) => o.attendance) }]} />
            {best && <p className="small">Most money: <b>${best.price}</b>, {best.attendance.toLocaleString()} fans and {money(best.revenue)} ({Math.abs(best.revenue - (h.revenue ?? 0)) < 0.005 * best.revenue ? "about what you make now" : `${money(Math.abs(best.revenue - (h.revenue ?? 0)))} ${best.revenue >= (h.revenue ?? 0) ? "more" : "less"} than now`}).
              {best.attendance >= d.capacity ? " That still sells out." : ""}</p>}
            <p className="small muted">Ticket money tops out where a higher price loses more fans than it earns; a sellout leaves money on the table until the price turns fans away.</p>
          </Panel>
        ) : <Panel title="Pricing"><p className="muted">No home games left to price this season.</p></Panel>}
      </div>
    </div>
  );
}

/** Five pips for a grade, with the grades a project would add outlined. */
function Pips({ g, to }: { g: number; to?: number }) {
  return <span className="pips" aria-label={`grade ${g} of 5`}>{[1, 2, 3, 4, 5].map((i) => <i key={i} className={i <= g ? "on" : to && i <= to ? "up" : ""} />)}</span>;
}

const WHAT: Record<string, string> = {
  weight_room: "Strength and conditioning: how fast every player develops between seasons, and how good the program looks to recruits.",
  medical: "Training room, rehab and sports medicine: development speed, and how fast injured players come back.",
  practice: "Practice fields and the indoor facility: development speed, and how good the program looks to recruits.",
  locker_room: "Locker room and players' lounge: chemistry in both units, and how recruits see the program.",
  academics: "Academic support center and tutoring: recruits and their families weigh it.",
};

/** Facilities: each area against the conference and the country, what's being built, and a full look at any project before you take it to your AD. */
function Facilities({ d, busy, act }: { d: BudgetData; busy: boolean; act: (type: string, payload: unknown) => void }) {
  const p = d.plans;
  const [area, setArea] = useState<string | null>(null);
  if (!p) return <Panel title="Facilities"><p className="muted">This school has no facilities on record.</p></Panel>;
  const cur = p.areas.find((a) => a.area === (area ?? p.areas.find((x) => x.options.length)?.area ?? p.areas[0].area))!;
  const building = new Map(p.projects.map((x) => [x.area, x]));
  const asked = new Map(p.asks.map((x) => [x.area, x]));
  return (
    <div>
      <div className="cols facil">
        <Panel title="Your facilities">
          <div className="areas">
            {p.areas.map((a) => {
              const b = building.get(a.area), q = asked.get(a.area);
              return (
                <button key={a.area} className={"area" + (cur.area === a.area ? " on" : "")} onClick={() => setArea(a.area)}>
                  <span><b>{a.label}</b></span><Pips g={a.grade} to={b?.to} />
                  <span className="sub">
                    No. {a.rank} of {a.of} nationally · conference average {a.conference}
                    {b ? <> · <span className="win">{b.scope === "build" ? "new building" : "renovation"} to {b.to} opens {shortDate(b.done)} {b.done.slice(0, 4)}</span></> : q ? <> · <i>with your AD (answer by {shortDate(q.answer)})</i></> : a.grade >= 5 ? " · top grade" : ""}
                  </span>
                </button>
              );
            })}
          </div>
          <Chart desc="Facility grades against the conference and national averages" height={180} fmt={(x) => String(x)} yMin={0} yMax={5}
            labels={p.areas.map((a) => a.label.split(" ")[0])}
            series={[
              { name: "Yours", slot: 1, kind: "bar", values: p.areas.map((a) => a.grade) },
              { name: "Conference average", slot: 2, kind: "bar", values: p.areas.map((a) => a.conference) },
              { name: "FBS average", slot: 3, kind: "bar", values: p.areas.map((a) => a.national) },
            ]} />
          <p className="small muted">Today's facilities are already part of every team's players, so what changes things is an upgrade (or a building closed while its replacement goes up).
            Right now: development {pct(Math.round((p.effects.dev - 1) * 1000) / 10)} against a typical program{p.effects.injury !== 1 ? `, injuries ${pct(Math.round((p.effects.injury - 1) * 100))} time out` : ""}{p.effects.chemistry ? `, chemistry ${p.effects.chemistry > 0 ? "+" : ""}${p.effects.chemistry} a unit` : ""}.</p>
        </Panel>
        <AreaDetail key={cur.area} a={cur} p={p} d={d} busy={busy} act={act} building={building.get(cur.area)} asked={asked.get(cur.area)} />
      </div>
      <Projects p={p} d={d} />
    </div>
  );
}

function AreaDetail({ a, p, d, busy, act, building, asked }: {
  a: FacilityPlans["areas"][number]; p: FacilityPlans; d: BudgetData; busy: boolean; act: (type: string, payload: unknown) => void;
  building?: FacilityPlans["projects"][number]; asked?: FacilityPlans["asks"][number];
}) {
  const [scope, setScope] = useState<string>("renovate");
  const [fin, setFin] = useState<string>("cash");
  const opt: FacilityOption | undefined = a.options.find((o) => o.scope === scope) ?? a.options[0];
  const head = <p className="small">{WHAT[a.area]}</p>;
  if (!opt) {
    return (
      <Panel title={a.label}>
        {head}
        <p>{building ? <>A {building.scope === "build" ? "new building" : "renovation"} to grade {building.to} is underway: {money(building.cost)}{building.estimate && building.estimate !== building.cost ? ` (estimate ${money(building.estimate)})` : ""}, opening {shortDate(building.done)} {building.done.slice(0, 4)}.</>
          : asked ? <>Your proposal is with your AD, who will answer by {shortDate(asked.answer)}.</>
            : a.grade >= 5 ? "Already among the best in the country." : d.mine ? "" : "Only the school's own coach can propose projects."}</p>
      </Panel>
    );
  }
  const f = opt.financing.find((x) => x.financing === fin) ?? opt.financing[0];
  const first = f.payments.find((x) => x.year === d.year)?.amount ?? 0;
  const e = opt.effect, dur = opt.during;
  const up: string[] = [], down: string[] = [];
  if (e.dev_pct > 0) up.push(`Players develop ${e.dev_pct}% faster: about +${e.ovr_per_year} overall per player each offseason, +${Math.round(e.ovr_per_year * 4 * 100) / 100} over a four-year career.`);
  if (e.injury_pct < 0) up.push(`Injured players back ${-e.injury_pct}% sooner: a four-week injury heals ${Math.max(1, Math.round((28 * -e.injury_pct) / 100))} days sooner.`);
  if (e.points > 0) up.push(`Chemistry worth about +${e.points} points a game.`);
  if (e.recruit_pct > 0) up.push(`Recruits ${e.recruit_pct}% likelier to pick you over an otherwise equal school.`);
  up.push(`From No. ${a.rank} nationally in this area to grade ${opt.to} (conference average ${a.conference}).`);
  down.push(`Could come in anywhere from ${money(opt.range[0])} to ${money(opt.range[1])}: most projects run a little over.`);
  if (f.financing === "cash") down.push(`Football pays ${money(f.total)} over ${opt.years} year${opt.years > 1 ? "s" : ""}: ${money(first)} comes out of this year's surplus.`);
  if (f.financing === "bonds") down.push(`${money(f.payments[0].amount)} a year for 20 years: ${money(f.total)} in all, ${money(f.total - opt.estimate)} of it interest.`);
  if (f.financing === "donors" && f.gift) down.push(`Boosters give ${money(f.gift)} (${Math.round((f.share ?? 0) * 100)}%), but your collective has ${money((f.drag ?? 0) / opt.years)} less a year for ${opt.years} year${opt.years > 1 ? "s" : ""} (${money(f.drag ?? 0)} of roster money).`);
  if (dur) down.push(`Until it opens the old space is closed and the area plays a grade lower${dur.dev_pct < 0 ? `: development ${dur.dev_pct}%` : ""}${dur.injury_pct > 0 ? `, injuries ${pct(dur.injury_pct)} time out` : ""}${dur.points < 0 ? `, ${dur.points} points a game` : ""}${dur.recruit_pct < 0 ? `, recruits ${dur.recruit_pct}%` : ""}.`);
  const deficit = f.surplus.find((x) => x.with < 0 && x.without >= 0);
  if (deficit) down.push(`Football would run a deficit in ${fy(deficit.year)}.`);
  const years = f.payments.slice(0, 20);
  return (
    <Panel title={`${a.label}: ${opt.scope === "build" ? "new building" : "renovation"} to grade ${opt.to}`}>
      {head}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span className="seg small">{a.options.map((o) => <button key={o.scope} className={opt.scope === o.scope ? "on" : ""} onClick={() => setScope(o.scope)}>{p.scopes[o.scope].label} (to {o.to})</button>)}</span>
        <span className="seg small">{opt.financing.map((x) => <button key={x.financing} className={f.financing === x.financing ? "on" : ""} onClick={() => setFin(x.financing)}>{p.financing[x.financing].label}</button>)}</span>
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>{p.scopes[opt.scope].blurb} {p.financing[f.financing].blurb}</p>
      <div className="facts">
        <div><span className="small muted">Estimate</span><b>{money(opt.estimate)}</b><span className="small muted">{money(opt.range[0])} to {money(opt.range[1])}</span></div>
        <div><span className="small muted">Opens</span><b>Aug {opt.opens.slice(0, 4)}</b><span className="small muted">{opt.years} year{opt.years > 1 ? "s" : ""} to build</span></div>
        <div><span className="small muted">Football pays this year</span><b>{money(first)}</b><span className="small muted">surplus now {money(d.surplus)}</span></div>
        <div><span className="small muted">Football pays in all</span><b>{money(f.total)}</b><span className="small muted">{f.gift ? `boosters give ${money(f.gift)}` : f.financing === "bonds" ? "over 20 years" : "cash"}</span></div>
      </div>
      <div className="updown">
        <div><h4>Upside</h4><ul className="small">{up.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><h4>Downside</h4><ul className="small">{down.map((x) => <li key={x}>{x}</li>)}</ul></div>
      </div>
      <div className="cols even" style={{ marginTop: 10 }}>
        <div>
          <h4>Football's surplus, with and without it</h4>
          <Chart desc="Football surplus with and without the project" height={180} labels={f.surplus.map((x) => fy(x.year))} faded={(i) => i > 0}
            series={[{ name: "Without", slot: 1, kind: "line", values: f.surplus.map((x) => x.without) }, { name: "With the project", slot: 2, kind: "line", values: f.surplus.map((x) => x.with) }]} />
        </div>
        <div>
          <h4>What football pays, by year</h4>
          <Chart desc="Football's payments for the project by fiscal year" height={180} labels={years.map((x) => (years.length > 6 ? `'${String(x.year).slice(2)}` : fy(x.year)))}
            series={[{ name: "Payment", slot: 2, kind: "bar", values: years.map((x) => x.amount) }]} />
        </div>
      </div>
      <h4>Your AD's view today</h4>
      <ul className="checks small">{f.ad.checks.map((c) => <li key={c.text} className={c.ok ? "" : "loss"}>{c.ok ? "✓" : "✗"} {c.text}</li>)}</ul>
      {d.mine && <p><button className="primary" disabled={busy} onClick={() => act("propose_project", { area: a.area, scope: opt.scope, financing: f.financing })}>Propose to the AD</button>{" "}
        <span className="small muted">{f.ad.ok ? "As things stand your AD would approve it." : "As things stand your AD would turn it down."} The answer comes in one to three days; the final cost is set when it's approved.</span></p>}
      <p className="small muted">How sizes were set: estimates follow recent projects (a top power-program indoor practice facility about $60M like Mississippi State's, a top weight room about $22M like Michigan's,
        a locker room about $15M; Group of Five schools build smaller, like Troy's $11.6M indoor facility). The on-field effects are the game's judgment: studies find facilities move development and winning only a little, and recruits care more.</p>
    </Panel>
  );
}

/** What's underway, what your AD has said, and every scheduled payment by year. */
function Projects({ p, d }: { p: FacilityPlans; d: BudgetData }) {
  const { state } = useLeague();
  const years = [...new Set(p.payments.map((x) => x.year))].sort((a, b) => a - b);
  const labels = [...new Set(p.payments.map((x) => x.label))];
  return (
    <div className="cols even">
      <Panel title="Projects and answers">
        {p.projects.length ? (
          <table className="grid tight"><thead><tr><th>Project</th><th className="num">Cost</th><th>Paid by</th><th>Opens</th></tr></thead><tbody>
            {p.projects.map((x) => {
              const total = new Date(x.done).getTime() - new Date(x.start).getTime(), done = Math.max(0, Math.min(1, (new Date(state.date).getTime() - new Date(x.start).getTime()) / Math.max(1, total)));
              return <tr key={x.area}><td>{d.areas[x.area]} to {x.to}{x.scope === "build" ? " (new building)" : ""}<div className="progress"><span style={{ width: `${done * 100}%` }} /></div></td>
                <td className="num">{money(x.cost)}{x.estimate && x.estimate !== x.cost ? <div className={"small " + (x.cost > x.estimate ? "loss" : "win")}>{x.cost > x.estimate ? "+" : ""}{Math.round((x.cost / x.estimate - 1) * 100)}% vs estimate</div> : null}</td>
                <td className="small">{x.financing ? p.financing[x.financing].label : "Cash"}{x.gift ? ` (${money(x.gift)} from boosters)` : ""}</td><td className="nowrap">{shortDate(x.done)} {x.done.slice(0, 4)}</td></tr>;
            })}
          </tbody></table>
        ) : <p className="muted small">Nothing being built.</p>}
        {p.asks.map((x) => <p key={x.area} className="small"><i>{d.areas[x.area]}: {p.scopes[x.scope].label.toLowerCase()}, {p.financing[x.financing].label.toLowerCase()}. Your AD answers by {shortDate(x.answer)}.</i></p>)}
        {d.requests.length > 0 && <ul className="small">{d.requests.map((r, i) => <li key={i} className={r.approved ? "win" : "loss"}>{shortDate(r.date)}: {r.reason}</li>)}</ul>}
      </Panel>
      <Panel title="Scheduled facility payments">
        {years.length ? <>
          <Chart desc="Scheduled facility payments by fiscal year" height={180} labels={years.map((y) => (years.length > 6 ? `'${String(y).slice(2)}` : fy(y)))}
            series={[{ name: "Payments", slot: 2, kind: "bar", values: years.map((y) => p.payments.filter((x) => x.year === y).reduce((a, x) => a + x.amount, 0)) }]} />
          <p className="small muted">{labels.join(", ")}. These are on top of the program's usual facilities and debt line{p.drag.length ? `; donor campaigns take ${money(p.drag.reduce((a, x) => a + x.amount, 0))} from your collective` : ""}.</p>
        </> : <p className="muted small">No project payments scheduled.</p>}
      </Panel>
    </div>
  );
}

/** The conference's football budgets. */
function Conference({ d }: { d: BudgetData }) {
  const { id, team, state } = useLeague();
  return (
    <div className="cols even">
      <Panel title="Revenue by school">
        <HBars slot={1} rows={d.conference.map((r) => ({ key: String(r.team_id), label: team(r.team_id)?.school, value: r.revenue }))} highlight={String(d.team_id)} />
      </Panel>
      <Panel title="Budgets">
        <table className="grid tight"><thead><tr><th>School</th><th className="num">Revenue</th><th className="num">Expenses</th><th className="num">Surplus</th></tr></thead><tbody>
          {d.conference.map((r) => <tr key={r.team_id} className={r.team_id === state.user_team_id ? "mine" : ""}>
            <td className="nowrap"><Logo team={team(r.team_id)} size={18} /> <a href={`#/l/${id}/budget/${r.team_id}`}>{team(r.team_id)?.school}</a></td>
            <td className="num">{money(r.revenue)}</td><td className="num">{money(r.expenses)}</td><td className={"num " + (r.surplus < 0 ? "loss" : "")}>{money(r.surplus)}</td></tr>)}
        </tbody></table>
      </Panel>
    </div>
  );
}
