import { useMemo, useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type PayrollPlayer } from "../api.ts";
import { Logo, money } from "../util.tsx";

/** A player's morale about pay and playing time, in words (as in core's morale.ts). */
const moodWord = (m: number) => (m >= 0.25 ? "Happy" : m > -0.25 ? "Content" : m > -0.8 ? "Unhappy" : "Angry");
import { Panel } from "./common.tsx";

type Sort = "value" | "pay" | "pos" | "gap";

/** Revenue-share contracts: what every player is worth, what you pay him, and football's budget. */
export function PayrollScreen({ tid }: { tid?: number }) {
  const { id, state, team } = useLeague();
  const data = useData(() => api.payroll(id, tid), [state.date, tid]);
  const [sort, setSort] = useState<Sort>("value");
  const [edit, setEdit] = useState<{ pid: number; amount: string; years: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rows = useMemo(() => {
    const pay = (p: PayrollPlayer) => (p.contract?.amount ?? 0) + (p.nil?.amount ?? 0);
    return [...(data?.players ?? [])].sort((a, b) => sort === "pay" ? pay(b) - pay(a) || b.value - a.value : sort === "pos" ? a.pos.localeCompare(b.pos) || b.value - a.value
      : sort === "gap" ? (pay(a) - a.value) - (pay(b) - b.value) : b.value - a.value || b.ovr - a.ovr);
  }, [data, sort]);
  if (!data) return <p className="muted">Loading...</p>;
  if (data.team_id == null) return <Panel title="Payroll"><p className="muted">Pick a team in Settings to run its payroll.</p></Panel>;
  const t = team(data.team_id);
  const room = data.pool - data.payroll;
  const sign = async (pid: number, amount: number, years: number) => {
    setBusy(true); setErr(null);
    try { await api.act(id, "sign_contract", { pid, amount, years }); setEdit(null); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const editor = (p: PayrollPlayer) => {
    if (!edit || edit.pid !== p.pid) return null;
    const amount = Math.round(Number(edit.amount) * 1000);
    return (
      <span className="nowrap">
        $<input className="num" style={{ width: "6em" }} value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} />K a year for{" "}
        <select value={edit.years} onChange={(e) => setEdit({ ...edit, years: Number(e.target.value) })}>
          {Array.from({ length: p.eligibility }, (_, i) => i + 1).map((y) => <option key={y} value={y}>{y} {y === 1 ? "season" : "seasons"}</option>)}
        </select>{" "}
        <button disabled={busy || !Number.isFinite(amount)} onClick={() => sign(p.pid, amount, edit.years)}>Sign</button>{" "}
        <button className="link" onClick={() => setEdit(null)}>Cancel</button>
      </span>
    );
  };
  return (
    <div>
      <div className="cols even">
        <Panel title={<><Logo team={t} size={22} /> {t?.school} payroll, {data.year}-{String(data.year + 1).slice(2)}</>}>
          <table className="grid tight"><tbody>
            <tr><td>Football's revenue-share budget</td><td className="num">{money(data.pool)}</td></tr>
            <tr><td>Signed</td><td className="num">{money(data.payroll)}</td></tr>
            <tr><td>Room</td><td className={"num " + (room < 0 ? "loss" : "")}>{money(room)}</td></tr>
            <tr><td className="muted">Players' market value (all {data.players.length})</td><td className="num muted">{money(data.players.reduce((a, p) => a + p.value, 0))}</td></tr>
          </tbody></table>
          {data.mood && <p className="small">Locker room: pay and playing time are worth {data.mood.off >= 0 ? "+" : ""}{data.mood.off.toFixed(1)} points a game on offense and {data.mood.def >= 0 ? "+" : ""}{data.mood.def.toFixed(1)} on defense, against an average team.</p>}
          <p className="small muted">The revenue-share cap is {money(data.cap)} a school this year for every sport; most schools give football about {Math.round(data.football_share * 100)}% of it.
            A player's value is what the national market pays a player like him (revenue share and NIL together).
            Each week players weigh their pay against teammates (what your school pays for value) and their playing time against their worth: an underpaid starter, a benched star or a backup paid like a starter costs chemistry.</p>
        </Panel>
        <Panel title={`${t?.conference} payrolls`}>
          <table className="grid tight"><thead><tr><th>School</th><th className="num">Signed</th><th className="num">Budget</th></tr></thead><tbody>
            {data.conference.map((r) => <tr key={r.team_id} className={r.team_id === state.user_team_id ? "mine" : ""}>
              <td><Logo team={team(r.team_id)} size={18} /> <a href={`#/l/${id}/payroll/${r.team_id}`}>{team(r.team_id)?.school}</a></td>
              <td className="num">{money(r.payroll)}</td><td className="num muted">{money(r.pool)}</td></tr>)}
          </tbody></table>
        </Panel>
      </div>
      <Panel title="Players" right={<span className="seg small">
        {(["value", "pay", "gap", "pos"] as const).map((k) => <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{k === "value" ? "Value" : k === "pay" ? "Paid most" : k === "gap" ? "Most underpaid" : "Position"}</button>)}</span>}>
        {err && <p className="error small">{err}</p>}
        <table className="grid tight">
          <thead><tr><th>Player</th><th>Class</th><th className="num">Ovr</th><th className="num">GP</th><th className="num">Value</th><th className="num">Revenue share</th><th className="num" title="His collective deal">NIL</th><th className="num" title="Revenue share and NIL as a share of his value">Of value</th><th>Through</th><th title="How he feels about his pay and playing time">Mood</th>{data.mine && <th></th>}</tr></thead>
          <tbody>{rows.map((p) => {
            const pay = p.contract?.amount ?? 0, nil = p.nil?.amount ?? 0, pct = p.value ? (pay + nil) / p.value : null;
            return (
              <tr key={p.pid}>
                <td><a href={`#/l/${id}/player/${p.pid}`}>{p.name}</a> <span className="muted small">{p.pos}{p.starter ? "" : " (backup)"}</span></td>
                <td className="muted">{p.class}</td><td className="num">{p.ovr}</td><td className="num muted">{p.gp}</td>
                <td className="num">{money(p.value)}</td><td className="num">{pay ? money(pay) : <span className="muted">none</span>}</td><td className="num muted">{nil ? money(nil) : ""}</td>
                <td className={"num " + (pct == null ? "" : pct < 0.5 && p.starter ? "loss" : pct > 1.2 ? "win" : "muted")}>{pct == null ? "" : `${Math.round(pct * 100)}%`}</td>
                <td className="muted small">{p.contract ? `${p.contract.start + p.contract.years - 1}-${String(p.contract.start + p.contract.years).slice(2)}` : ""}</td>
                <td className={"small " + (p.morale <= -0.25 ? "loss" : p.morale >= 0.25 ? "win" : "muted")}>{moodWord(p.morale)}</td>
                {data.mine && <td>{editor(p) ?? <button className="link small" onClick={() => setEdit({ pid: p.pid, amount: String(Math.round((pay || p.value) / 1000)), years: Math.min(p.eligibility, p.contract?.years ?? 1) })}>{pay ? "Change" : "Offer"}</button>}</td>}
              </tr>
            );
          })}</tbody>
        </table>
      </Panel>
    </div>
  );
}
