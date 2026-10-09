import { useEffect, useMemo, useRef, useState } from "react";
import { useLeague } from "../App.tsx";
import { api, type LiveMode, type LiveResult, type UserCall } from "../api.ts";
import type { PlayRecord } from "@cfb/engine";
import { Logo } from "../util.tsx";
import { Panel } from "./common.tsx";
import { FieldView } from "./Field.tsx";

/** Milliseconds per snap at each pace; the rest of the log (timeouts, subs, kicks after scores) goes quicker. */
const PACE: Record<string, number> = { instant: 0, fast: 1300, slow: 2600 };
const QUICK: Record<string, number> = { TIMEOUT: 0.3, SUB: 0.3, INJURY: 0.5, END: 0.5, PENALTY: 0.6, PAT: 0.6 };
const playMs = (p: PlayRecord | undefined, pace: string) => (PACE[pace] ?? 1300) * (p ? QUICK[p.play_type] ?? 1 : 1);
const ORD = ["", "1st", "2nd", "3rd", "4th"];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const qtr = (q: number, ot = false) => (ot || q > 4 ? "OT" : `Q${q}`);
const ALERT_TEXT: Record<string, string> = {
  fourth_down: "4th down decision", two_point: "Two-point decision", two_minute: "Two-minute situation", defend_late: "They're driving late",
  overtime: "Overtime", qb_hurt: "Your quarterback is hurt", starter_hurt: "A starter is hurt", red_zone: "Red zone", quarter: "New quarter",
  clock: "Clock running",
};
const TEMPOS: [string, string][] = [["auto", "Coordinator"], ["normal", "Normal"], ["uptempo", "Up-tempo"], ["hurry", "Hurry-up"], ["milk", "Bleed clock"]];

function readPace(): string { try { return localStorage.getItem("cfb.pace") ?? "fast"; } catch { return "fast"; } }

/** Your game, live: scoreboard, field, play-by-play and the call panel. */
export function LiveScreen() {
  const { id, state, team } = useLeague();
  const [view, setView] = useState<LiveResult | null>(null);
  const [plays, setPlays] = useState<PlayRecord[]>([]);
  const [shown, setShown] = useState(0);
  const [pace, setPace] = useState(readPace);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const loaded = useRef(false);
  // When the play on the field started, so the next one waits only for what's left of it.
  const revealedAt = useRef(0);
  const [settled, setSettled] = useState(-1);
  // A play picked from the play-by-play to watch again (index), and a counter so the same one can rerun.
  const [replay, setReplay] = useState<{ i: number; n: number } | null>(null);

  const take = (v: LiveResult | null, skip = false) => {
    if (!v) return;
    setView(v);
    setPlays((old) => [...old.slice(0, v.since), ...v.plays]);
    if (skip) setShown(v.since + v.plays.length);
  };
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    api.live(id).then((v) => { if (v) { take(v); setShown(v.plays.length); } }).catch((e) => setErr(e.message));
  }, [id]);
  // Reveal new plays one at a time at the chosen pace.
  useEffect(() => {
    if (shown >= plays.length) return;
    if (!PACE[pace]) { setShown(plays.length); return; }
    const ms = shown > 0 ? playMs(plays[shown - 1], pace) : 0;
    const t = setTimeout(() => { revealedAt.current = performance.now(); setReplay(null); setShown((n) => n + 1); }, Math.max(0, revealedAt.current + ms - performance.now()));
    return () => clearTimeout(t);
  }, [shown, plays.length, pace]);

  const act = async (f: () => Promise<LiveResult>, skip = false) => {
    setBusy(true); setErr(null);
    try { take(await f(), skip); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  // Sim to the end jumps straight to the final instead of replaying the rest of the game.
  const call = (c: UserCall, toEnd = false) => act(() => api.liveCall(id, c, plays.length, toEnd), toEnd);
  const qbs = useMemo(() => {
    const s = new Set<string>();
    for (const p of plays) { const m = /^(.+?) (?:pass |sacked|scrambles|kneels)/.exec(p.description); if (m) s.add(m[1]); }
    return s;
  }, [plays.length]);
  const setMode = (m: Partial<LiveMode>) => act(() => api.liveMode(id, m));
  const setClock = (c: { tempo?: string; manual_timeouts?: boolean }) => act(() => api.liveClock(id, c));
  const timeout = () => act(() => api.liveTimeout(id, plays.length));
  const savePace = (p: string) => { setPace(p); try { localStorage.setItem("cfb.pace", p); } catch { /* private window */ } };

  const g = state.my_next_game;
  const today = g && g.date === state.date;
  if (!view) {
    return (
      <Panel title="Game day">
        {err && <p className="error">{err}</p>}
        {today ? (
          <div className="livestart">
            <p><Logo team={team(g!.away_id)} size={36} /> {team(g!.away_id)?.school} {g!.neutral ? "vs" : "at"} <Logo team={team(g!.home_id)} size={36} /> {team(g!.home_id)?.school}</p>
            <p className="muted">Call every snap yourself, or let your coordinators call it and stop you at key moments. You can switch any time.</p>
            <div className="row">
              <button className="primary" disabled={busy} onClick={() => act(() => api.liveStart(id, { offense: "me", defense: "coordinator" }))}>Call my offense</button>
              <button disabled={busy} onClick={() => act(() => api.liveStart(id, { offense: "me", defense: "me" }))}>Call offense and defense</button>
              <button disabled={busy} onClick={() => act(() => api.liveStart(id, { offense: "coordinator", defense: "coordinator" }))}>Coordinators call it, alert me</button>
            </div>
          </div>
        ) : <p className="muted">Your team doesn't play today. Use <b>To my next game</b> to sim to game day.</p>}
      </Panel>
    );
  }

  const H = team(view.home_id), A = team(view.away_id);
  // Still showing plays the server has already played (the last one counts until its dots stop).
  const revealing = shown < plays.length || (PACE[pace] > 0 && shown > 0 && settled !== shown && !replay);
  const last = revealing ? plays[Math.max(0, shown - 1)] : null;
  // While a play is on the field the scoreboard shows the snap it came from (the score after it).
  const sb = last
    ? { q: last.quarter, clock: last.clock, hs: last.home_score, as: last.away_score }
    : { q: view.quarter, clock: view.clock, hs: view.home_score, as: view.away_score };
  // The play-by-play lists a play once it has finished on the field.
  const listed = last ? shown - 1 : shown;
  const ytg = view.yards_to_goal;
  const offTeam = view.possession === "home" ? H : A;
  const spot = ytg > 50 ? `${offTeam?.abbr ?? ""} ${100 - ytg}` : ytg === 50 ? "50" : `${(view.possession === "home" ? A : H)?.abbr ?? ""} ${ytg}`;
  const st = view.stop;
  const stopTitle = !st ? "" : st.kind === "playCall" ? (st.role === "offense" ? "Call the play" : "Call the defense")
    : st.kind === "fourthDown" ? "4th down" : st.kind === "twoPoint" ? "After the touchdown" : st.kind === "onside" ? "Kickoff"
    : st.kind === "timeout" ? (st.situation.clock <= 0 ? "The clock has run out" : "The clock is running") : "Victory formation?";
  const cc = view.clock_control;
  const myTimeouts = view.user_side === "home" ? view.home_timeouts : view.away_timeouts;
  const stopped = !!st && !revealing && !view.final;
  const toCall = (x: string): UserCall => (x === "true" ? true : x === "false" ? false : (x as UserCall));

  return (
    <div className="live">
      <div className="scoreboard">
        <div className="sbteam"><Logo team={A} size={44} /><span className="sbname">{A?.school}</span>{view.possession === "away" && !view.final && <span className="ball">●</span>}<span className="sbscore">{sb.as}</span></div>
        <div className="sbmid">
          <div className="sbclock">{view.final && !revealing ? "Final" : `${qtr(sb.q, view.overtime)} ${clock(sb.clock)}`}</div>
          {last ? <div className="small">{last.down ? `${ORD[last.down]} & ${last.distance >= last.yards_to_goal ? "Goal" : last.distance} at ${last.yardline}` : "\u00a0"}</div>
            : !view.final && <div className="small">{ORD[view.down] ?? view.down} &amp; {view.distance >= ytg ? "Goal" : view.distance} at {spot}</div>}
          <div className="small muted">Timeouts {A?.abbr} {view.away_timeouts} · {H?.abbr} {view.home_timeouts}</div>
        </div>
        <div className="sbteam right"><span className="sbscore">{sb.hs}</span>{view.possession === "home" && !view.final && <span className="ball">●</span>}<span className="sbname">{H?.school}</span><Logo team={H} size={44} /></div>
      </div>
      <div className="livetop">
        <div>
          {(() => {
            const i = replay ? replay.i : shown - 1;
            // A play that has already finished doesn't run again when a replay ends.
            const ms = i < 0 || (!replay && settled === shown) ? 0 : playMs(plays[i], replay && !PACE[pace] ? "fast" : pace);
            return <FieldView home={H} away={A} qbs={qbs} play={i >= 0 ? plays[i] : null} playKey={replay ? -replay.n : shown} ms={ms}
              onSettled={(k) => (k < 0 ? setReplay(null) : setSettled(k))}
              idle={view.final || revealing ? null : { offHome: view.possession === "home", ytg, distance: view.distance }} />;
          })()}
          <p className="small muted fieldskip">
            {replay ? <>Replay: {qtr(plays[replay.i].quarter)} {clock(plays[replay.i].clock)} <button className="link" onClick={() => setReplay(null)}>Back to the game</button></>
              : shown < plays.length ? <>Play {shown} of {plays.length} <button className="link" onClick={() => setShown(plays.length)}>Skip to now</button></>
              : "Click a play in the play-by-play to watch it again."}
          </p>
        </div>
        <div>
          {view.final && !revealing ? (
            <Panel title="Final">
              <p><b>{view.home_score > view.away_score ? H?.school : A?.school}</b> win {Math.max(view.home_score, view.away_score)}-{Math.min(view.home_score, view.away_score)}.
                The rest of today's games have been played.</p>
              {view.result && <a className="button" href={`#/l/${id}/game/${view.result.id}`}>Box score and recap</a>}
            </Panel>
          ) : st && !revealing ? (
            <Panel title={stopTitle} right={st.alert ? <span className="tag alert">{ALERT_TEXT[st.alert] ?? st.alert}</span> : undefined}>
              <div className="calls">
                {st.options.map((o) => (
                  <button key={o.id} disabled={busy} className={String(st.suggestion) === o.id ? "suggested" : ""} onClick={() => call(toCall(o.id))}>{o.label}</button>
                ))}
              </div>
              {(cc.plays.length > 0 || st.kind !== "timeout") && (
                <div className="calls clockrow">
                  {cc.plays.map((o) => <button key={o.id} disabled={busy} onClick={() => call(o.id)}>{o.label}</button>)}
                  {st.kind !== "timeout" && (
                    <button disabled={busy || !cc.can_timeout} onClick={timeout}
                      title={myTimeouts === 0 ? "No timeouts left this half" : !cc.running ? "The clock is already stopped" : "Stop the clock where the last play ended"}>
                      Timeout ({myTimeouts} left)
                    </button>
                  )}
                </div>
              )}
              {st.kind === "timeout" ? <p className="small muted">You're calling your own timeouts: {myTimeouts} left this half.</p> : (
                <p className="small muted">Highlighted: your coordinator's call. <button className="link" disabled={busy} onClick={() => call(null)}>Let the coordinator call it</button></p>
              )}
            </Panel>
          ) : <Panel title="On the field"><p className="muted">{revealing ? "Playing..." : "Waiting..."}</p></Panel>}
        </div>
      </div>
      {err && <p className="error">{err}</p>}
      <div className="cols">
        <div>
          <Panel title="Play-by-play">
            <table className="grid pbp"><tbody>
              {plays.slice(0, listed).slice(-60).reverse().map((p, i) => (
                <tr key={listed - i} className={`replayable ${/TOUCHDOWN|INTERCEPT|FUMBLE|INJURY/.test(p.description) ? "hl" : ""} ${replay?.i === listed - 1 - i ? "on" : ""}`}
                  title="Watch it again" onClick={() => setReplay((r) => ({ i: listed - 1 - i, n: (r?.n ?? 0) + 1 }))}>
                  <td className="nowrap muted small">{qtr(p.quarter)} {clock(p.clock)}</td>
                  <td className="nowrap small">{p.down ? `${ORD[p.down]} & ${p.distance}` : ""}</td>
                  <td><span className="muted small">{p.offense}</span> {p.description}</td>
                </tr>
              ))}
            </tbody></table>
          </Panel>
        </div>
        <div>
          <Panel title="Who calls it">
            <table className="grid tight"><tbody>
              {(["offense", "defense"] as const).map((side) => (
                <tr key={side}><td>{side === "offense" ? "Offense" : "Defense"}</td><td>
                  <div className="seg">
                    <button className={view.mode[side] === "me" ? "on" : ""} disabled={busy || view.final} onClick={() => setMode({ [side]: "me" })}>Me</button>
                    <button className={view.mode[side] === "coordinator" ? "on" : ""} disabled={busy || view.final} onClick={() => setMode({ [side]: "coordinator" })}>Coordinator</button>
                  </div>
                </td></tr>
              ))}
              <tr><td>Tempo</td><td><div className="seg">{TEMPOS.map(([t, label]) => (
                <button key={t} className={cc.tempo === t ? "on" : ""} disabled={busy || !stopped} onClick={() => setClock({ tempo: t })}>{label}</button>
              ))}</div></td></tr>
              <tr><td>Timeouts</td><td><div className="seg">
                <button className={cc.manual_timeouts ? "on" : ""} disabled={busy || !stopped} onClick={() => setClock({ manual_timeouts: true })}>Me</button>
                <button className={!cc.manual_timeouts ? "on" : ""} disabled={busy || !stopped} onClick={() => setClock({ manual_timeouts: false })}>Coordinator</button>
              </div></td></tr>
              <tr><td>Animation</td><td><div className="seg">{Object.keys(PACE).map((p) => <button key={p} className={pace === p ? "on" : ""} onClick={() => savePace(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}</div></td></tr>
            </tbody></table>
            {!view.final && <p><button disabled={busy} onClick={() => confirm("Hand the rest of the game to your coordinators?") && call(null, true)}>Sim to the end</button></p>}
          </Panel>
          {view.adjustments.length > 0 && (
            <Panel title="Coordinator adjustments">
              <ul className="adjust">
                {view.adjustments.slice(0, 6).map((a) => (
                  <li key={a.side + a.call}>
                    <span className="muted small">{team(a.team_id)?.abbr}</span>{" "}
                    {a.call === "load_box" || a.call === "coverage" ? a.label : `${a.more ? "More" : "Less"} ${a.label.toLowerCase()}`}
                    <span className="muted small"> · {a.call === "load_box" ? `their runs ${Math.round(100 * a.success)}% success in ${a.plays}` : a.call === "coverage" ? `their passes ${Math.round(100 * a.success)}% success in ${a.plays}` : `${Math.round(100 * a.success)}% success in ${a.plays} plays`}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {!view.final && view.sideline.length > 0 && <Sideline view={view} busy={busy || revealing || !st} onSub={(slot, pid) => act(() => api.liveSub(id, slot, pid))} />}
          {(["offense_calls", "defense_calls"] as const).map((k) => view[k].length > 0 && (
            <Panel key={k} title={k === "offense_calls" ? "Offensive calls this game" : "Defensive calls this game"}>
              <table className="grid tight"><thead><tr><th>Call</th><th className="num">Plays</th><th className="num">{k === "offense_calls" ? "Yds/play" : "Yds allowed"}</th><th className="num">{k === "offense_calls" ? "Success" : "Their success"}</th></tr></thead><tbody>
                {[...view[k]].sort((a, b) => b.plays - a.plays).map((c) => (
                  <tr key={c.call}><td>{c.label}</td><td className="num">{c.plays}</td><td className="num">{(c.yards / c.plays).toFixed(1)}</td><td className="num">{Math.round((100 * c.success) / c.plays)}%</td></tr>
                ))}
              </tbody></table>
            </Panel>
          ))}
        </div>
      </div>
    </div>
  );
}

const SLOT_SHORT: Record<string, string> = {
  QB: "QB", RB1: "RB", WR_X: "WR (X)", WR_Z: "WR (Z)", WR_SLOT: "Slot", TE1: "TE", LT: "LT", LG: "LG", C: "C", RG: "RG", RT: "RT",
  DE1: "DE", DE2: "DE", DT1: "DT", DT2: "DT", LB1: "LB", LB2: "LB", CB1: "CB", CB2: "CB", NB: "Nickel", S1: "S", S2: "S",
};

/** Your players on the field and who could come in; a change holds for the rest of the game. */
function Sideline({ view, busy, onSub }: { view: LiveResult; busy: boolean; onSub: (slot: string, pid: number) => void }) {
  const [open, setOpen] = useState(false);
  const rows = view.sideline;
  const half = (off: boolean) => rows.filter((r) => (["QB", "RB1", "WR_X", "WR_Z", "WR_SLOT", "TE1", "LT", "LG", "C", "RG", "RT"].includes(r.slot)) === off);
  const energy = (e: number) => (e >= 0.95 ? "" : ` · ${Math.round(e * 100)}% fresh`);
  return (
    <Panel title="Lineup" right={<button className="link" onClick={() => setOpen(!open)}>{open ? "Hide" : "Make a change"}</button>}>
      {!open ? (
        <p className="small muted">QB {rows.find((r) => r.slot === "QB")?.options.find((o) => o.id === rows.find((r) => r.slot === "QB")?.on)?.name ?? "-"}.
          Sub anyone in at a stoppage; tired players also rotate on their own.</p>
      ) : (
        <>
          {busy && <p className="small muted">Changes can be made when the game stops for your call.</p>}
          {[true, false].map((off) => (
            <table key={String(off)} className="grid tight sideline"><tbody>
              {half(off).map((r) => (
                <tr key={r.slot}>
                  <td className="nowrap">{SLOT_SHORT[r.slot] ?? r.slot}</td>
                  <td>
                    <select value={r.on ?? ""} disabled={busy} onChange={(e) => onSub(r.slot, Number(e.target.value))}>
                      {r.on == null && <option value="">(nobody)</option>}
                      {r.options.map((o) => (
                        <option key={o.id} value={o.id} disabled={o.hurt}>{o.name} · {o.pos} {o.overall}{o.hurt ? " · hurt" : energy(o.energy)}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody></table>
          ))}
        </>
      )}
    </Panel>
  );
}
