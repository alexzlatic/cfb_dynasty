import { useEffect, useMemo, useState } from "react";
import { DEFENSE_SLOTS, OFFENSE_SLOTS, SLOT_LABELS, SLOT_POS, SPECIAL_SLOTS, type Slot } from "@cfb/core/players";
import { useData, useLeague } from "../App.tsx";
import { api, type DepthChart, type Injury, type RatedPlayer } from "../api.ts";
import { Logo } from "../util.tsx";
import { Panel } from "./common.tsx";
import { InjuryTag, Rating, outUntil, playerLink } from "./Players.tsx";

const DEEP: Partial<Record<Slot, number>> = { QB: 3, RB1: 3, RB2: 2, DE1: 3, DE2: 3, DT1: 3, DT2: 3, K: 2, P: 2, LS: 2 };

export function DepthScreen({ tid }: { tid: number }) {
  const { id, state, team } = useLeague();
  const data = useData(() => api.depth(id, tid), [tid]);
  const [draft, setDraft] = useState<DepthChart | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setDraft(null); }, [data]);
  const byId = useMemo(() => new Map((data?.players ?? []).map((p) => [p.id, p])), [data]);
  const hurt = useMemo(() => new Map((data?.injuries ?? []).map((i) => [i.pid, i])), [data]);
  if (!data) return <p className="muted">Loading...</p>;
  const t = team(tid);
  const mine = state.user_team_id === tid;
  const depth = draft ?? data.depth;
  const starterCount = new Map<number, number>();
  for (const s of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS]) { const x = depth[s]?.[0]; if (x != null) starterCount.set(x, (starterCount.get(x) ?? 0) + 1); }

  const redshirt = async (pid: number, on: boolean) => {
    setBusy(true); setErr(null);
    try { await api.act(id, "set_redshirt", { pid, on }); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const save = async (d: DepthChart | null) => {
    setBusy(true); setErr(null);
    try { await api.act(id, "set_depth", { team_id: tid, depth: d }); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const pick = (slot: Slot, i: number, pid: number | null) => {
    const list = [...(depth[slot] ?? [])];
    if (pid == null) list.splice(i, 1); else list[i] = pid;
    setDraft({ ...depth, [slot]: list.filter((x, j) => x != null && list.indexOf(x) === j) });
  };

  const group = (title: string, slots: Slot[]) => (
    <Panel title={title}>
      <table className="grid tight depth">
        <thead><tr><th>Slot</th><th>Starter</th><th>Second</th>{slots.some((s) => (DEEP[s] ?? 2) > 2) && <th>Third</th>}</tr></thead>
        <tbody>{slots.map((s) => (
          <tr key={s}>
            <td className="muted">{SLOT_LABELS[s]}</td>
            {Array.from({ length: Math.max(2, ...slots.map((x) => DEEP[x] ?? 2)) }, (_, i) => i < (DEEP[s] ?? 2) ? (
              <td key={i}>
                {mine ? <PlayerSelect slot={s} value={depth[s]?.[i] ?? null} players={data.players} hurt={hurt} onChange={(v) => pick(s, i, v)} />
                  : depth[s]?.[i] != null ? <Cell p={byId.get(depth[s]![i])} i={hurt.get(depth[s]![i])} /> : <span className="muted">-</span>}
                {mine && depth[s]?.[i] != null && <InjuryTag i={hurt.get(depth[s]![i])} />}
                {i === 0 && (starterCount.get(depth[s]?.[0] ?? -1) ?? 0) > 1 && <span className="warn small"> starts twice; his backup plays here</span>}
              </td>
            ) : <td key={i} />)}
          </tr>
        ))}</tbody>
      </table>
    </Panel>
  );

  return (
    <div>
      <div className="pagehead">
        <Logo team={t} size={40} /><h1>{t?.school} depth chart</h1>
        <span className="muted">{data.custom ? "Edited" : "Opening depth chart"}</span>
        {mine && (
          <span className="actions">
            {draft && <button className="primary" disabled={busy} onClick={() => save(draft)}>Save changes</button>}
            {draft && <button disabled={busy} onClick={() => setDraft(null)}>Discard</button>}
            <button disabled={busy} onClick={() => save(data.auto)} title="Best players at each slot by overall, with experience breaking ties">Auto-fill</button>
            {data.custom && <button disabled={busy} onClick={() => save(null)}>Back to opening</button>}
          </span>
        )}
      </div>
      {err && <p className="error">{err}</p>}
      {!mine && <p className="muted small">You can edit only your own team's depth chart.</p>}
      <div className="cols even">
        <div>{group("Offense", OFFENSE_SLOTS)}</div>
        <div>{group("Defense", DEFENSE_SLOTS)}{group("Special teams", SPECIAL_SLOTS)}
          {mine && <Redshirts players={data.players} gp={data.gp} list={data.redshirts} max={data.redshirt_games} busy={busy} onToggle={redshirt} />}</div>
      </div>
      <p className="muted small">Each game starts the first healthy player listed at each slot; tired players rotate out to the next one, and injured players are skipped until they are back. A player out of position plays well below a starter.</p>
    </div>
  );
}

/** Your redshirt list: each player on it plays in up to four games, then sits so he keeps the year. */
function Redshirts({ players, gp, list, max, busy, onToggle }: { players: RatedPlayer[]; gp: Record<number, number>; list: number[]; max: number; busy: boolean; onToggle: (pid: number, on: boolean) => void }) {
  const { id } = useLeague();
  const [all, setAll] = useState(false);
  const on = new Set(list);
  const rows = players.filter((p) => on.has(p.id) || all || (p.years === 0 && (gp[p.id] ?? 0) <= max))
    .sort((a, b) => +on.has(b.id) - +on.has(a.id) || b.ovr - a.ovr);
  return (
    <Panel title={`Redshirts (${list.length})`} right={<label className="small"><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Everyone</label>}>
      <p className="small muted">A redshirted player can play in up to {max} games and keep the year of eligibility. After {max} he sits; take him off the list to play him and use it up.</p>
      <table className="grid tight"><thead><tr><th>Player</th><th className="num">Games</th><th></th></tr></thead><tbody>{rows.slice(0, all ? 200 : 12).map((p) => {
        const g = gp[p.id] ?? 0;
        return (
          <tr key={p.id} className={on.has(p.id) ? "mine" : ""}>
            <td><Rating v={p.ovr} /> {playerLink(id, p)} <span className="muted small">{p.pos} {p.class}</span></td>
            <td className={"num" + (on.has(p.id) && g >= max ? " loss" : "")}>{g}{on.has(p.id) ? ` of ${max}` : ""}</td>
            <td>{on.has(p.id)
              ? <button disabled={busy} onClick={() => onToggle(p.id, false)}>{g >= max ? "Play him (uses it up)" : "Remove"}</button>
              : <button disabled={busy || g > max} onClick={() => onToggle(p.id, true)} title={g > max ? "Played too many games to redshirt" : ""}>Redshirt</button>}</td>
          </tr>
        );
      })}</tbody></table>
    </Panel>
  );
}

function Cell({ p, i }: { p: RatedPlayer | undefined; i?: Injury }) {
  const { id } = useLeague();
  if (!p) return <span className="muted">-</span>;
  return <span><Rating v={p.ovr} /> {playerLink(id, p)} <span className="muted small">{p.pos} {p.class}</span> <InjuryTag i={i} /></span>;
}

function PlayerSelect({ slot, value, players, hurt, onChange }: { slot: Slot; value: number | null; players: RatedPlayer[]; hurt: Map<number, Injury>; onChange: (v: number | null) => void }) {
  const fits = players.filter((p) => SLOT_POS[slot].includes(p.pos)).sort((a, b) => b.ovr - a.ovr);
  const others = players.filter((p) => !SLOT_POS[slot].includes(p.pos)).sort((a, b) => a.pos.localeCompare(b.pos) || b.ovr - a.ovr);
  const label = (p: RatedPlayer) => `${p.ovr} ${p.first.slice(0, 1)}. ${p.last} · ${p.pos} ${p.class}${hurt.has(p.id) ? ` · OUT (${outUntil(hurt.get(p.id)!)})` : ""}`;
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">(none)</option>
      <optgroup label={SLOT_POS[slot].join(" / ")}>{fits.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>
      <optgroup label="Out of position">{others.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>
    </select>
  );
}
