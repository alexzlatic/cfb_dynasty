import { useEffect, useRef, useState } from "react";
import { useLeague } from "../App.tsx";
import { api, type LiveMode, type LiveResult, type UserCall } from "../api.ts";
import type { PlayRecord } from "@cfb/engine";
import { Logo } from "../util.tsx";
import { Panel } from "./common.tsx";

const PACE: Record<string, number> = { instant: 0, fast: 350, slow: 1200 };
const ORD = ["", "1st", "2nd", "3rd", "4th"];
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
const qtr = (q: number, ot = false) => (ot || q > 4 ? "OT" : `Q${q}`);
const ALERT_TEXT: Record<string, string> = {
  fourth_down: "4th down decision", two_point: "Two-point decision", two_minute: "Two-minute situation", defend_late: "They're driving late",
  overtime: "Overtime", qb_hurt: "Your quarterback is hurt", starter_hurt: "A starter is hurt", red_zone: "Red zone", quarter: "New quarter",
};

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

  const take = (v: LiveResult | null) => {
    if (!v) return;
    setView(v);
    setPlays((old) => [...old.slice(0, v.since), ...v.plays]);
  };
  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    api.live(id).then((v) => { if (v) { take(v); setShown(v.plays.length); } }).catch((e) => setErr(e.message));
  }, [id]);
  // Reveal new plays one at a time at the chosen pace.
  useEffect(() => {
    if (shown >= plays.length) return;
    const ms = PACE[pace] ?? 350;
    if (!ms) { setShown(plays.length); return; }
    const t = setTimeout(() => setShown((n) => n + 1), ms);
    return () => clearTimeout(t);
  }, [shown, plays.length, pace]);

  const act = async (f: () => Promise<LiveResult>) => {
    setBusy(true); setErr(null);
    try { take(await f()); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const call = (c: UserCall, toEnd = false) => act(() => api.liveCall(id, c, plays.length, toEnd));
  const setMode = (m: Partial<LiveMode>) => act(() => api.liveMode(id, m));
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
  const revealing = shown < plays.length;
  const last = revealing ? plays[Math.max(0, shown - 1)] : null;
  const sb = last
    ? { q: last.quarter, clock: last.clock, hs: last.home_score, as: last.away_score }
    : { q: view.quarter, clock: view.clock, hs: view.home_score, as: view.away_score };
  const ytg = view.yards_to_goal;
  const offTeam = view.possession === "home" ? H : A;
  const spot = ytg > 50 ? `${offTeam?.abbr ?? ""} ${100 - ytg}` : ytg === 50 ? "50" : `${(view.possession === "home" ? A : H)?.abbr ?? ""} ${ytg}`;
  const st = view.stop;
  const stopTitle = !st ? "" : st.kind === "playCall" ? (st.role === "offense" ? "Call the play" : "Call the defense")
    : st.kind === "fourthDown" ? "4th down" : st.kind === "twoPoint" ? "After the touchdown" : st.kind === "onside" ? "Kickoff" : "Victory formation?";
  const toCall = (x: string): UserCall => (x === "true" ? true : x === "false" ? false : (x as UserCall));

  return (
    <div className="live">
      <div className="scoreboard">
        <div className="sbteam"><Logo team={A} size={44} /><span className="sbname">{A?.school}</span>{view.possession === "away" && !view.final && <span className="ball">●</span>}<span className="sbscore">{sb.as}</span></div>
        <div className="sbmid">
          <div className="sbclock">{view.final && !revealing ? "Final" : `${qtr(sb.q, view.overtime)} ${clock(sb.clock)}`}</div>
          {!view.final && <div className="small">{ORD[view.down] ?? view.down} &amp; {view.distance >= ytg ? "Goal" : view.distance} at {spot}</div>}
          <div className="small muted">Timeouts {A?.abbr} {view.away_timeouts} · {H?.abbr} {view.home_timeouts}</div>
        </div>
        <div className="sbteam right"><span className="sbscore">{sb.hs}</span>{view.possession === "home" && !view.final && <span className="ball">●</span>}<span className="sbname">{H?.school}</span><Logo team={H} size={44} /></div>
      </div>
      {!view.final && (
        <div className="field" title={`Ball on ${spot}`}>
          <div className="endzone left" style={{ background: A?.color }} /><div className="endzone right" style={{ background: H?.color }} />
          {/* Home defends the right end zone in this picture: the ball's x is from the left goal line. */}
          {(() => {
            const fromLeft = view.possession === "home" ? ytg : 100 - ytg;
            const toGain = view.possession === "home" ? Math.max(0, ytg - view.distance) : Math.min(100, 100 - ytg + view.distance);
            return <>
              <div className="ballspot" style={{ left: `${5 + fromLeft * 0.9}%` }} />
              <div className="togain" style={{ left: `${5 + toGain * 0.9}%` }} />
            </>;
          })()}
        </div>
      )}
      {err && <p className="error">{err}</p>}
      <div className="cols">
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
              <p className="small muted">Highlighted: your coordinator's call. <button className="link" disabled={busy} onClick={() => call(null)}>Let the coordinator call it</button></p>
            </Panel>
          ) : <Panel title="Play-by-play"><p className="muted">{revealing ? "Playing..." : "Waiting..."}</p></Panel>}
          <Panel title="Play-by-play">
            <table className="grid pbp"><tbody>
              {plays.slice(0, shown).slice(-60).reverse().map((p, i) => (
                <tr key={shown - i} className={/TOUCHDOWN|INTERCEPT|FUMBLE|INJURY/.test(p.description) ? "hl" : ""}>
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
              <tr><td>Pace</td><td><div className="seg">{Object.keys(PACE).map((p) => <button key={p} className={pace === p ? "on" : ""} onClick={() => savePace(p)}>{p[0].toUpperCase() + p.slice(1)}</button>)}</div></td></tr>
            </tbody></table>
            {!view.final && <p><button disabled={busy} onClick={() => confirm("Hand the rest of the game to your coordinators?") && call(null, true)}>Sim to the end</button></p>}
          </Panel>
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
