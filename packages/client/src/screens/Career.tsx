import { useData, useLeague } from "../App.tsx";
import { api, type CareerView } from "../api.ts";
import { shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";

/** The job-security meter: a bar from the hot seat to secure. */
export function SecurityMeter({ c }: { c: CareerView }) {
  const tone = c.security >= 55 ? "good" : c.security >= 35 ? "warm" : "hot";
  return (
    <div className="secmeter" title={`Job security ${c.security.toFixed(0)} of 100`}>
      <div className="track"><div className={`fill ${tone}`} style={{ width: `${Math.max(2, c.security)}%` }} /></div>
      <span className={`seclabel ${tone}`}>{c.label}</span>
    </div>
  );
}

/** A small card for Home: your AD, the goal, and the meter. */
export function CareerCard({ c }: { c: CareerView }) {
  const { id } = useLeague();
  const last = c.meetings[c.meetings.length - 1];
  return (
    <Panel title="Athletic director" right={<a href={`#/l/${id}/career`}>Career</a>}>
      <p><b>{c.ad.first} {c.ad.last}</b> <span className="muted small">· your boss</span></p>
      <p className="small">Goal: {c.expect.text}</p>
      <SecurityMeter c={c} />
      {last && <p className="small muted">{shortDate(last.date)}: {last.text}</p>}
    </Panel>
  );
}

const MEETING = { preseason: "Preseason meeting", midseason: "Midseason meeting", end: "End-of-season meeting" } as const;

export function CareerScreen() {
  const { id, state, team } = useLeague();
  const data = useData(() => api.career(id), [state.date]);
  if (!data) return <p className="muted">Loading...</p>;
  const c = data.career;
  if (!c) return <Panel title="Career"><p className="muted">Pick a team in Settings to start a career.</p></Panel>;
  const school = team(c.team_id)?.school;
  const result = (g: (typeof data.trail)[number]["game"]) => {
    const home = g.home_id === c.team_id;
    const opp = team(home ? g.away_id : g.home_id);
    const [us, them] = home ? [g.home_score!, g.away_score!] : [g.away_score!, g.home_score!];
    return <><span className={us > them ? "win" : "loss"}>{us > them ? "W" : "L"} {us}-{them}</span> {home ? "vs" : g.neutral ? "vs" : "at"} <a href={`#/l/${id}/game/${g.id}`}>{opp?.school}</a>{g.overtime ? " (OT)" : ""}</>;
  };
  return (
    <div className="cols">
      <div>
        <Panel title={`Coach ${c.coach.first} ${c.coach.last}`}>
          <p>{c.mode === "real" ? `You took over as ${school}'s head coach.` : `You started fresh at ${school}, an unknown with your name to make.`}</p>
          <table className="grid tight"><tbody>
            <tr><td>Reputation</td><td>{c.coach.reputation} <span className="muted small">of 100</span></td></tr>
            <tr><td>Athletic director</td><td>{c.ad.first} {c.ad.last} <span className="muted small">({c.ad.patience >= 1.05 ? "patient" : c.ad.patience <= 0.95 ? "impatient" : "fair"})</span></td></tr>
            <tr><td>Preseason projection</td><td>No. {c.expect.rank} in the country, {c.expect.wins} regular-season wins</td></tr>
            <tr><td>The goal</td><td>{c.expect.text}</td></tr>
          </tbody></table>
          <h4>Job security</h4>
          <SecurityMeter c={c} />
          <p className="small muted">Wins you were not expected to get help most; blowout losses hurt; conference titles, bowls and the playoff count. Nobody is fired this season; offers and firings arrive in a later update.</p>
        </Panel>
        <Panel title="Meetings">
          {!c.meetings.length ? <p className="muted">Your first meeting is before the season.</p> :
            c.meetings.map((m) => <div key={m.kind} className="meeting"><b>{MEETING[m.kind]}</b> <span className="muted small">{shortDate(m.date)}</span><p>{m.text}</p></div>)}
        </Panel>
      </div>
      <div>
        <Panel title="Game by game">
          {!data.trail.length ? <p className="muted">No games yet.</p> : (
            <table className="grid tight"><thead><tr><th>Date</th><th>Game</th><th className="num">Change</th><th className="num">Security</th></tr></thead><tbody>
              {data.trail.map((x) => (
                <tr key={x.game_id}><td className="nowrap muted">{shortDate(x.date)}</td><td>{result(x.game)}{x.note && <div className="small muted">{x.note}</div>}</td>
                  <td className={"num " + (x.delta >= 0 ? "win" : "loss")}>{x.delta > 0 ? "+" : ""}{x.delta.toFixed(1)}</td><td className="num">{x.security.toFixed(0)}</td></tr>
              ))}
            </tbody></table>
          )}
        </Panel>
      </div>
    </div>
  );
}
