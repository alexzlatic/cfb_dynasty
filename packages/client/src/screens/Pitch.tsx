import { useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type PitchData } from "../api.ts";
import { Logo, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";
import { ConsideringList } from "./Prospect.tsx";
import { recruitStars } from "./ratings.tsx";

const GRADE = ["Freshman", "Sophomore", "Junior", "Senior"];
const pct = (x: number) => `${Math.round(x * 100)}%`;
const POINT_CAP = 0.6;
/** His chance with you if what you add moves by `d` (a logit choice: your odds against the rest scale by e^d). */
const shift = (share: number, d: number) => { const e = share * Math.exp(d); return e / (e + 1 - share); };
/** A change in his chance, in percentage points (a decimal below ten). */
const signedPts = (x: number) => { const v = Math.abs(x * 100); return `${x >= 0 ? "+" : "−"}${v < 9.95 ? v.toFixed(1) : Math.round(v)} pts`; };
const strengthWord = (x: number) => (x >= 1 ? "Strong" : x >= 0.35 ? "Edge" : x > -0.35 ? "Even" : x > -1 ? "Behind" : "Weak");
const NIL_WORDS: Record<string, string> = { waiting: "Waiting for his answer", agreed: "Agreed", countered: "He countered", done: "Done talking money with you", pulled: "You took his deal back" };

/**
 * The pitch page: tailor your pitch to one recruit. Pick the selling points that fit him and your program,
 * put in the contact hours that carry them, bring him in for an official visit or send your head coach, and
 * negotiate his NIL deal. Every piece shows what it adds to his chance of picking you.
 */
export function PitchPage({ pid }: { pid: number }) {
  const { id, state, team } = useLeague();
  const d = useData(() => api.pitch(id, pid), [pid, state.date]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [hours, setHours] = useState<string | null>(null);
  const [amount, setAmount] = useState<string | null>(null);
  const [years, setYears] = useState(1);
  if (!d) return <p className="muted">Loading...</p>;
  const act = async (type: string, payload: unknown) => {
    setBusy(true); setErr(null);
    try { await api.act(id, type, payload); return true; } catch (e) { setErr((e as Error).message); return false; } finally { setBusy(false); }
  };
  const p = d.prospect, me = state.user_team_id!;
  const chosen = draft ?? d.chosen;
  const committed = p.commit ? team(p.commit.team_id) : undefined;
  const n = chosen.length;
  const sum = (keys: string[]) => Math.max(-POINT_CAP, Math.min(POINT_CAP, keys.reduce((a, k) => a + (d.points.find((x) => x.key === k)?.effects[Math.max(0, keys.length - 1)] ?? 0), 0)));
  const heard = d.parts?.heard ?? 0;
  // What your staff expects the selling points you've picked to do, against what they do now.
  const delta = (sum(chosen) - sum(d.chosen)) * heard;
  const share = d.standing?.share ?? 0;
  const wk = d.visits.week;
  const preview = shift(share, delta);
  const without = d.parts ? shift(share, -d.parts.total) : share;
  const toggle = (k: string) => setDraft(chosen.includes(k) ? chosen.filter((x) => x !== k) : chosen.length >= d.max_points ? chosen : [...chosen, k]);
  const t = d.nil.talk;
  const offerAmt = amount != null ? Math.round(Number(amount) * 1000) : null;
  return (
    <div>
      {err && <p className="error">{err}</p>}
      <div className="hero prospect">
        <div className="jersey">{p.pos}</div>
        <div className="who">
          <div className="kicker">Your pitch · {p.cls} class · {GRADE[d.grade] ?? ""}</div>
          <h1><a href={`#/l/${id}/prospect/${p.id}`} style={{ color: "inherit" }}>{p.name}</a></h1>
          <div className="bio">{p.pos} · {[p.home.city, p.home.state].filter(Boolean).join(", ")}</div>
          <div className="chips">
            {p.service ? <span className="chip">{recruitStars(p.service.stars)} No. {p.service.rank}</span> : <span className="chip">Unrated</span>}
            <span className="chip">{d.persona.name}: {d.persona.label.toLowerCase()}</span>
            {committed ? <span className="chip strong"><Logo team={committed} size={18} /> {p.commit!.signed ? "Signed with" : "Committed to"} {committed.school}</span> : <span className="chip">Uncommitted</span>}
            {d.offered ? <span className="chip gold">Offered</span> : null}
          </div>
        </div>
        {d.standing && (
          <div className="pitchodds">
            <div className="big">{d.standing.place ? `${d.standing.place}${ordSuffix(d.standing.place)}` : "—"}</div>
            <div className="small">in his picture</div>
            <div className="big">{pct(share)}</div>
            <div className="small">chance he picks you</div>
          </div>
        )}
      </div>
      {!d.open ? <Panel title="Not open to a pitch"><p className="muted">{p.commit?.signed ? "He has signed." : d.grade < 1 ? "He's a freshman: schools can only scout him for now." : "The service doesn't rate him yet, so nobody is recruiting him."}</p></Panel> : (
        <div className="cols">
          <div>
            <Panel title="Selling points" right={<span className="small muted">pick up to {d.max_points} · {n} chosen</span>}>
              <table className="grid pitchpoints">
                <thead><tr><th /><th>What you tell him</th><th>You vs. his other schools</th><th>He cares</th><th className="num" title="What it adds to his chance, as your staff reads him, once he's heard it">Adds</th></tr></thead>
                <tbody>{d.points.map((x) => {
                  const on = chosen.includes(x.key);
                  // What it adds as part of the pitch (or would, added to it); nothing to show once three are picked.
                  const full = !on && n >= d.max_points;
                  const eff = full ? 0 : x.effects[Math.max(0, (on ? n : n + 1) - 1)] * Math.max(heard, 0.0001);
                  return (
                    <tr key={x.key} className={on ? "on" : ""} onClick={() => toggle(x.key)}>
                      <td><input type="checkbox" readOnly checked={on} disabled={!on && n >= d.max_points} /></td>
                      <td><b>{x.label}</b><div className="small muted">“{x.line}”</div></td>
                      <td><StrengthBar v={x.strength} /></td>
                      <td className={"small " + (x.care === "High" ? "win" : x.care === "Low" ? "loss" : "muted")}>{x.care}</td>
                      <td className={"num " + (full ? "muted" : eff >= 0.005 ? "win" : eff <= -0.005 ? "loss" : "muted")}>{full ? "—" : signedPts(shift(share, eff) - share)}</td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <div className="pitchsave">
                <button className="primary" disabled={busy || draft == null} onClick={async () => { if (await act("recruit_pitch", { pid, points: chosen })) setDraft(null); }}>Save pitch</button>
                {draft != null && <button disabled={busy} onClick={() => setDraft(null)}>Undo</button>}
                <span className="small">{draft != null ? <>Your staff expects <b>{pct(preview)}</b> with this pitch ({signedPts(preview - share)}).</> : n ? "This is your pitch." : "No selling points yet."}</span>
              </div>
              <p className="small muted">Each point lands by how much he cares about it and how your school really compares with the others he's considering. Selling a weakness backfires,
                more so on something he cares about. One point carries more than three. {d.persona.known ? "Your staff knows what matters to him." : `Until you've put ${d.persona.know_hours} contact hours into him your staff reads him as a typical ${d.persona.name.toLowerCase()}.`}</p>
            </Panel>
            <Panel title="Contact hours" right={<span className="small muted">{d.auto ? "your staff also works your board" : "you run your board"}</span>}>
              <div className="pitchhours">
                <span>Weekly <input value={hours ?? String(d.weekly_hours || "")} onChange={(e) => setHours(e.target.value)} /> h</span>
                <button disabled={busy || hours == null} onClick={async () => { if (await act("recruit_hours", { pid, hours: Number(hours) || 0 })) setHours(null); }}>Set</button>
                <span className="small muted">{d.standing!.hours.toFixed(0)} hours with him so far · up to {wk.max_contact} a week</span>
              </div>
              <div className="heardbar"><span style={{ width: `${Math.min(100, (d.standing!.hours / d.persona.know_hours) * 100)}%` }} />
                <i style={{ left: `${(d.heard_hours / d.persona.know_hours) * 100}%` }} title="Pitch fully heard" /></div>
              <p className="small muted">Your pitch is {pct(heard)} heard: it lands fully after {d.heard_hours} contact hours. At {d.persona.know_hours} your staff knows his real priorities. Hours build the relationship on their own too, and fade a little each week you stop.</p>
            </Panel>
            <Panel title="Visits">
              <WeekHours wk={wk} />
              <div className="visits">
                <div className="visit">
                  <h4>Official visit</h4>
                  {d.visits.official ? <p>He visited campus {shortDate(d.visits.official)}.</p>
                    : <button disabled={busy || !d.visits.can_official || wk.hc.left < d.visits.official_hc || wk.contact < d.visits.official_hours} onClick={() => act("recruit_visit", { pid, kind: "official" })}>Bring him to campus · {d.visits.official_hours} h · {money(d.visits.official_cost)}</button>}
                  <p className="small muted">{d.visits.can_official ? `Your campus is worth ${signedPts(shift(share, d.visits.official_worth) - share)} with him right after, fading over the months. Once per recruit. Your staff runs the weekend: ${d.visits.official_hours} hours, ${d.visits.official_hc} of them the head coach's.` : "Juniors and seniors only."}</p>
                </div>
                <div className="visit">
                  <h4>Head coach in his home</h4>
                  <p>{d.visits.coach.length ? `Visited ${d.visits.coach.map((x) => shortDate(x)).join(" and ")}.` : "Not yet."}</p>
                  {d.visits.coach.length < d.visits.coach_max && <button disabled={busy || wk.hc.left < d.visits.coach_hours} onClick={() => act("recruit_visit", { pid, kind: "coach" })}>Send the head coach · {d.visits.coach_hours} h · {money(d.visits.coach_cost)}</button>}
                  <p className="small muted">Worth {signedPts(shift(share, d.visits.coach_worth) - share)} each by your staff's recruiting skill; twice per recruit. A day of the head coach's own time on the road.</p>
                </div>
              </div>
            </Panel>
          </div>
          <div>
            <Panel title="Where you stand" right={<span className="small muted">his chance if he chose today</span>}>
              {d.standing!.considering.length ? <ConsideringList rows={d.standing!.considering} me={me} /> : <p className="muted">No school is in his picture yet.</p>}
              {d.parts && (
                <table className="grid tight pitchparts"><tbody>
                  <tr><td>Selling points{heard < 1 ? <span className="small muted"> ({pct(heard)} heard)</span> : null}</td><td className="num">{fmtU(share, d.parts.points)}</td></tr>
                  <tr><td>Official visit</td><td className="num">{fmtU(share, d.parts.official)}</td></tr>
                  <tr><td>Head coach visits</td><td className="num">{fmtU(share, d.parts.coach)}</td></tr>
                  <tr><td>NIL deal</td><td className="num">{fmtU(share, d.parts.nil)}</td></tr>
                  {d.parts.penalty ? <tr><td>Broken talks</td><td className="num">{fmtU(share, d.parts.penalty)}</td></tr> : null}
                  <tr className="total"><td>Your pitch</td><td className="num">{fmtU(share, d.parts.total)}</td></tr>
                </tbody></table>
              )}
              <p className="small muted">Without your pitch your staff thinks you'd be at about {pct(without)}. Contact hours and a scholarship offer count on top of it.</p>
              {!d.standing!.place && <p className="small">You aren't in his picture: he doesn't see your school among his options, so a pitch won't reach him.</p>}
            </Panel>
            <Panel title="NIL deal" right={<span className="small muted">paid when he enrolls ({d.nil.enrolls})</span>}>
              <table className="grid tight"><tbody>
                <tr><td>His market value</td><td className="num">{money(d.nil.value)} a year</td></tr>
                <tr><td>Your staff's guess at his number</td><td className="num">{money(d.nil.guess.lo)}-{money(d.nil.guess.hi)}</td></tr>
                <tr><td>Fair-market-value ceiling</td><td className="num">{money(d.nil.fmv)}</td></tr>
                {d.nil.budget && <tr><td>Room in your {d.nil.budget.year} roster budget</td><td className="num">{money(Math.max(0, d.nil.budget.room))} of {money(d.nil.budget.total)}</td></tr>}
              </tbody></table>
              {t && <p className={"nilstatus " + t.status}><b>{NIL_WORDS[t.status]}</b>
                {t.status === "waiting" ? `: ${money(t.amount)} a year for ${t.years} season${t.years === 1 ? "" : "s"}, answer by ${shortDate(t.answer!)}.` : ""}
                {d.nil.agreed ? `${t.status === "agreed" ? ":" : " Your agreed deal stands:"} ${money(d.nil.agreed.amount)} a year for ${d.nil.agreed.years} season${d.nil.agreed.years === 1 ? "" : "s"}.` : ""}
                {t.counter != null && t.status !== "agreed" ? ` He wants ${money(t.counter)} a year.` : ""}</p>}
              {(!t || t.status === "countered" || t.status === "agreed") && (
                <div className="niloffer">
                  $<input value={amount ?? (t?.counter != null && t.status !== "agreed" ? String(Math.round(t.counter / 1000)) : "")} placeholder={String(Math.round(d.nil.guess.hi / 1000))} onChange={(e) => setAmount(e.target.value)} />K a year for
                  <select value={years} onChange={(e) => setYears(Number(e.target.value))}>{[1, 2, 3, 4].map((y) => <option key={y} value={y} disabled={y > d.nil.max_years}>{y} season{y === 1 ? "" : "s"}</option>)}</select>
                  <button className="primary" disabled={busy || !offerAmt} onClick={async () => { if (offerAmt && await act("recruit_nil", { pid, amount: offerAmt, years })) setAmount(null); }}>{t?.status === "agreed" ? "Offer a new deal" : "Make the offer"}</button>
                </div>
              )}
              {t && (t.status === "waiting" || t.status === "agreed") && <button className="link" disabled={busy} onClick={() => act("recruit_nil", { pid, amount: 0, years: 1 })}>{t.status === "waiting" ? "Take back this offer" : "End his deal (he won't forget it)"}</button>}
              <p className="small muted">He answers in a day or two (your inbox): yes at or above his number, otherwise he names it, and a lowball costs his patience. {d.nil.years_known ? `He'll sign for up to ${d.nil.max_years} season${d.nil.max_years === 1 ? "" : "s"}.` : ""}
                An agreed deal counts by how far it beats what he'd expect from your school, and the more money matters to him the more it counts:</p>
              <table className="grid tight small"><thead><tr><th>A deal of</th>{d.nil.pull_at.map((x) => <th key={x.amount} className="num">{money(x.amount)}</th>)}</tr></thead>
                <tbody><tr><td>{d.nil.agreed ? "Against your deal" : "Adds"}</td>{d.nil.pull_at.map((x) => <td key={x.amount} className="num">{signedPts(shift(share, x.pull - (d.parts?.nil ?? 0)) - share)}</td>)}</tr></tbody></table>
            </Panel>
            <Panel title="Scholarship offer">
              <p>{d.offered ? "You've offered him." : "No offer yet. An offer moves him on its own, and he can only commit to a school that has offered."}</p>
              {!p.commit?.signed && <button disabled={busy} onClick={() => act("recruit_offer", { pid, on: !d.offered })}>{d.offered ? "Pull the offer" : "Offer a scholarship"}</button>}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

/** What a part of your pitch is worth to his chance today: where he'd be without it, in points. */
type Week = PitchData["visits"]["week"];
/** Your recruiting week: who the hours come from, what visits have taken, and the head coach's own time. */
function WeekHours({ wk }: { wk: Week }) {
  const h = (x: number) => `${Math.round(x)} h`;
  const over = wk.board > wk.contact;
  return (
    <div className="weekhours">
      <div><span className="muted small">Staff recruiting this week</span><b>{h(wk.total)}</b>
        <small className="muted">coaches {h(wk.coaches)}{wk.staffers ? ` + ${wk.staffers} recruiting staffer${wk.staffers === 1 ? "" : "s"} ${h(wk.staffer_hours)}` : ""}</small></div>
      <div><span className="muted small">Visits</span><b>{h(wk.visits)}</b><small className="muted">{wk.officials} official · {wk.homes} home</small></div>
      <div><span className="muted small">Left for contact</span><b className={over ? "bad" : ""}>{h(wk.contact)}</b><small className={over ? "bad" : "muted"}>{h(wk.board)} set on your board{over ? ", spread thinner" : ""}</small></div>
      <div><span className="muted small">Head coach</span><b>{h(wk.hc.left)} left</b><small className="muted">{h(wk.hc.recruiting)} of his {wk.hc.week} for recruiting</small></div>
    </div>
  );
}

const fmtU = (share: number, x: number) => {
  const pts = share - shift(share, -x);
  return Math.abs(x) < 0.0005 ? <span className="muted">—</span> : <span className={pts > 0 ? "win" : "loss"}>{signedPts(pts)}</span>;
};
const ordSuffix = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "st" : n % 10 === 2 && n % 100 !== 12 ? "nd" : n % 10 === 3 && n % 100 !== 13 ? "rd" : "th");

/** Where your school stands on a selling point against his other schools: a bar out from the middle. */
function StrengthBar({ v }: { v: number }) {
  const w = Math.min(50, (Math.abs(v) / 2) * 50);
  return (
    <span className="strength" title={`${v >= 0 ? "+" : ""}${v.toFixed(2)} SD against his other schools`}>
      <span className="track"><span className={v >= 0 ? "pos" : "neg"} style={v >= 0 ? { left: "50%", width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` }} /></span>
      <small>{strengthWord(v)}</small>
    </span>
  );
}
