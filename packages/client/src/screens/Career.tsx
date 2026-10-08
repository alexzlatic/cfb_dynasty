import { useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type CareerView, type CoachView, type JobOffer } from "../api.ts";
import { Logo, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";
import { ROLE_SHORT } from "./Staff.tsx";

/** Schools that want you: take the job (you're their head coach today) or turn it down. */
function Offers({ offers, current }: { offers: JobOffer[]; current: number | null }) {
  const { id, team } = useLeague();
  const [msg, setMsg] = useState<string | null>(null);
  if (!offers.length) return null;
  const answer = async (o: JobOffer, accept: boolean) => {
    if (accept && !confirm(`Take the ${team(o.team_id)?.school} job? You leave ${current != null ? team(current)?.school : "the pool"} today; your recruits, talks and plans there stay behind.`)) return;
    setMsg(null);
    try { await api.act(id, "answer_offer", { team_id: o.team_id, accept }); } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <Panel title="Job offers">
      <table className="grid tight"><tbody>{offers.map((o) => (
        <tr key={o.team_id}><td><Logo team={team(o.team_id)} size={22} /> <a href={`#/l/${id}/team/${o.team_id}`}>{team(o.team_id)?.school}</a></td>
          <td>{money(o.salary)} a year, {o.years} years</td><td className="muted small">answer by {shortDate(o.expires)}</td>
          <td><button onClick={() => answer(o, true)}>Take the job</button> <button onClick={() => answer(o, false)}>No thanks</button></td></tr>
      ))}</tbody></table>
      {msg && <p className="error">{msg}</p>}
    </Panel>
  );
}

/** Your coaching record: every season in the dynasty, and the record you brought in. */
function Record({ c }: { c: CoachView }) {
  const { team } = useLeague();
  return (
    <Panel title="Your record">
      <p className="small">Reputation {c.rep} of 100 · {c.role ? `${money(c.salary)} a year through ${c.through}` : "out of work"}{c.prior ? ` · ${c.prior.w}-${c.prior.l} before the dynasty` : ""}</p>
      {!c.seasons.length ? <p className="muted">Your first season goes on the record when the carousel opens in late November.</p> : (
        <table className="grid tight"><thead><tr><th>Year</th><th>School</th><th>Job</th><th className="num">Record</th></tr></thead>
          <tbody>{[...c.seasons].reverse().map((x) => (
            <tr key={`${x.year}:${x.team_id}`}><td>{x.year}</td><td><Logo team={team(x.team_id)} size={16} /> {team(x.team_id)?.school}</td><td>{ROLE_SHORT[x.role]}</td><td className="num">{x.w}-{x.l}</td></tr>
          ))}</tbody></table>
      )}
    </Panel>
  );
}

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
  if (c.out) return (
    <div className="cols">
      <div>
        <Panel title={`Coach ${c.coach.first} ${c.coach.last}`}>
          <p>{team(c.team_id)?.school} let you go on {shortDate(c.out)}. You're out of work until a school hires you: schools with openings call over the next weeks, and if nobody does, the next carousel (late November) is your next chance.</p>
          {data.carousel?.open && <p className="small muted">The carousel runs until {shortDate(data.carousel.close)}.</p>}
        </Panel>
        <Offers offers={data.offers} current={null} />
      </div>
      <div>{data.coach && <Record c={data.coach} />}</div>
    </div>
  );
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
          <p className="small muted">Wins you were not expected to get help most; blowout losses hurt; conference titles, bowls and the playoff count. When the carousel opens in late November, a coach on the brink (under 20) is let go (in his first two seasons, only under 10); one who wins gets calls from bigger schools.</p>
        </Panel>
        <Offers offers={data.offers} current={c.team_id} />
        <Panel title="Meetings">
          {!c.meetings.length ? <p className="muted">Your first meeting is before the season.</p> :
            c.meetings.map((m) => <div key={m.kind} className="meeting"><b>{MEETING[m.kind]}</b> <span className="muted small">{shortDate(m.date)}</span><p>{m.text}</p></div>)}
        </Panel>
      </div>
      <div>
        {data.coach && <Record c={data.coach} />}
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
