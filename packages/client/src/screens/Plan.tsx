import { useEffect, useState } from "react";
import { useLeague } from "../App.tsx";
import { api, type GamePlan, type PlanInfo, type PracticePlan } from "../api.ts";
import { Logo } from "../util.tsx";
import { GameTable, Panel } from "./common.tsx";

const OFF_CALLS: [string, string][] = [
  ["inside_run", "Inside run"], ["outside_run", "Outside run"], ["qb_run", "QB run"], ["screen", "Screen"],
  ["quick", "Quick pass"], ["intermediate", "Intermediate pass"], ["play_action", "Play-action"], ["deep", "Deep shot"],
];
const LEAN = ["Run heavy", "Lean run", "Balanced", "Lean pass", "Pass heavy"];
const LEVELS: [-1 | 0 | 1, string][] = [[-1, "Less"], [0, "Normal"], [1, "More"]];
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday"];

function Seg<T extends string | number>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, label]) => <button key={String(v)} className={v === value ? "on" : ""} onClick={() => onChange(v)}>{label}</button>)}
    </div>
  );
}

const pct = (x: number) => `${(100 * x).toFixed(1)}%`;
const signed = (x: number) => (x > 0 ? "+" : "") + x.toFixed(2);

/** The week's game plan, practice and a scouting report on the next opponent. */
export function PlanScreen() {
  const { id, team, state } = useLeague();
  const [info, setInfo] = useState<PlanInfo | null>(null);
  const [plan, setPlan] = useState<GamePlan | null>(null);
  const [practice, setPractice] = useState<PracticePlan | null>(null);
  const [saved, setSaved] = useState({ plan: true, practice: true });
  const [err, setErr] = useState<string | null>(null);

  const load = () => api.plan(id).then((x) => { setInfo(x); setPlan(x.plan); setPractice(x.practice); setSaved({ plan: true, practice: true }); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id, state.date]);
  if (!info || !plan || !practice) return <Panel title="Game plan">{err ? <p className="error">{err}</p> : <p className="muted">Loading...</p>}</Panel>;

  const edit = (p: Partial<GamePlan>) => { setPlan({ ...plan, ...p }); setSaved((s) => ({ ...s, plan: false })); };
  const editDay = (i: number, d: Partial<PracticePlan[number]>) => { setPractice(practice.map((x, k) => (k === i ? { ...x, ...d } : x))); setSaved((s) => ({ ...s, practice: false })); };
  const save = async (type: "set_game_plan" | "set_practice") => {
    setErr(null);
    try { await api.act(id, type, type === "set_game_plan" ? plan : practice); await load(); } catch (e) { setErr((e as Error).message); }
  };

  const g = info.next_game, sc = info.scout;
  const opp = sc ? team(sc.team_id) : undefined;
  const e = info.edge;
  const L = info.league;
  const unit = (r: NonNullable<NonNullable<PlanInfo["scout"]>["ratings"]>["offense"], pre: string) => (
    <>
      <tr><td>{pre} yards per carry</td><td className="num">{r.rush_ypc.toFixed(2)}</td><td className="num muted">{L.rush_ypc.toFixed(2)}</td></tr>
      <tr><td>{pre} completion %</td><td className="num">{pct(r.comp_pct)}</td><td className="num muted">{pct(L.comp_pct)}</td></tr>
      <tr><td>{pre} yards per catch</td><td className="num">{r.yds_per_comp.toFixed(1)}</td><td className="num muted">{L.yds_per_comp.toFixed(1)}</td></tr>
      <tr><td>{pre} sack rate</td><td className="num">{pct(r.sack_rate)}</td><td className="num muted">{pct(L.sack_rate)}</td></tr>
      <tr><td>{pre} interception rate</td><td className="num">{pct(r.int_rate)}</td><td className="num muted">{pct(L.int_rate)}</td></tr>
    </>
  );

  return (
    <div className="cols planpage">
      <div>
        {err && <p className="error">{err}</p>}
        <Panel title="Game plan" right={<button className="primary" disabled={saved.plan} onClick={() => save("set_game_plan")}>{saved.plan ? "Saved" : "Save game plan"}</button>}>
          <p className="small muted">Your coordinators call every game from this plan, live or simmed, and you can still call any snap yourself.</p>
          <h4>Offense</h4>
          <table className="grid tight plan"><tbody>
            <tr><td>Run or pass</td><td><Seg value={plan.run_pass} options={LEAN.map((l, i) => [i - 2, l])} onChange={(v) => edit({ run_pass: v })} /></td></tr>
            <tr><td>Tempo</td><td><Seg value={plan.tempo} options={[["milk", "Milk the clock"], ["normal", "Normal"], ["hurry", "Hurry up"]]} onChange={(v) => edit({ tempo: v })} /></td></tr>
            {OFF_CALLS.map(([c, label]) => (
              <tr key={c}><td>{label}</td><td><Seg value={plan.emphasis[c as keyof GamePlan["emphasis"]] ?? 0} options={LEVELS} onChange={(v) => edit({ emphasis: { ...plan.emphasis, [c]: v } })} /></td></tr>
            ))}
          </tbody></table>
          <h4>Defense</h4>
          <table className="grid tight plan"><tbody>
            <tr><td>Blitz</td><td><Seg value={plan.blitz} options={LEVELS} onChange={(v) => edit({ blitz: v })} /></td></tr>
            <tr><td>Load the box</td><td><Seg value={plan.box} options={LEVELS} onChange={(v) => edit({ box: v })} /></td></tr>
            <tr><td>Coverage</td><td><Seg value={plan.coverage} options={[["mixed", "Mixed"], ["cover2", "Cover 2"], ["cover3", "Cover 3"], ["man", "Man press"]]} onChange={(v) => edit({ coverage: v })} /></td></tr>
          </tbody></table>
          <h4>Head coach</h4>
          <table className="grid tight plan"><tbody>
            <tr><td>4th downs</td><td><Seg value={plan.fourth_down} options={[["conservative", "Conservative"], ["standard", "Standard"], ["aggressive", "Aggressive"]]} onChange={(v) => edit({ fourth_down: v })} /></td></tr>
            <tr><td>Two-point tries</td><td><Seg value={plan.two_point} options={[["conservative", "Conservative"], ["standard", "Standard"], ["aggressive", "Aggressive"]]} onChange={(v) => edit({ two_point: v })} /></td></tr>
          </tbody></table>
          <p className="small muted">During a game the coordinators also lean toward what is working: more of the calls moving the ball, and on defense more run support or more coverage, whichever is hurting them.</p>
        </Panel>
      </div>
      <div>
        <Panel title="Practice" right={<button className="primary" disabled={saved.practice} onClick={() => save("set_practice")}>{saved.practice ? "Saved" : "Save practice"}</button>}>
          <table className="grid tight plan"><tbody>
            {practice.map((d, i) => (
              <tr key={i}>
                <td>{DAYS[i]}</td>
                <td><Seg value={d.intensity} options={[["light", "Light"], ["normal", "Normal"], ["hard", "Hard"]]} onChange={(v) => editDay(i, { intensity: v })} /></td>
                <td>
                  <select value={d.focus} onChange={(x) => editDay(i, { focus: x.target.value as PracticePlan[number]["focus"] })}>
                    <option value="offense">Offense</option><option value="defense">Defense</option>
                    <option value="situations">Situations</option><option value="opponent">Opponent prep</option>
                  </select>
                </td>
              </tr>
            ))}
          </tbody></table>
          <p className="small muted">Your team practices Monday to Thursday in game weeks, and each day counts toward that week's game.
            Hard days build more but tire players and can cost one time; light days build less. Situations work pays off on 3rd down and in the red zone.</p>
          {g && (info.prep ? (
            <p>Edge banked for {opp?.school ?? "the next game"}, against a normal week: offense <b>{signed(e.offense)}</b>, defense <b>{signed(e.defense)}</b>, situations <b>{signed(e.situations)}</b>
              {info.prep.hard_days ? <span className="muted"> · {info.prep.hard_days} hard day{info.prep.hard_days > 1 ? "s" : ""}</span> : null}</p>
          ) : <p className="muted">No practice banked yet for {opp?.school ?? "the next game"}.</p>)}
        </Panel>
        <Panel title={sc && opp ? "Scouting report" : "Next game"}>
          {!g || !sc || !opp ? <p className="muted">No game coming up.</p> : (
            <>
              <p><Logo team={opp} size={32} /> <b>{sc.rank ? `No. ${sc.rank} ` : ""}{opp.school}</b> {sc.record ? `(${sc.record.w}-${sc.record.l})` : ""}
                <span className="muted"> · {g.home_id === state.user_team_id ? "at home" : g.neutral ? "neutral site" : "on the road"}, {g.date}</span></p>
              {sc.ratings && (
                <table className="grid tight"><thead><tr><th></th><th className="num">{opp.abbr}</th><th className="num">FBS avg</th></tr></thead><tbody>
                  {unit(sc.ratings.offense, "Their")}
                  {unit(sc.ratings.defense, "Allowed")}
                  <tr><td>Pass rate</td><td className="num">{pct(sc.ratings.pass_rate)}</td><td className="num muted">42.0%</td></tr>
                  <tr><td>Plays per game</td><td className="num">{sc.ratings.plays_per_game.toFixed(0)}</td><td className="num muted">69</td></tr>
                  <tr><td>4th-down aggressiveness</td><td className="num">{signed(sc.ratings.aggressiveness)}</td><td className="num muted">0</td></tr>
                </tbody></table>
              )}
              {info.film && <FilmRoom film={info.film} school={opp.school} />}
              {sc.injuries.length > 0 && <p className="small"><b>Starters out:</b> {sc.injuries.map((i) => `${i.name} (${i.pos})`).join(", ")}</p>}
              {sc.last.length > 0 && <><h4>Last games</h4><GameTable games={sc.last} showDate /></>}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}

const SIDE: Record<string, string> = { offense: "Their offense", defense: "Their defense", personnel: "Who gets the ball" };

/** What your staff has found on film of the next opponent, and how much more there is to find. */
function FilmRoom({ film, school }: { film: NonNullable<PlanInfo["film"]>; school: string }) {
  const k = film.knowledge;
  const read = k >= 0.8 ? "knows them cold" : k >= 0.55 ? "has a good read" : k >= 0.35 ? "has a partial read" : "has barely started";
  return (
    <>
      <h4>Film room</h4>
      <p className="small">{school} runs a <b>{film.off_name}</b> offense and a <b>{film.def_name}</b> front. Your staff {read} ({Math.round(100 * k)}%):
        {" "}{film.hours.toFixed(0)} hours of film this week, about {film.usual.toFixed(0)} in a usual week at {Math.round(100 * film.share)}% of the staff's time.</p>
      {film.insights.length ? (
        <table className="grid tight"><tbody>
          {film.insights.map((x) => <tr key={x.id}><td className="small muted">{SIDE[x.side]}</td><td className="small">{x.text}{x.counter && <> <b>{x.counter}</b></>}</td></tr>)}
        </tbody></table>
      ) : <p className="small muted">Nothing stands out on film yet.</p>}
      <p className="small muted">Your coordinators use what the staff knows on game day, and knowing them better than they know you is worth up to about a point.
        More film time (Strategy, the staff's week) finds more, at the cost of recruiting and practice.</p>
    </>
  );
}
