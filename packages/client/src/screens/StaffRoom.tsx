import React, { useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type RoomData, type RoomLine, type RoomProspect, type RoomSeat } from "../api.ts";
import { Panel } from "./common.tsx";

type Seat = RoomSeat["seat"];
type Kind = RoomLine["kind"];
type When = RoomLine["when"];

/** Colors by area, the same on every coach's bar and on the week's totals. */
const AREA_COLOR: Record<string, string> = { recruiting: "var(--series-1)", scouting: "var(--series-3)", prep: "var(--series-2)", opponent: "#b38a12", develop: "#8a6fd1" };
const VISIT_COLOR = "#c9a227";
const kindColor = (d: RoomData, k: Kind) => (k === "official" || k === "home" ? VISIT_COLOR : k === "upkeep" ? "#6aa7ee" : AREA_COLOR[d.tasks[k].area]);
const WHEN_LABEL: Record<When, string> = { all: "All year", in: "In season", off: "Out of season", week: "This week" };
const WHEN_TITLE: Record<When, string> = { all: "Runs every week all year (click to change)", in: "Runs every week in season, Aug 20 to Dec 14", off: "Runs every week out of season", week: "This week only: gone on Monday" };
const nextWhen = (w: When, season: boolean): When => (season ? (w === "in" ? "week" : "in") : ({ all: "in", in: "off", off: "week", week: "all" } as const)[w]);
const initials = (name: string) => name.split(" ").filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
const h1 = (x: number) => (Math.round(x * 10) / 10).toString();

/**
 * The staff room: your staff's whole week, coach by coach. Every line is work a coach does (a prospect, upkeep
 * on a group, a visit, a scouting trip or region, practice, film, development) and takes his hours. Prospects
 * and regions sent from the big board, a prospect's page or the map wait under Unassigned for a coach.
 */
export function StaffRoom() {
  const { id, state } = useLeague();
  const d = useData(() => api.room(id), [state.date]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const act = async (payload: Record<string, unknown>) => {
    setBusy(true); setErr(null);
    try { await api.act(id, "staff_room", payload); return true; } catch (e) { setErr((e as Error).message); return false; } finally { setBusy(false); }
  };
  if (!d) return <p className="muted">Loading...</p>;
  if (!d.available) return <Panel title="Staff room"><p className="muted">You need a team and recruiting to run a staff room.</p></Panel>;
  const head = (
    <div className="pagehead"><h2>Staff room</h2>
      <span className="muted">Your staff's week, coach by coach. Every line takes that coach's hours; what you don't place is lost on Monday. {d.in_season ? "In season now" : "Out of season now"}: practice, film and development {d.in_season ? "run" : "wait for August 20"}.</span></div>
  );
  if (!d.open) return (
    <div>
      {head}
      {err && <p className="error">{err}</p>}
      <Panel title="Set up your staff room">
        <p>Your staff splits its week by shares today. The staff room gives each coach his own week: the head coach and your coordinators
          have {d.seats[0].cap} flexible hours each, your recruiting staff 16 each, and you put every hour on a line of work. Your current split, contact hours,
          scouting trips and region hours carry over line for line, so nothing changes until you change it.</p>
        <p className="small muted">After this the Strategy overview shows the split your coaches' lines add up to, and your staff stops picking prospects on its own: the coaches work the prospects you give them, and "Fill open hours" puts the rest on your board.</p>
        <p><button className="primary" disabled={busy} onClick={() => act({ op: "open" })}>Set up the staff room</button></p>
      </Panel>
    </div>
  );
  const seats = d.seats;
  const total = seats.reduce((a, s) => a + s.cap, 0), used = seats.reduce((a, s) => a + Math.min(s.cap, s.used), 0);
  const a = d.areas!;
  return (
    <div className="room">
      {head}
      {err && <p className="error">{err}</p>}
      <Panel title="This week" right={<><span className="small muted">{h1(used)} of {total} hours placed · </span><button disabled={busy || used >= total} onClick={() => act({ op: "fill" })} title="Coaches take the best prospects on your board without a line, then upkeep on the rest; your recruiting staff takes upkeep on your commits">Fill open hours</button></>}>
        <div className="roomtotals">
          <Total color={AREA_COLOR.recruiting} label="Recruiting" hours={a.recruiting.hours} text={`${h1(a.recruiting.contact)} contact hours on ${a.recruiting.prospects} prospect${a.recruiting.prospects === 1 ? "" : "s"} · skill ${a.recruiting.skill}`} />
          <Total color={AREA_COLOR.scouting} label="Scouting" hours={a.scouting.hours} text={`${h1(a.scouting.fieldwork)} on trips and regions · skill ${a.scouting.skill}`} />
          <Total color={AREA_COLOR.prep} label="Practice" hours={a.prep.hours} text={d.in_season ? `A week of preparation is worth ${a.prep.factor.toFixed(2)} · skill ${a.prep.skill}` : "No game to prepare for"} />
          <Total color={AREA_COLOR.opponent} label="Opponent film" hours={a.opponent.hours} text={d.in_season ? `Film skill ${a.opponent.skill}` : "No opponent yet"} />
          <Total color={AREA_COLOR.develop} label="Development" hours={a.develop.hours} text={d.in_season ? `Plans at ${a.develop.pace.toFixed(2)}x pace` : "Plans at their usual pace"} />
          <Total label="Unspent" hours={Math.round((total - used) * 10) / 10} text={total - used > 0 ? "lost on Monday" : "every hour placed"} warn={total - used > 0} />
        </div>
      </Panel>
      <Tray d={d} busy={busy} act={act} />
      <div className="seats">{seats.map((s) => <SeatCard key={s.seat} d={d} s={s} busy={busy} act={act} />)}</div>
      <p className="small muted">Each coach's skill is what his hours are worth: recruiting per contact hour, scouting per trip and region, game planning per practice hour.
        A recruit's lead recruiter is the coach with the most contact hours on him; if that coach leaves your staff, the recruit loses a quarter of the relationship.
        The chip on a line says when it runs (all year, in season, out of season or this week only); click it to change. Drag a prospect or region from Unassigned onto a coach, or a line from one coach to another.</p>
    </div>
  );
}

function Total({ color, label, hours, text, warn }: { color?: string; label: string; hours: number; text: string; warn?: boolean }) {
  return (
    <div className="roomtotal">
      <span className="k">{color && <i style={{ background: color }} />}{label}</span>
      <b className={warn ? "warnv" : ""}>{h1(hours)} h</b>
      <small>{text}</small>
    </div>
  );
}

type Act = (payload: Record<string, unknown>) => Promise<boolean>;

/** Prospects and regions waiting for a coach. */
function Tray({ d, busy, act }: { d: RoomData; busy: boolean; act: Act }) {
  const { id } = useLeague();
  const pros = d.tray.filter((i) => i.kind === "prospect"), regs = d.tray.filter((i) => i.kind === "region");
  const assign = (kind: "prospect" | "region", key: string, seat: string) => seat && act({ op: "add", seat, kind: kind === "prospect" ? "contact" : "region", target: key, hours: kind === "prospect" ? d.tasks.contact.def : d.tasks.region.def });
  const pick = (kind: "prospect" | "region", key: string) => (
    <select value="" disabled={busy} aria-label="Assign to a coach" onChange={(e) => assign(kind, key, e.target.value)}>
      <option value="">Assign to…</option>
      {d.seats.filter((s) => s.cap > 0).map((s) => <option key={s.seat} value={s.seat}>{s.name}</option>)}
    </select>
  );
  return (
    <Panel title="Unassigned" right={<span className="small muted">Send prospects here from the <a href={`#/l/${id}/recruiting/board`}>Big board</a>, a prospect's page or the <a href={`#/l/${id}/recruiting/map`}>map</a></span>}>
      <div className="tray">
        <div className="trow"><b>Prospects</b>
          {pros.length ? pros.map((i) => (
            <span key={i.key} className="titem" draggable onDragStart={(e) => e.dataTransfer.setData("text/room", JSON.stringify({ tray: i.kind, key: i.key }))}>
              {i.prospect ? <><a href={`#/l/${id}/pitch/${i.key}`}>{i.label}</a> <span className="pos">{i.prospect.pos}</span> <small className="muted">{i.prospect.cls}</small></> : i.label}
              {pick("prospect", i.key)}
              <button className="link muted" disabled={busy} title="Take off Unassigned" onClick={() => act({ op: "tray", kind: i.kind, key: i.key, on: false })}>×</button>
            </span>)) : <span className="small muted">Nobody waiting.</span>}
        </div>
        <div className="trow"><b>Regions</b>
          {regs.length ? regs.map((i) => (
            <span key={i.key} className="titem" draggable onDragStart={(e) => e.dataTransfer.setData("text/room", JSON.stringify({ tray: i.kind, key: i.key }))}>
              {i.label}{pick("region", i.key)}
              <button className="link muted" disabled={busy} title="Take off Unassigned" onClick={() => act({ op: "tray", kind: i.kind, key: i.key, on: false })}>×</button>
            </span>)) : <span className="small muted">No regions waiting.</span>}
        </div>
        <div className="trow"><b>Automatic</b><span className="small muted">New commits join any upkeep line on your commits, and prospects you add to your board join upkeep on the rest of the board, on their own.</span></div>
      </div>
    </Panel>
  );
}

/** One coach's week: his lines, his hours left, and a button for every kind of work he can take. */
function SeatCard({ d, s, busy, act }: { d: RoomData; s: RoomSeat; busy: boolean; act: Act }) {
  const { id } = useLeague();
  const [adding, setAdding] = useState<Kind | null>(null);
  const [over, setOver] = useState(false);
  const left = Math.round((s.cap - s.used) * 10) / 10;
  const otherUsed = d.in_season ? s.used_off : s.used_in, otherLeft = Math.round((s.cap - otherUsed) * 10) / 10;
  const kinds = (Object.keys(d.tasks) as Kind[]).filter((k) => (s.seat === "staff" ? d.tasks[k].staff : !d.tasks[k].hc || s.seat === "HC"));
  // The bar: live hours by color, against his week.
  const segs = new Map<string, number>();
  for (const l of s.lines) if (l.given > 0) segs.set(kindColor(d, l.kind), (segs.get(kindColor(d, l.kind)) ?? 0) + l.given);
  const drop = async (e: React.DragEvent) => {
    e.preventDefault(); setOver(false);
    try {
      const x = JSON.parse(e.dataTransfer.getData("text/room"));
      if (x.line) await act({ op: "move", id: x.line, seat: s.seat });
      else if (x.tray === "prospect") await act({ op: "add", seat: s.seat, kind: "contact", target: x.key, hours: d.tasks.contact.def });
      else if (x.tray === "region") await act({ op: "add", seat: s.seat, kind: "region", target: x.key, hours: d.tasks.region.def });
    } catch { /* not ours */ }
  };
  if (s.cap === 0 && !s.lines.length) return (
    <div className="seat empty"><div className="who"><span className="av">{s.seat === "staff" ? "RS" : "—"}</span><div><b>{s.name}</b><div className="role">{s.role}</div></div></div>
      <p className="small muted">{s.seat === "staff" ? <>No recruiting staff. Hire some on the <a href={`#/l/${id}/strategy/overview`}>Strategy</a> screen: 16 hours a week each.</> : <>The job is open. Hire a coordinator on the <a href={`#/l/${id}/staff`}>Staff</a> screen.</>}</p></div>
  );
  return (
    <div className={"seat" + (left < 0 ? " over" : "") + (over ? " drag" : "")} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
      <div className="who">
        <span className="av">{s.seat === "staff" ? "RS" : initials(s.name)}</span>
        <div><b>{s.name}</b><div className="role">{s.role}</div></div>
        <div className="left"><b className={left < 0 ? "bad" : ""}>{h1(left)}</b><small>of {s.cap} h left</small></div>
      </div>
      {s.cap === 0 && <p className="small error">The job is open: these lines give nothing until you hire a coordinator.</p>}
      {s.skills && <div className="skillchips">{(["recruiting", "scouting", "game_planning", "development"] as const).map((k) => <span key={k}>{k === "game_planning" ? "Game planning" : k[0].toUpperCase() + k.slice(1)} <b>{s.skills![k]}</b></span>)}</div>}
      <div className="meter">{[...segs].map(([c, h]) => <span key={c} style={{ width: `${(100 * h) / Math.max(s.cap, s.used, 1)}%`, background: c }} />)}</div>
      <div className="small muted">{d.in_season ? "Out of season" : "In season"}: {h1(otherUsed)} of {s.cap} h placed{otherLeft < 0 ? <b className="bad"> · over, trimmed to fit</b> : ""}</div>
      <div className="lines">{s.lines.map((l) => <Line key={l.id} d={d} l={l} busy={busy} act={act} />)}{!s.lines.length && <span className="small muted">No work yet. Add some below or drag a prospect here.</span>}</div>
      <div className="addbar">{kinds.map((k) => <button key={k} className={"link" + (adding === k ? " on" : "")} disabled={busy} onClick={() => setAdding(adding === k ? null : k)}>+ {d.tasks[k].short}</button>)}</div>
      {adding && <AddLine key={adding} d={d} s={s} kind={adding} busy={busy} act={act} done={() => setAdding(null)} />}
    </div>
  );
}

function Line({ d, l, busy, act }: { d: RoomData; l: RoomLine; busy: boolean; act: Act }) {
  const { id } = useLeague();
  const [h, setH] = useState<string | null>(null);
  const info = d.tasks[l.kind];
  const fixed = !!info.fixed;
  const save = (v: number) => { setH(null); return act({ op: "set", id: l.id, hours: Math.max(0, v) }); };
  const step = l.kind === "upkeep" ? 2 : 1;
  const label = info.target === "prospect" ? <a href={`#/l/${id}/pitch/${l.target}`}>{l.label}</a> : l.label;
  return (
    <div className={"rline" + (l.live ? "" : " idle")} style={{ borderLeftColor: kindColor(d, l.kind) }} draggable={!fixed || l.kind === "trip"}
      onDragStart={(e) => e.dataTransfer.setData("text/room", JSON.stringify({ line: l.id }))} title={l.live ? undefined : "Not running this week"}>
      <div className="top">
        {info.target && <span className="kind">{info.short}</span>}
        <span className="what">{label}</span>
        {l.kind === "official" || l.kind === "home" ? null : <button className="x" disabled={busy} aria-label="Remove" title="Remove" onClick={() => act({ op: "remove", id: l.id })}>×</button>}
      </div>
      <div className="bot">
        <small>{l.sub}</small>
        {fixed ? null : <button className="when" disabled={busy} title={WHEN_TITLE[l.when]} onClick={() => act({ op: "when", id: l.id, when: nextWhen(l.when, !!info.season) })}>{WHEN_LABEL[l.when]}</button>}
        {fixed ? <span className="hrs">{h1(l.hours)} h</span> : (
          <span className="stepper">
            <button disabled={busy} aria-label="Fewer hours" onClick={() => save(l.hours - step)}>−</button>
            <input aria-label="Hours a week" value={h ?? h1(l.hours)} onChange={(e) => setH(e.target.value)} onBlur={() => h != null && save(Number(h) || 0)} onKeyDown={(e) => e.key === "Enter" && h != null && save(Number(h) || 0)} />
            <button disabled={busy} aria-label="More hours" onClick={() => save(l.hours + step)}>+</button>
          </span>)}
      </div>
    </div>
  );
}

/** Adding a line: pick what it points at (a prospect, region or group) and its hours. */
function AddLine({ d, s, kind, busy, act, done }: { d: RoomData; s: RoomSeat; kind: Kind; busy: boolean; act: Act; done: () => void }) {
  const info = d.tasks[kind];
  const pros = d.prospects.filter((p) => kind === "official" ? p.can_official : kind === "home" ? p.homes < 2 : true)
    .sort((a, b) => (a.lead === s.seat ? 0 : 1) - (b.lead === s.seat ? 0 : 1) || a.name.localeCompare(b.name));
  const choices: [string, string][] = info.target === "prospect" ? pros.map((p) => [String(p.id), prospectText(p)])
    : info.target === "region" ? Object.entries(d.regions).map(([k, n]) => [k, n + (k === d.home_region ? " (home)" : "")])
    : info.target === "group" ? d.groups.map((g) => [g.key, `${g.label} (${g.count})`]) : [];
  const [target, setTarget] = useState(choices[0]?.[0] ?? "");
  const [hours, setHours] = useState(String(info.def));
  const [trips, setTrips] = useState(d.default_trips);
  const near = info.target === "prospect" ? d.prospects.find((p) => String(p.id) === target)?.near : undefined;
  const cost = kind === "official" ? `${d.visit_hours.official - d.visit_hours.official_hc} of ${s.seat === "HC" ? "his" : "this coach's"} hours${s.seat === "HC" ? ` (+${d.visit_hours.official_hc})` : ` and ${d.visit_hours.official_hc} of the head coach's`}, this week; juniors and seniors, once each`
    : kind === "home" ? `${near ? d.visit_hours.coach_near : d.visit_hours.coach_far} hours this week (${near ? "near home" : "far away"}), twice per recruit at most`
    : kind === "trip" ? `${near ? d.trip_hours.near : d.trip_hours.far} hours a week (${near ? "near home" : "far away"}) until the trips are done, then a report`
    : kind === "upkeep" ? "spread evenly over the group each week" : kind === "contact" ? `up to ${d.max_contact} a week on one prospect` : "";
  const add = async () => {
    const ok = await act({ op: "add", seat: s.seat, kind, ...(info.target ? { target } : {}), ...(info.fixed ? {} : { hours: Number(hours) || info.def }), ...(kind === "trip" ? { trips } : {}) });
    if (ok) done();
  };
  return (
    <div className="addline">
      <b>{info.name}</b>
      {info.target && (choices.length ? <select value={target} onChange={(e) => setTarget(e.target.value)}>{choices.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        : <span className="small muted">{info.target === "prospect" ? "No prospects to pick: add some to your big board or send them here." : "Nothing to pick."}</span>)}
      {!info.fixed && <label className="small">Hours a week <input className="hrs" value={hours} onChange={(e) => setHours(e.target.value)} /></label>}
      {kind === "trip" && <label className="small">Trips <select value={trips} onChange={(e) => setTrips(Number(e.target.value))}>{[1, 2, 3, 4, 5, 6, 8, 10].map((n) => <option key={n} value={n}>{n}</option>)}</select></label>}
      <button className="primary" disabled={busy || (!!info.target && !target)} onClick={add}>Add</button>
      <button className="link" onClick={done}>Cancel</button>
      {cost && <small className="muted">{cost}. {!info.fixed && !info.season ? `Runs ${d.in_season ? "in season" : "out of season"}; the chip makes it all year.` : ""}</small>}
    </div>
  );
}

const prospectText = (p: RoomProspect) => `${p.name} (${p.pos}, ${p.cls}${p.stars ? `, ${"★".repeat(p.stars)}` : ""})${p.commit ? p.commit === "mine" ? " · committed to you" : ` · ${p.commit}` : ""}`;

/** The seats you can assign a prospect to straight from another screen. */
export const SEAT_OPTIONS: [Seat, string][] = [["HC", "Head coach"], ["OC", "Offensive coordinator"], ["DC", "Defensive coordinator"], ["STC", "Special teams coordinator"], ["staff", "Recruiting staff"]];

/** Send to the staff room: a button that puts a prospect or region under Unassigned, and a menu that gives him straight to a coach. */
export function RoomButtons({ kind, keyId, busy, act, assign = true }: { kind: "prospect" | "region"; keyId: string | number; busy: boolean; act: (type: string, payload: unknown) => unknown; assign?: boolean }) {
  return (
    <span className="roombtns">
      <button className="link" disabled={busy} title="Put under Unassigned in the staff room, for a coach to take" onClick={() => act("staff_room", { op: "tray", kind, key: String(keyId), on: true })}>Staff room</button>
      {assign && <select value="" disabled={busy} aria-label="Assign to a coach" onChange={(e) => e.target.value && act("staff_room", { op: "add", seat: e.target.value, kind: kind === "prospect" ? "contact" : "region", target: String(keyId), hours: kind === "prospect" ? 6 : 8 })}>
        <option value="">Assign to…</option>{SEAT_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
    </span>
  );
}

