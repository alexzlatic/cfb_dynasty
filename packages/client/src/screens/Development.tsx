import { useMemo, useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type DevelopmentView, type LabArea, type UnitRead } from "../api.ts";
import { shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";

/** A hidden score in points of margin, as a staff would say it. */
export function readWord(x: number): { text: string; tone: string } {
  if (x >= 3) return { text: "Big plus", tone: "win" };
  if (x >= 1.2) return { text: "Plus", tone: "win" };
  if (x > -1.2) return { text: "Even", tone: "muted" };
  if (x > -3) return { text: "Minus", tone: "loss" };
  return { text: "Big minus", tone: "loss" };
}

const signed = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)}`;

function contextLine(c: DevelopmentView["context"]): string {
  if (c.new_coach && c.new_qb) return "A new staff and a new quarterback: nobody knows yet how this team fits together, including the media.";
  if (c.new_coach) return "A new staff: how the roster fits the new systems is the big unknown this year.";
  if (c.new_qb) return "A new quarterback: chemistry on offense is the big unknown this year.";
  if (c.continuity) return "Same staff, same quarterback, most starters back: fewer surprises, and the locker room you had carries over.";
  return "Same staff, with some new starters.";
}

/** Your staff's read on your team's development, scheme fit and chemistry, and your players' development plans. */
export function DevelopmentScreen() {
  const { id, state } = useLeague();
  const data = useData(() => api.development(id), [state.date]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [sort, setSort] = useState<"growth" | "ovr" | "pos">("growth");
  const read = useMemo(() => new Map((data?.staff?.players ?? []).map((x) => [x.pid, x])), [data]);
  if (!data) return <p className="muted">Loading...</p>;
  if (data.team_id == null || !data.staff) return <Panel title="Player development"><p className="muted">Pick a team in Settings to run its development.</p></Panel>;
  const v = data.staff;
  const plans = Object.entries(data.lab).map(([pid, l]) => ({ pid: Number(pid), ...l }));
  const byId = new Map(data.players.map((p) => [p.pid, p]));
  const starters = new Set(Object.values(data.depth).map((ids) => ids[0]).filter((x) => x != null));
  const setPlan = async (pid: number, area: LabArea | null) => {
    setBusy(true); setErr(null);
    try { await api.act(id, "set_lab", { pid, area }); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const rows = [...data.players].sort((a, b) => sort === "ovr" ? b.ovr - a.ovr : sort === "pos" ? a.pos.localeCompare(b.pos) || b.ovr - a.ovr
    : (read.get(b.pid)?.growth ?? 0) - (read.get(a.pid)?.growth ?? 0));
  const unitRow = (label: string, k: keyof UnitRead) => (
    <tr><td>{label}</td>{(["off", "def"] as const).map((u) => { const x = v.units[u][k], w = readWord(x); return <td key={u}><span className={w.tone}>{w.text}</span> <span className="muted small">{signed(x)}</span></td>; })}</tr>
  );
  const planSelect = (pid: number) => (
    <select value={data.lab[pid]?.area ?? ""} disabled={busy || (!data.lab[pid] && plans.length >= data.slots)} onChange={(e) => setPlan(pid, (e.target.value || null) as LabArea | null)}>
      <option value="">No plan</option>
      {Object.entries(data.areas).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
  return (
    <div>
      <div className="cols even">
        <Panel title="What your staff sees">
          <p className="small">{contextLine(data.context)}</p>
          <table className="grid tight"><thead><tr><th></th><th>Offense</th><th>Defense</th></tr></thead><tbody>
            {unitRow("Development", "development")}
            {unitRow("Scheme fit", "fit")}
            {unitRow("Chemistry", "chemistry")}
          </tbody></table>
          <p className="small muted">Points per game against what the preseason ratings say. Your staff is about {Math.round(v.known * 100)}% sure of this read; it sharpens through fall camp and the season. The media, the polls and your opponents only see the preseason ratings until the results show them otherwise.</p>
        </Panel>
        <Panel title={`Development plans (${plans.length} of ${data.slots})`}>
          <p className="small muted">Your position coaches can give {data.slots} players an individual plan. A plan adds about two overall points over 80 days of work (two and a half at most in a year); a leadership plan builds team chemistry instead. Young players gain the most from a good locker room.</p>
          {!plans.length ? <p className="muted small">No plans yet. Pick an area next to a player.</p> : (
            <table className="grid tight"><tbody>{plans.map((l) => {
              const p = byId.get(l.pid);
              return <tr key={l.pid}><td><a href={`#/l/${id}/player/${l.pid}`}>{p?.name}</a> <span className="muted small">{p?.pos}</span></td><td>{planSelect(l.pid)}</td><td className="muted small nowrap">since {shortDate(l.from)}</td></tr>;
            })}</tbody></table>
          )}
          {err && <p className="error small">{err}</p>}
        </Panel>
      </div>
      <div>
        <Panel title="Player development" right={<span className="seg small">
          {(["growth", "ovr", "pos"] as const).map((k) => <button key={k} className={sort === k ? "on" : ""} onClick={() => setSort(k)}>{k === "growth" ? "Progress" : k === "ovr" ? "Overall" : "Position"}</button>)}</span>}>
          <table className="grid tight">
            <thead><tr><th>Player</th><th>Class</th><th className="num">Ovr</th><th className="num" title="Overall points scouts expected him to add by now">Expected</th>
              <th className="num" title="Your staff's read: progress beyond what was expected">Beyond</th><th className="num">Lead</th><th className="num" title="Adaptability to a new system">Adapt</th><th>Plan</th></tr></thead>
            <tbody>{rows.map((p) => {
              const r = read.get(p.pid);
              return (
                <tr key={p.pid} className={data.lab[p.pid] ? "mine" : ""}>
                  <td><a href={`#/l/${id}/player/${p.pid}`}>{p.name}</a> <span className="muted small">{p.pos}{starters.has(p.pid) ? "" : " (backup)"}</span></td>
                  <td className="muted">{p.class}</td><td className="num">{p.ovr}</td>
                  <td className="num muted">{r ? signed(r.expected) : ""}</td>
                  <td className={"num " + (r && r.growth >= 1 ? "win" : r && r.growth <= -1 ? "loss" : "")}>{r ? signed(r.growth) : ""}</td>
                  <td className="num">{r?.leadership}</td><td className="num">{r?.adaptability}</td>
                  <td>{planSelect(p.pid)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </Panel>
      </div>
    </div>
  );
}
