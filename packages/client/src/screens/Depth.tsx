import { useEffect, useMemo, useState } from "react";
import { DEFENSE_SLOTS, OFFENSE_SLOTS, SLOT_LABELS, SLOT_POS, SPECIAL_SLOTS, type Slot } from "@cfb/core/players";
import { useData, useLeague } from "../App.tsx";
import { api, type DepthChart, type RatedPlayer } from "../api.ts";
import { Logo } from "../util.tsx";
import { Panel } from "./common.tsx";
import { Rating, playerLink } from "./Players.tsx";

const DEEP: Partial<Record<Slot, number>> = { QB: 3, RB1: 3, RB2: 2, DE1: 3, DE2: 3, DT1: 3, DT2: 3, K: 2, P: 2, LS: 2 };

export function DepthScreen({ tid }: { tid: number }) {
  const { id, state, team } = useLeague();
  const data = useData(() => api.depth(id, tid), [tid]);
  const [draft, setDraft] = useState<DepthChart | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setDraft(null); }, [data]);
  const byId = useMemo(() => new Map((data?.players ?? []).map((p) => [p.id, p])), [data]);
  if (!data) return <p className="muted">Loading...</p>;
  const t = team(tid);
  const mine = state.user_team_id === tid;
  const depth = draft ?? data.depth;
  const starterCount = new Map<number, number>();
  for (const s of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS]) { const x = depth[s]?.[0]; if (x != null) starterCount.set(x, (starterCount.get(x) ?? 0) + 1); }

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
                {mine ? <PlayerSelect slot={s} value={depth[s]?.[i] ?? null} players={data.players} onChange={(v) => pick(s, i, v)} />
                  : depth[s]?.[i] != null ? <Cell p={byId.get(depth[s]![i])} /> : <span className="muted">-</span>}
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
        <div>{group("Defense", DEFENSE_SLOTS)}{group("Special teams", SPECIAL_SLOTS)}</div>
      </div>
      <p className="muted small">Each game uses the first healthy player listed at each slot. A player out of position plays well below a starter.</p>
    </div>
  );
}

function Cell({ p }: { p: RatedPlayer | undefined }) {
  const { id } = useLeague();
  if (!p) return <span className="muted">-</span>;
  return <span><Rating v={p.ovr} /> {playerLink(id, p)} <span className="muted small">{p.pos} {p.class}</span></span>;
}

function PlayerSelect({ slot, value, players, onChange }: { slot: Slot; value: number | null; players: RatedPlayer[]; onChange: (v: number | null) => void }) {
  const fits = players.filter((p) => SLOT_POS[slot].includes(p.pos)).sort((a, b) => b.ovr - a.ovr);
  const others = players.filter((p) => !SLOT_POS[slot].includes(p.pos)).sort((a, b) => a.pos.localeCompare(b.pos) || b.ovr - a.ovr);
  const label = (p: RatedPlayer) => `${p.ovr} ${p.first.slice(0, 1)}. ${p.last} · ${p.pos} ${p.class}`;
  return (
    <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">(none)</option>
      <optgroup label={SLOT_POS[slot].join(" / ")}>{fits.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>
      <optgroup label="Out of position">{others.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>
    </select>
  );
}
