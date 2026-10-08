import { useMemo, useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type FutureData, type RenewalRule, type RetentionRow, type TalkView, type WatchLevel, type WatchView } from "../api.ts";
import { Logo, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";

/** How likely a player is to enter the portal, as a colored chip (on the player page hero and in lists). */
export function WatchChip({ w, hero = false }: { w: Pick<WatchView, "watch" | "label" | "p" | "known">; hero?: boolean }) {
  return (
    <span className={`chip watch w-${w.watch}${hero ? "" : " flat"}`} title={`${Math.round(w.p * 100)}% chance he enters the portal${w.known ? "" : " (your staff's read until you talk with him)"}`}>
      {WATCH_ICON[w.watch]} {w.label}{hero ? ` · ${Math.round(w.p * 100)}%` : ""}
    </span>
  );
}
const WATCH_ICON: Record<WatchLevel, string> = { settled: "●", restless: "◐", shopping: "◔", gone: "○" };

const PLAN_WORDS = { renew: "Re-sign at his ask", offer: "Offer up to", let_go: "Let him go", needs_you: "Needs you" } as const;
const ORDER: Record<WatchLevel, number> = { gone: 0, shopping: 1, restless: 2, settled: 3 };

/** Dollars typed in thousands. */
const parseK = (s: string) => Math.round(Number(s) * 1000);

/** One action at a time, with the error kept next to it. */
function useAct() {
  const { id } = useLeague();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (type: string, payload: unknown) => {
    setBusy(true); setErr(null);
    try { await api.act(id, type, payload); return true; } catch (e) { setErr((e as Error).message); return false; } finally { setBusy(false); }
  };
  return { busy, err, act };
}

/** What's pulling him toward the portal, worst first, as bars. */
function Reasons({ w }: { w: WatchView }) {
  if (!w.reasons.length) return <p className="muted small">Nothing is pulling him away.</p>;
  const max = Math.max(...w.reasons.map((r) => r.weight), 1);
  return (
    <div className="reasons">
      {w.reasons.map((r) => (
        <div key={r.reason} className="reason">
          <span className="label">{r.label}</span>
          <span className="track"><span className={"fill" + (r.reason === "pay" ? " money" : "")} style={{ width: `${Math.round((100 * r.weight) / max)}%` }} /></span>
        </div>
      ))}
    </div>
  );
}

/** The negotiation: his status and number, your offer and his answer, and the controls. */
function Negotiation({ f }: { f: FutureData }) {
  const t = f.talk!;
  const { busy, err, act } = useAct();
  const start = t.counter ?? t.ask ?? f.watch.value;
  const [amount, setAmount] = useState(String(Math.round(start / 1000)));
  const [years, setYears] = useState(1);
  const left = f.budget.total - f.budget.committed;
  // His number for the length on offer: longer deals cost more a year, by his premium.
  const len = t.length, num = t.counter ?? t.ask;
  const forYears = (x: number) => Math.round(x * (1 + len.premium * (years - 1)) / 5000) * 5000;
  if (t.status === "graduating" || t.status === "nfl" || t.status === "contract") {
    return <p>{t.label}{t.status === "contract" && f.next_deal ? `: ${money(f.next_deal.amount)} next season.` : "."}</p>;
  }
  if (t.outcome) {
    return <p>{t.outcome === "signed" ? <>He's staying: <b>{money(t.deal!.amount)}</b> a year for {t.deal!.years} season{t.deal!.years === 1 ? "" : "s"} ({t.deal!.via === "rule" ? "your standing rule" : t.deal!.via === "staff" ? "your staff" : "your offer"}).</>
      : t.outcome === "let_go" ? "You let him go: he enters the portal on January 2." : "He's done talking: he enters the portal on January 2. You can still bid for him there."}</p>;
  }
  return (
    <div className="nego">
      <div className="nego-head">
        <div><div className="muted small">Status</div><b>{t.label}</b></div>
        <div><div className="muted small">{t.counter != null ? "His number" : "He asks"}</div><b>{t.counter != null ? money(t.counter) : t.ask != null ? money(t.ask) : "Money won't do it"}</b></div>
        <div><div className="muted small">Market for players like him</div><b>{t.market != null ? money(t.market) : "-"}</b></div>
        <div><div className="muted small">Patience</div><span className="dots" title={`${t.patience} more declined offers before he stops talking`}>{"●".repeat(t.patience)}<span className="muted">{"○".repeat(Math.max(0, 4 - t.patience))}</span></span></div>
      </div>
      {t.offer ? (
        <p>Your offer: <b>{money(t.offer.amount)}</b> for {t.offer.years} season{t.offer.years === 1 ? "" : "s"}, made {shortDate(t.offer.made)}. He'll answer by <b>{shortDate(t.offer.answer)}</b>.</p>
      ) : (
        <div className="offer-row">
          $<input className="num" style={{ width: "6em" }} value={amount} onChange={(e) => setAmount(e.target.value)} />K a year for{" "}
          <select value={years} onChange={(e) => setYears(Number(e.target.value))}>
            {Array.from({ length: Math.max(1, f.eligibility) }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y} season{y === 1 ? "" : "s"}{y > 1 ? " (locks him in)" : ""}</option>)}
          </select>{" "}
          <button className="primary" disabled={busy || !Number.isFinite(parseK(amount))} onClick={() => act("renewal_offer", { pid: f.pid, amount: parseK(amount), years })}>Make offer</button>
          {num != null && years <= len.max && <button disabled={busy} onClick={() => act("renewal_offer", { pid: f.pid, amount: forYears(num), years })}>Pay his number ({money(forYears(num))}{years > 1 ? ` for ${years}` : ""})</button>}
        </div>
      )}
      <p className="small">{len.max <= 1 ? "He wants a one-year deal so he can test the market again next winter."
        : <>A multi-year deal locks him in: he won't renegotiate until it ends, and he's much less likely to leave. He'll sign for up to {len.max} seasons{len.premium > 0.005 ? <> and wants about {Math.round(len.premium * 100)}% more a year for each season beyond one</> : <> without asking much more for it</>}.</>}
        {len.known ? "" : <span className="muted"> (Your staff's read of a typical player until you talk with him.)</span>}</p>
      <p className="small muted">He answers in a day or two: he stays at or above the least he'd take{f.watch.walk_range ? ` (your staff thinks ${money(f.watch.walk_range[0])}-${money(f.watch.walk_range[1])})` : ""}, or declines and names his number. Each decline costs patience,
        a lowball costs more and hurts his morale. With no deal by January 1 he enters the portal. {money(left)} of next season's budget is uncommitted.</p>
      <div className="row-actions">
        <label className="small"><input type="checkbox" checked={t.mine} disabled={busy} onChange={(e) => act("renewal_talk", { pid: f.pid, mine: e.target.checked })} /> I'll decide (keep the staff's plan off him)</label>
        {!t.mine && t.plan && <span className="small muted">Staff plan on Dec 31: {PLAN_WORDS[t.plan.kind]}{t.plan.amount ? ` ${money(t.plan.amount)}` : ""}</span>}
        <button className="link small danger" disabled={busy} onClick={() => confirm("Let him go? He enters the portal on January 2.") && act("renewal_talk", { pid: f.pid, let_go: true })}>Let him go</button>
      </div>
      {err && <p className="error small">{err}</p>}
    </div>
  );
}

/** The player page's Future tab (your players): will he be back, why not, and what it takes. */
export function FutureTab({ f }: { f: FutureData }) {
  const { id, team, state } = useLeague();
  const { busy, err, act } = useAct();
  const w = f.watch;
  const promised = w.promise && !w.promise.broken;
  return (
    <div className="cols even">
      <div>
        <Panel title="Portal watch" right={<WatchChip w={w} />}>
          {w.leaving ? <p>{w.fix}</p> : <>
            <div className="meter"><span className={`w-${w.watch}`} style={{ width: `${Math.max(3, Math.round(w.p * 100))}%` }} /></div>
            <p className="small muted">{Math.round(w.p * 100)}% chance he enters the portal in January{w.known ? `. You've talked with him (${w.persona}).` : ": your staff's read of a typical player. Talk with him to learn his real reasons."}</p>
            <h4>Why he might leave</h4>
            <Reasons w={w} />
            <h4>What keeps him</h4>
            <p className={w.keep != null && w.keep > w.pay ? "fixable" : ""}>{w.fix}</p>
            <table className="grid tight"><tbody>
              <tr><td>Market value next season</td><td className="num">{money(w.value)}</td></tr>
              <tr><td>Staying pays him</td><td className="num">{money(w.pay)}</td></tr>
              {w.keep != null && <tr><td>Pay he'd commit to stay for</td><td className="num"><b>{money(w.keep)}</b></td></tr>}
              {w.walk_range && !w.known && <tr><td>Your staff's range for it</td><td className="num">{money(w.walk_range[0])}-{money(w.walk_range[1])}</td></tr>}
            </tbody></table>
          </>}
          <div className="row-actions">
            <button disabled={busy || f.talks_left <= 0} onClick={() => act("talk_player", { pid: f.pid })}>{f.talked ? "Talk again" : "Talk with him"}</button>
            <span className="small muted">{f.talks_left} of 5 talks left this week{f.talked ? `; last talked ${shortDate(f.talked)}` : ""}</span>
            {!w.leaving && <label className="small"><input type="checkbox" checked={!!promised} disabled={busy} onChange={(e) => act("renewal_promise", { pid: f.pid, on: e.target.checked })} /> Promise him a starting job next season</label>}
          </div>
          {w.promise?.broken && <p className="small loss">You broke a starting-job promise to him.</p>}
          {promised && <p className="small muted">If he isn't starting by your fourth game, the promise is broken and he won't forget it.</p>}
          {err && <p className="error small">{err}</p>}
        </Panel>
      </div>
      <div>
        <Panel title="Renewal talks" right={<a href={`#/l/${id}/retention`}>All players</a>}>
          {f.talks_open && f.talk ? <Negotiation key={`${f.talk.offer?.made}-${f.talk.counter}`} f={f} /> : (
            <p className="muted">{!f.dates.talks || f.dates.talks > state.date ? <>Talks open {f.dates.talks ? shortDate(f.dates.talks) : "after the conference championships"} and run until January 1; the portal opens {f.dates.portal ? shortDate(f.dates.portal) : "January 2"}.</> : "This winter's talks are over."}
              {f.next_deal ? ` He's signed for next season at ${money(f.next_deal.amount)}.` : ""}</p>
          )}
        </Panel>
        <Panel title="Players like him" right={<span className="small muted">same position, rating and level</span>}>
          {f.comparables.players.length ? <table className="grid tight"><tbody>
            {f.comparables.players.map((c) => <tr key={c.pid}><td><Logo team={team(c.team_id)} size={16} /> <a href={`#/l/${id}/player/${c.pid}`}>{c.name}</a></td><td className="num">{c.ovr}</td><td className="num">{money(c.pay)}</td></tr>)}
            {f.comparables.median != null && <tr className="total"><td>Median</td><td></td><td className="num">{money(f.comparables.median)}</td></tr>}
          </tbody></table> : <p className="muted">No close comparables.</p>}
        </Panel>
      </div>
    </div>
  );
}

type Filter = "risk" | "open" | "all";

/** My Team > Retention: everyone's portal watch all season; in December, the renewal talks with your standing rule. */
export function RetentionScreen() {
  const { id, state } = useLeague();
  const data = useData(() => api.retention(id), [state.date]);
  const { busy, err, act } = useAct();
  const [filter, setFilter] = useState<Filter>("risk");
  const rows = useMemo(() => {
    const all = [...(data?.rows ?? [])].filter((r) => !r.watch.leaving || r.talk);
    const pick = filter === "all" ? all : filter === "open" ? all.filter((r) => r.talk && !r.talk.outcome && r.talk.status !== "graduating" && r.talk.status !== "nfl" && r.talk.status !== "contract")
      : all.filter((r) => !r.watch.leaving && (r.watch.watch !== "settled" || (r.talk && !r.talk.outcome && r.talk.plan?.kind === "needs_you")));
    return pick.sort((a, b) => ORDER[a.watch.watch] - ORDER[b.watch.watch] || a.importance - b.importance);
  }, [data, filter]);
  if (!data) return state.user_team_id == null ? <Panel title="Retention"><p className="muted">Pick a team in Settings.</p></Panel> : <p className="muted">Loading...</p>;
  const count = (w: WatchLevel) => data.rows.filter((r) => !r.watch.leaving && r.watch.watch === w).length;
  const b = data.budget, pct = b.total ? Math.min(100, (100 * b.committed) / b.total) : 0;
  const needYou = data.rows.filter((r) => r.talk && !r.talk.outcome && r.talk.plan?.kind === "needs_you").length;
  const waiting = data.rows.filter((r) => r.talk?.offer).length;
  return (
    <div>
      <div className="cols even">
        <Panel title="Portal watch" right={<span className="small muted">{data.talks_open ? `Talks open until Jan 1 · portal ${data.dates.portal ? shortDate(data.dates.portal) : "Jan 2"}` : data.dates.talks ? `Renewal talks open ${shortDate(data.dates.talks)}` : ""}</span>}>
          <div className="watchcounts">
            {(["gone", "shopping", "restless", "settled"] as const).map((w) => <div key={w} className={`w-${w}`}><b>{count(w)}</b><span>{({ gone: "Likely gone", shopping: "Shopping", restless: "Restless", settled: "Settled" })[w]}</span></div>)}
          </div>
          <p className="small muted">Every player weighs staying against what he'd get elsewhere: pay, playing time, development, scheme fit, winning and home, plus how happy he is here.
            Your staff reads him like a typical player until you talk with him (five talks a week). Money problems are the easiest to fix: pay him what he'd commit to stay for.
            {data.talks_open ? ` ${needYou} player${needYou === 1 ? "" : "s"} need you; ${waiting} offer${waiting === 1 ? "" : "s"} waiting on an answer.` : ""}</p>
        </Panel>
        <Panel title="Next season's roster budget">
          <div className="budgetbar"><span style={{ width: `${pct}%` }} /></div>
          <table className="grid tight"><tbody>
            <tr><td>Budget</td><td className="num">{money(b.total)}</td></tr>
            <tr><td>Multi-year deals already signed</td><td className="num">{money(b.contracts)}</td></tr>
            <tr><td>Renewals this winter</td><td className="num">{money(b.deals)}</td></tr>
            <tr><td><b>Left for renewals and the portal</b></td><td className="num"><b>{money(b.total - b.committed)}</b></td></tr>
          </tbody></table>
        </Panel>
      </div>
      {data.talks_open && <RuleEditor rule={data.rule} busy={busy} onSave={(r) => act("renewal_rule", r)} />}
      <Panel title="Players" right={<span className="seg small">
        {(["risk", "open", "all"] as const).map((k) => <button key={k} className={filter === k ? "on" : ""} onClick={() => setFilter(k)}>{k === "risk" ? "At risk" : k === "open" ? "Open talks" : "Everyone"}</button>)}</span>}>
        {err && <p className="error small">{err}</p>}
        {!rows.length ? <p className="muted">{filter === "risk" ? "Nobody is at risk right now." : "Nobody here."}</p> : (
          <table className="grid tight">
            <thead><tr><th>Player</th><th className="num">Ovr</th><th>Watch</th><th>Why</th><th className="num">Pays now</th><th>What keeps him</th>{data.talks_open && <th>Talks</th>}<th></th></tr></thead>
            <tbody>{rows.map((r) => <Row key={r.pid} r={r} talksOpen={data.talks_open} busy={busy} act={act} />)}</tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}

function Row({ r, talksOpen, busy, act }: { r: RetentionRow; talksOpen: boolean; busy: boolean; act: (t: string, p: unknown) => Promise<boolean> }) {
  const { id } = useLeague();
  const w = r.watch, t = r.talk;
  return (
    <tr>
      <td><a href={`#/l/${id}/player/${r.pid}/future`}>{r.name}</a> <span className="muted small">{r.pos} · {r.cls}{r.starter ? " · starter" : ""}</span></td>
      <td className="num">{r.ovr}</td>
      <td><WatchChip w={w} /> <span className="muted small">{Math.round(w.p * 100)}%</span>{!w.known && <span className="muted small" title="Your staff's read until you talk with him"> *</span>}</td>
      <td className="small">{w.reasons.map((x) => x.label).join(", ") || <span className="muted">-</span>}</td>
      <td className="num">{money(w.pay)}</td>
      <td className="small">{w.keep == null ? <span className="loss">{w.reasons[0]?.reason === "pay" ? "Not money alone" : "Money won't fix it"}</span> : w.keep <= w.pay ? <span className="muted">Nothing</span> : <>Pay {money(w.keep)}</>}</td>
      {talksOpen && <td className="small">{talkCell(t)}</td>}
      <td className="nowrap">
        {talksOpen && t && !t.outcome && !t.offer && (t.counter ?? t.ask) != null && t.status !== "contract" && t.status !== "graduating" && t.status !== "nfl" &&
          <button className="link small" disabled={busy} onClick={() => act("renewal_offer", { pid: r.pid, amount: t.counter ?? t.ask, years: 1 })}>Pay {money((t.counter ?? t.ask)!)}</button>}
        {" "}<a className="small" href={`#/l/${id}/player/${r.pid}/future`}>Talks</a>
      </td>
    </tr>
  );
}

function talkCell(t: TalkView | null) {
  if (!t) return <span className="muted">-</span>;
  if (t.outcome === "signed") return <span className="win">Signed {money(t.deal!.amount)}</span>;
  if (t.outcome) return <span className="loss">{t.outcome === "let_go" ? "Let go" : "To the portal"}</span>;
  if (t.status === "graduating" || t.status === "nfl" || t.status === "contract") return <span className="muted">{t.label}</span>;
  if (t.offer) return <>Offer out: {money(t.offer.amount)}, answer {shortDate(t.offer.answer)}</>;
  return <>{t.label}{t.counter != null ? `, wants ${money(t.counter)}` : t.ask != null ? `, asks ${money(t.ask)}` : ""}{t.plan?.kind === "needs_you" && !t.mine ? <b className="needs"> Needs you</b> : ""}</>;
}

function RuleEditor({ rule, busy, onSave }: { rule: RenewalRule; busy: boolean; onSave: (r: RenewalRule) => void }) {
  const [r, setR] = useState(rule);
  const pct = (k: keyof RenewalRule) => <input className="num" style={{ width: "4em" }} value={Math.round(r[k] * 100)} onChange={(e) => setR({ ...r, [k]: Number(e.target.value) / 100 })} />;
  return (
    <Panel title="Your standing rule" right={<span className="small muted">your staff applies it now and settles anything left on December 31</span>}>
      <p className="rule">
        Re-sign anyone asking up to {pct("auto_up_to")}% of his value. For the rest, offer up to {pct("offer_up_to")}% of value.
        Let backups go when they ask more than $<input className="num" style={{ width: "4em" }} value={Math.round(r.release_over / 1000)} onChange={(e) => setR({ ...r, release_over: parseK(e.target.value) })} />K and won't start.
        Keep renewals under {pct("budget_share")}% of next season's budget. Your top 30 players always come to you.
        {" "}<button className="primary" disabled={busy} onClick={() => onSave(r)}>Apply</button>
      </p>
    </Panel>
  );
}
