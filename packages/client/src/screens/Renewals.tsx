import { useMemo, useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type RetentionRow } from "../api.ts";
import { money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";
import { WatchChip } from "./Retention.tsx";

const pctText = (x: number) => `${x >= 0 ? "+" : ""}${Math.round(x * 100)}%`;
const CLOSED = new Set(["graduating", "nfl", "contract"]);

/** Why his renewal moved: his season against players at his position, and his honors. */
function why(r: RetentionRow): string {
  const n = r.renewal;
  if (r.talk?.status === "raise") return "Asked for a raise (within your rule)";
  if (n.honor === "all_american") return "All-American";
  if (n.honor === "poy") return "Conference player of the year";
  if (n.pct == null) return "Didn't play";
  if (r.pos === "OL" || r.pos === "P") return r.gp ? `Played ${r.gp} games` : "Didn't play";
  const top = Math.round((1 - n.pct) * 100);
  return n.pct >= 0.5 ? `Top ${Math.max(1, top)}% of ${r.pos}s` : `Bottom ${Math.max(1, Math.round(n.pct * 100))}% of ${r.pos}s`;
}

/**
 * My Team > Renewals: the end of the season in one place. Your standing rule's renewals wait for you to confirm
 * them (or revoke one and send him to the portal), then the players who need a new deal, the ones heading to
 * the portal, and the ones leaving anyway.
 */
export function RenewalsScreen() {
  const { id, state } = useLeague();
  const data = useData(() => api.retention(id), [state.date]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (type: string, payload: unknown) => {
    setBusy(true); setErr(null);
    try { await api.act(id, type, payload); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const groups = useMemo(() => {
    const rows = [...(data?.rows ?? [])].filter((r) => r.talk).sort((a, b) => a.importance - b.importance);
    const t = (r: RetentionRow) => r.talk!;
    return {
      renew: rows.filter((r) => t(r).deal?.via === "rule"),
      signed: rows.filter((r) => t(r).outcome === "signed" && t(r).deal?.via !== "rule"),
      deal: rows.filter((r) => !t(r).outcome && !CLOSED.has(t(r).status) && t(r).ask != null),
      portal: rows.filter((r) => t(r).outcome === "portal" || t(r).outcome === "let_go" || (!t(r).outcome && !CLOSED.has(t(r).status) && t(r).ask == null)),
      gone: rows.filter((r) => t(r).status === "graduating" || t(r).status === "nfl"),
      locked: rows.filter((r) => t(r).status === "contract"),
    };
  }, [data]);
  if (!data) return state.user_team_id == null ? <Panel title="Renewals"><p className="muted">Pick a team in Settings.</p></Panel> : <p className="muted">Loading...</p>;
  if (!data.rows.some((r) => r.talk)) {
    return <Panel title="Renewals"><p className="muted">{data.dates.talks && data.dates.talks > state.date
      ? <>Renewal talks open {shortDate(data.dates.talks)}, after the conference championships. This screen lists your auto-renewals, the players you'll need to negotiate with and the ones heading to the portal.</>
      : "This winter's talks are over."}</p></Panel>;
  }
  const pending = groups.renew.filter((r) => r.talk!.pending);
  const b = data.budget;
  const renewTotal = groups.renew.reduce((a, r) => a + (r.talk!.deal?.amount ?? 0), 0), wasTotal = groups.renew.reduce((a, r) => a + r.pay, 0);
  const open = data.talks_open;
  return (
    <div>
      <Panel title={`Winter renewals, ${state.year}-${String(state.year + 1).slice(2)}`} right={<span className="small muted">{open ? `Talks close Dec 31 · portal opens ${data.dates.portal ? shortDate(data.dates.portal) : "Jan 2"}` : "Talks are over"}</span>}>
        <div className="watchcounts">
          <div className="w-settled"><b>{groups.renew.length}</b><span>Auto-renewals{pending.length ? ` (${pending.length} to confirm)` : ""}</span></div>
          <div className="w-restless"><b>{groups.deal.length}</b><span>Need a new deal</span></div>
          <div className="w-gone"><b>{groups.portal.length}</b><span>Heading to the portal</span></div>
          <div style={{ background: "var(--muted, #6b7685)", color: "#fff" }}><b>{groups.gone.length}</b><span>Graduating or turning pro</span></div>
        </div>
        <p className="small muted">Players happy to stay are renewed at about what they're paid now, a little more after a big season and a little less after a quiet one.
          Nothing is official until you confirm it: revoke a renewal and he enters the portal on January 2 (or reopen it and negotiate yourself).
          Renewals you haven't confirmed by then are confirmed by your staff. Next season's budget: {money(b.total)}, {money(b.total - b.committed)} uncommitted.</p>
        {err && <p className="error small">{err}</p>}
      </Panel>

      <Panel title="Auto-renewals" right={open && pending.length ? <button className="primary" disabled={busy} onClick={() => act("renewal_confirm", {})}>Confirm all {pending.length}</button> : <span className="small muted">{money(renewTotal)} next season ({pctText(wasTotal ? renewTotal / wasTotal - 1 : 0)} on this season)</span>}>
        {!groups.renew.length ? <p className="muted">Your standing rule hasn't renewed anyone.</p> : (
          <table className="grid tight">
            <thead><tr><th>Player</th><th className="num">Ovr</th><th>This season</th><th className="num">Pays now</th><th className="num">Renewal</th><th className="num">Change</th><th>Why</th><th></th></tr></thead>
            <tbody>{groups.renew.map((r) => {
              const t = r.talk!, amt = t.deal!.amount, ch = r.pay ? amt / r.pay - 1 : 0;
              return (
                <tr key={r.pid}>
                  <td><a href={`#/l/${id}/player/${r.pid}/future`}>{r.name}</a> <span className="muted small">{r.pos} · {r.cls}{r.starter ? " · starter" : ""}</span></td>
                  <td className="num">{r.ovr}</td>
                  <td className="small muted">{r.line || "-"}</td>
                  <td className="num">{money(r.pay)}</td>
                  <td className="num"><b>{money(amt)}</b></td>
                  <td className={"num " + (ch > 0.005 ? "win" : ch < -0.005 ? "loss" : "muted")}>{r.pay ? pctText(ch) : "new"}</td>
                  <td className="small">{why(r)}</td>
                  <td className="nowrap small">{!t.pending ? <span className="win">Confirmed</span> : open ? <>
                    <button className="link small" disabled={busy} onClick={() => act("renewal_confirm", { pids: [r.pid] })}>Confirm</button>{" · "}
                    <button className="link small" disabled={busy} onClick={() => act("renewal_talk", { pid: r.pid, reopen: true })} title="Take back the renewal and negotiate with him yourself">Renegotiate</button>{" · "}
                    <button className="link small danger" disabled={busy} onClick={() => confirm(`Revoke ${r.name}'s renewal? He enters the portal on January 2.`) && act("renewal_talk", { pid: r.pid, let_go: true })}>Revoke</button>
                  </> : null}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </Panel>

      <Panel title="Need a new deal" right={<span className="small muted">they answer offers in a day or two</span>}>
        {!groups.deal.length ? <p className="muted">Nobody: everyone who wants a deal has one.</p> : (
          <table className="grid tight">
            <thead><tr><th>Player</th><th className="num">Ovr</th><th>Status</th><th className="num">Pays now</th><th className="num">He wants</th><th className="num">Market</th><th>Talks</th><th></th></tr></thead>
            <tbody>{groups.deal.map((r) => {
              const t = r.talk!, num = t.counter ?? t.ask!;
              return (
                <tr key={r.pid}>
                  <td><a href={`#/l/${id}/player/${r.pid}/future`}>{r.name}</a> <span className="muted small">{r.pos} · {r.cls}{r.starter ? " · starter" : ""}</span></td>
                  <td className="num">{r.ovr}</td>
                  <td className="small">{t.label}</td>
                  <td className="num">{money(r.pay)}</td>
                  <td className="num"><b>{money(num)}</b> <span className={"small " + (num > r.pay ? "loss" : "muted")}>{r.pay ? pctText(num / r.pay - 1) : ""}</span></td>
                  <td className="num muted">{t.market != null ? money(t.market) : "-"}</td>
                  <td className="small">{t.offer ? <>Offer out: {money(t.offer.amount)}, answer by {shortDate(t.offer.answer)}</>
                    : t.mine ? "You're handling it" : t.plan?.kind === "needs_you" ? <b className="needs">Needs you</b> : t.plan?.kind === "let_go" ? "Staff plan: let him go" : t.plan?.amount ? `Staff plan: up to ${money(t.plan.amount)}` : "Staff plan"}
                    {" · "}<span className="muted">patience {t.patience}</span></td>
                  <td className="nowrap small">{open && !t.offer && <>
                    <button className="link small" disabled={busy} onClick={() => act("renewal_offer", { pid: r.pid, amount: num, years: 1 })}>Pay {money(num)}</button>{" · "}
                    <a href={`#/l/${id}/player/${r.pid}/future`}>Negotiate</a>{" · "}
                    <button className="link small danger" disabled={busy} onClick={() => confirm(`Let ${r.name} go? He enters the portal on January 2.`) && act("renewal_talk", { pid: r.pid, let_go: true })}>Let go</button>
                  </>}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
        {groups.signed.length > 0 && <p className="small">Re-signed in talks: {groups.signed.map((r, i) => <span key={r.pid}>{i ? ", " : ""}<a href={`#/l/${id}/player/${r.pid}/future`}>{r.name}</a> {money(r.talk!.deal!.amount)}{r.talk!.deal!.years > 1 ? ` for ${r.talk!.deal!.years}` : ""}</span>)}.</p>}
      </Panel>

      <div className="cols even">
        <Panel title="Heading to the portal">
          {!groups.portal.length ? <p className="muted">Nobody yet.</p> : (
            <table className="grid tight"><tbody>{groups.portal.map((r) => {
              const t = r.talk!;
              return (
                <tr key={r.pid}>
                  <td><a href={`#/l/${id}/player/${r.pid}/future`}>{r.name}</a> <span className="muted small">{r.pos} · {r.ovr}</span></td>
                  <td>{t.outcome ? null : <WatchChip w={r.watch} />}</td>
                  <td className="small">{t.outcome === "let_go" ? <span className="loss">You let him go</span> : t.outcome === "portal" ? <span className="loss">Done talking</span>
                    : <>Money won't keep him: {r.watch.reasons.map((x) => x.label.toLowerCase()).join(", ") || "he wants a change"}</>}</td>
                  <td className="small">{!t.outcome && <a href={`#/l/${id}/player/${r.pid}/future`}>Talk</a>}</td>
                </tr>
              );
            })}</tbody></table>
          )}
        </Panel>
        <Panel title="Leaving anyway">
          {!groups.gone.length && !groups.locked.length ? <p className="muted">Nobody.</p> : (
            <table className="grid tight"><tbody>
              {groups.gone.map((r) => <tr key={r.pid}><td><a href={`#/l/${id}/player/${r.pid}`}>{r.name}</a> <span className="muted small">{r.pos} · {r.ovr}</span></td><td className="small muted">{r.talk!.label}</td></tr>)}
              {groups.locked.map((r) => <tr key={r.pid}><td><a href={`#/l/${id}/player/${r.pid}`}>{r.name}</a> <span className="muted small">{r.pos} · {r.ovr}</span></td><td className="small muted">Under contract: {money(r.next_deal?.amount ?? r.pay)}</td></tr>)}
            </tbody></table>
          )}
        </Panel>
      </div>
    </div>
  );
}
