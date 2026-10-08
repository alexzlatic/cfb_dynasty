import { useEffect, useMemo, useState, type DragEvent } from "react";
import { DEFENSE_SLOTS, OFFENSE_SLOTS, SLOT_LABELS, SLOT_POS, SPECIAL_SLOTS, type Slot } from "@cfb/core/players";
import { useData, useLeague } from "../App.tsx";
import { api, type DepthChart, type Injury, type RatedPlayer } from "../api.ts";
import { Logo } from "../util.tsx";
import { Panel } from "./common.tsx";
import { InjuryTag, Rating, outUntil, playerLink, ratingTier } from "./Players.tsx";

/** How many players a slot can list (the server's limit). */
const MAX_LIST = 4;

/** Slots shown together in one panel. */
export type SlotGroup = { title: string; slots: Slot[] };
/**
 * The screen's layout, by side. The defense is grouped by the existing positions for now; a coordinator's
 * scheme (4-3, 3-4, 3-3-5...) can swap in its own groups of slots here without touching the rest of the screen.
 */
export function depthSides(): { title: string; groups: SlotGroup[] }[] {
  const pick = (all: Slot[], ...keep: Slot[]) => all.filter((s) => keep.includes(s));
  return [
    { title: "Offense", groups: [
      { title: "Backfield", slots: pick(OFFENSE_SLOTS, "QB", "RB1", "RB2") },
      { title: "Receivers", slots: pick(OFFENSE_SLOTS, "WR_X", "WR_Z", "WR_SLOT", "WR4", "TE1", "TE2") },
      { title: "Offensive line", slots: pick(OFFENSE_SLOTS, "LT", "LG", "C", "RG", "RT") },
    ] },
    { title: "Defense", groups: [
      { title: "Defensive line", slots: pick(DEFENSE_SLOTS, "DE1", "DE2", "DT1", "DT2") },
      { title: "Linebackers", slots: pick(DEFENSE_SLOTS, "LB1", "LB2") },
      { title: "Secondary", slots: pick(DEFENSE_SLOTS, "CB1", "CB2", "NB", "S1", "S2") },
      { title: "Special teams", slots: SPECIAL_SLOTS },
    ] },
  ];
}

/** Your staff's read of a player's fit in the coaches' system (in SDs), in words. */
function fitWord(f: number): { label: string; cls: string } {
  return f >= 1 ? { label: "Ideal", cls: "fit-ideal" } : f >= 0.35 ? { label: "Good", cls: "fit-good" } : f > -0.35 ? { label: "Fair", cls: "fit-fair" }
    : f > -1 ? { label: "Poor", cls: "fit-poor" } : { label: "Bad", cls: "fit-bad" };
}

function FitTag({ f }: { f: number | undefined }) {
  if (f == null) return null;
  const w = fitWord(f);
  return <span className={`fit ${w.cls}`} title={`Your staff's read of how he fits the coaches' system: ${f >= 0 ? "+" : ""}${f.toFixed(1)} (0 is a typical fit). It sharpens through camp and the season.`}>{w.label}</span>;
}

/** Where a dragged player came from: a slot, or the unlisted pool (null). */
type Drag = { pid: number; from: Slot | null };
const copyKey = (e: DragEvent) => e.ctrlKey || e.altKey || e.metaKey;

export function DepthScreen({ tid }: { tid: number }) {
  const { id, state, team } = useLeague();
  const data = useData(() => api.depth(id, tid), [tid]);
  const [draft, setDraft] = useState<DepthChart | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [over, setOver] = useState<{ slot: Slot | null; idx: number } | null>(null);
  useEffect(() => { setDraft(null); }, [data]);
  const byId = useMemo(() => new Map((data?.players ?? []).map((p) => [p.id, p])), [data]);
  const hurt = useMemo(() => new Map((data?.injuries ?? []).map((i) => [i.pid, i])), [data]);
  if (!data) return <p className="muted">Loading...</p>;
  const t = team(tid);
  const mine = state.user_team_id === tid;
  const depth = draft ?? data.depth;
  const starterCount = new Map<number, number>();
  for (const s of [...OFFENSE_SLOTS, ...DEFENSE_SLOTS]) { const x = depth[s]?.[0]; if (x != null) starterCount.set(x, (starterCount.get(x) ?? 0) + 1); }
  const listed = new Set(Object.values(depth).flat());

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
  /**
   * Move a player to place `at` of slot `to`: within a slot reorders it; into another slot moves him there
   * (or lists him at both when `copy`); `to` null takes him off `from`. A slot lists a player once, at most MAX_LIST.
   */
  const move = (pid: number, from: Slot | null, to: Slot | null, at: number, copy = false) => {
    const next: DepthChart = { ...depth };
    let idx = at;
    if (from && (from === to || !copy)) {
      const src = [...(next[from] ?? [])];
      const i = src.indexOf(pid);
      if (i >= 0) { src.splice(i, 1); if (from === to && i < idx) idx--; }
      next[from] = src;
    }
    if (to) {
      const dst = (next[to] ?? []).filter((x) => x !== pid);
      dst.splice(Math.min(idx, dst.length), 0, pid);
      next[to] = dst.slice(0, MAX_LIST);
    }
    setDraft(next);
  };

  const dragProps = (d: Drag) => mine ? {
    draggable: true,
    onDragStart: (e: DragEvent) => { e.dataTransfer.effectAllowed = "copyMove"; e.dataTransfer.setData("text/plain", String(d.pid)); setDrag(d); },
    onDragEnd: () => { setDrag(null); setOver(null); },
  } : {};
  /** A drop target: a row (before or after it, by which half the pointer is over), a slot's end, or the pool. */
  const dropProps = (slot: Slot | null, idx: number | null) => mine ? {
    onDragOver: (e: DragEvent) => {
      if (!drag) return;
      e.preventDefault(); e.stopPropagation();
      e.dataTransfer.dropEffect = drag.from && slot && slot !== drag.from && copyKey(e) ? "copy" : "move";
      let at = idx ?? (slot ? (depth[slot]?.length ?? 0) : 0);
      if (idx != null) { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); if (e.clientY > r.top + r.height / 2) at = idx + 1; }
      if (over?.slot !== slot || over.idx !== at) setOver({ slot, idx: at });
    },
    onDrop: (e: DragEvent) => {
      if (!drag) return;
      e.preventDefault(); e.stopPropagation();
      if (slot || drag.from) move(drag.pid, drag.from, slot, over && over.slot === slot ? over.idx : (slot ? depth[slot]?.length ?? 0 : 0), copyKey(e));
      setDrag(null); setOver(null);
    },
  } : {};

  const row = (slot: Slot, pid: number, i: number) => {
    const p = byId.get(pid);
    const list = depth[slot] ?? [];
    const oop = p && !SLOT_POS[slot].includes(p.pos);
    const at = over?.slot === slot ? over.idx : -1;
    const cls = ["drow", i === 0 ? "starter" : "", drag?.pid === pid && drag.from === slot ? "dragging" : "",
      at === i ? "drop-before" : "", at === i + 1 && i === list.length - 1 ? "drop-after" : ""].filter(Boolean).join(" ");
    return (
      <li key={pid} className={cls} data-pid={pid} {...dragProps({ pid, from: slot })} {...dropProps(slot, i)}>
        {mine && <span className="grip" aria-hidden>⋮⋮</span>}
        <span className="dnum">{i + 1}</span>
        {p ? <>
          <Rating v={p.ovr} />
          <span className="obar" title={`Overall ${p.ovr}`}><span className={ratingTier(p.ovr)} style={{ width: `${Math.max(4, Math.min(100, (p.ovr - 40) / 0.59))}%` }} /></span>
          <span className="dname" title={`${p.first} ${p.last}, ${p.pos} ${p.class}`}><a href={`#/l/${id}/player/${p.id}`}>{p.first.slice(0, 1)}. {p.last}</a> <span className="muted small">{p.class}</span></span>
          <FitTag f={data.fit?.[pid]} />
          {oop && <span className="oop" title={`A ${p.pos} playing ${SLOT_LABELS[slot].toLowerCase()} plays well below a starter`}>Out of pos.</span>}
          <InjuryTag i={hurt.get(pid)} />
          {i === 0 && (starterCount.get(pid) ?? 0) > 1 && <span className="warn small" title="He starts at two slots; his backup plays here">x2</span>}
        </> : <span className="muted">-</span>}
        {mine && (
          <span className="dbtns">
            <button disabled={i === 0} onClick={() => move(pid, slot, slot, i - 1)} title="Move up" aria-label={`Move ${p?.last ?? ""} up`}>▲</button>
            <button disabled={i === list.length - 1} onClick={() => move(pid, slot, slot, i + 2)} title="Move down" aria-label={`Move ${p?.last ?? ""} down`}>▼</button>
            <button onClick={() => move(pid, slot, null, 0)} title="Take him off this slot" aria-label={`Remove ${p?.last ?? ""}`}>×</button>
          </span>
        )}
      </li>
    );
  };

  const slotBox = (slot: Slot) => {
    const list = depth[slot] ?? [];
    return (
      <div key={slot} className={"dslot" + (drag && over?.slot === slot ? " over" : "")} data-slot={slot} {...dropProps(slot, null)}>
        <div className="dslot-head"><strong>{SLOT_LABELS[slot]}</strong> <span className="muted small">{SLOT_POS[slot].join(" / ")}</span></div>
        <ol className="dlist">
          {list.map((pid, i) => row(slot, pid, i))}
          {!list.length && <li className="drow empty"><span className="muted small">{mine ? "Drag a player here" : "Nobody listed"}</span></li>}
        </ol>
        {mine && list.length < MAX_LIST && <PlayerSelect slot={slot} players={data.players} hurt={hurt} onChange={(v) => move(v, null, slot, list.length)} />}
      </div>
    );
  };

  const unlisted = data.players.filter((p) => !listed.has(p.id)).sort((a, b) => a.pos.localeCompare(b.pos) || b.ovr - a.ovr);

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
      {mine ? <p className="muted small">Drag players to reorder a slot or move them to another; hold Ctrl (or Alt) as you drop to list a player at both. The arrows and the add list do the same from the keyboard. Fit is your staff's read of how each player suits the coaches' system.</p>
        : <p className="muted small">You can edit only your own team's depth chart.</p>}
      <div className="cols even">
        {depthSides().map((side) => (
          <div key={side.title}>
            {side.groups.map((g) => <Panel key={g.title} title={g.title}><div className="dslots">{g.slots.map(slotBox)}</div></Panel>)}
          </div>
        ))}
      </div>
      {mine && (
        <div className="cols even">
          <div className={"dpool" + (drag?.from && over?.slot === null ? " over" : "")} {...dropProps(null, null)}>
            <Panel title={`Not on the depth chart (${unlisted.length})`}>
              <p className="small muted">Drag from here onto a slot; drag a listed player here to take him off that slot.</p>
              <ul className="dpool-list">{unlisted.map((p) => (
                <li key={p.id} className="drow" data-pid={p.id} {...dragProps({ pid: p.id, from: null })}>
                  <span className="grip" aria-hidden>⋮⋮</span><Rating v={p.ovr} />
                  <span className="dname">{playerLink(id, p)} <span className="muted small">{p.pos} {p.class}</span></span>
                  <FitTag f={data.fit?.[p.id]} /><InjuryTag i={hurt.get(p.id)} />
                </li>
              ))}</ul>
            </Panel>
          </div>
          <div><Redshirts players={data.players} gp={data.gp} list={data.redshirts} max={data.redshirt_games} busy={busy} onToggle={redshirt} /></div>
        </div>
      )}
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

/** Add a player to a slot from the keyboard: his position first, then everyone else. */
function PlayerSelect({ slot, players, hurt, onChange }: { slot: Slot; players: RatedPlayer[]; hurt: Map<number, Injury>; onChange: (v: number) => void }) {
  const fits = players.filter((p) => SLOT_POS[slot].includes(p.pos)).sort((a, b) => b.ovr - a.ovr);
  const others = players.filter((p) => !SLOT_POS[slot].includes(p.pos)).sort((a, b) => a.pos.localeCompare(b.pos) || b.ovr - a.ovr);
  const label = (p: RatedPlayer) => `${p.ovr} ${p.first.slice(0, 1)}. ${p.last} · ${p.pos} ${p.class}${hurt.has(p.id) ? ` · OUT (${outUntil(hurt.get(p.id)!)})` : ""}`;
  return (
    <select className="dadd" value="" aria-label={`Add a player at ${SLOT_LABELS[slot]}`} onChange={(e) => e.target.value && onChange(Number(e.target.value))}>
      <option value="">+ Add a player...</option>
      <optgroup label={SLOT_POS[slot].join(" / ")}>{fits.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>
      <optgroup label="Out of position">{others.map((p) => <option key={p.id} value={p.id}>{label(p)}</option>)}</optgroup>
    </select>
  );
}
