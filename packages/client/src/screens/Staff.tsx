import { useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, SKILL_NAMES, type CoachView, type Role, type SkillKey } from "../api.ts";
import { SortTable, type Col } from "../sort.tsx";
import { Logo, money, shortDate } from "../util.tsx";
import { Panel } from "./common.tsx";

export const SCHEME_NAMES: Record<string, string> = { air_raid: "Air Raid", spread_rpo: "Spread RPO", pro_style: "Pro-style", power_run: "Power run", option: "Option" };
export const ROLE_SHORT: Record<Role, string> = { HC: "Head coach", OC: "Off. coordinator", DC: "Def. coordinator", STC: "Special teams" };
const SKILLS = Object.keys(SKILL_NAMES) as SkillKey[];
const SKILL_ABBR: Record<SkillKey, string> = { recruiting: "Rec", scouting: "Sct", development: "Dev", game_planning: "GP", scheme: "Sch" };

/** A coach's system: his offense or his front (both for a head coach). */
export const schemeOf = (c: CoachView, role: Role | null = c.role) =>
  role === "OC" ? SCHEME_NAMES[c.off] ?? c.off : role === "DC" ? c.def : role === "STC" ? "" : `${SCHEME_NAMES[c.off] ?? c.off} / ${c.def}`;

/** Where a coach is now, in a few words. */
export function CoachWhere({ c }: { c: CoachView }) {
  const { id, team } = useLeague();
  if (c.team_id != null && c.role) {
    const t = team(c.team_id);
    return <span><Logo team={t} size={16} /> <a href={`#/l/${id}/team/${c.team_id}`}>{t?.school}</a> <span className="muted small">{ROLE_SHORT[c.role]}</span></span>;
  }
  if (c.gone) return <span className="muted">Out of coaching</span>;
  if (c.left) return <span className="muted">Out of work (left {team(c.left.team_id)?.school ?? "his job"} {c.left.year})</span>;
  return <span className="muted">{c.source === "new" ? "Position coach, first coordinator shot" : "Out of work"}</span>;
}

export const coachLink = (league: string, c: { id: number; first: string; last: string }) => <a href={`#/l/${league}/coach/${c.id}`}>{c.first} {c.last}</a>;

const skillCols = <T extends CoachView>(): Col<T>[] => SKILLS.map((k) => ({
  key: k, label: SKILL_ABBR[k], title: SKILL_NAMES[k], className: "num", by: (c: T) => c.skills[k], cell: (c: T) => <span className={c.skills[k] >= 70 ? "win" : c.skills[k] < 40 ? "loss" : ""}>{c.skills[k]}</span>,
}));

/** Your head coach and coordinators, your openings, and the coaches you could hire. */
export function StaffScreen() {
  const { id, state } = useLeague();
  const [role, setRole] = useState<Role | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const data = useData(() => api.staff(id, role ?? undefined), [role]);
  if (!data) return <p className="muted">Loading...</p>;
  if (data.team_id == null) return <Panel title="Staff"><p className="muted">You don't have a job right now. Offers show on your Career page.</p></Panel>;
  const act = async (type: string, payload: unknown) => {
    setMsg(null);
    try { await api.act(id, type, payload); } catch (e) { setMsg((e as Error).message); }
  };
  const fire = (c: CoachView) => {
    const left = Math.max(0, c.through - state.year);
    if (confirm(`Let ${c.first} ${c.last} go? The school pays him about ${money(Math.round(0.7 * c.salary * left / 10000) * 10000)} for the rest of his deal.`)) act("fire_coach", { role: c.role });
  };
  const memberCols: Col<CoachView>[] = [
    { key: "role", label: "Job", cell: (c) => ROLE_SHORT[c.role!] },
    { key: "name", label: "Coach", cell: (c) => <>{coachLink(id, c)}{c.user && <span className="muted small"> (you)</span>}</> },
    { key: "age", label: "Age", className: "num", cell: (c) => c.age },
    { key: "rep", label: "Rep", title: "Reputation, 0 to 100", className: "num", cell: (c) => c.rep },
    { key: "scheme", label: "System", cell: (c) => schemeOf(c) },
    ...skillCols<CoachView>().map((x) => ({ ...x, by: undefined })),
    { key: "pay", label: "Salary", className: "num", cell: (c) => money(c.salary) },
    { key: "through", label: "Through", className: "num", cell: (c) => c.through },
    { key: "act", label: "", cell: (c) => (c.user ? null : <button onClick={() => fire(c)}>Let go</button>) },
  ];
  const candCols: Col<StaffCand>[] = [
    { key: "name", label: "Coach", by: (c) => `${c.last} ${c.first}`, cell: (c) => coachLink(id, c) },
    { key: "now", label: "Now", cell: (c) => <CoachWhere c={c} /> },
    { key: "age", label: "Age", className: "num", by: (c) => c.age, asc: true, cell: (c) => c.age },
    { key: "rep", label: "Rep", title: "Reputation, 0 to 100", className: "num", by: (c) => c.rep, cell: (c) => c.rep },
    { key: "scheme", label: "System", by: (c) => schemeOf(c, role), cell: (c) => schemeOf(c, role) },
    ...skillCols<StaffCand>(),
    { key: "ask", label: "Asks", className: "num", by: (c) => c.ask, cell: (c) => money(c.ask) },
    { key: "act", label: "", cell: (c) => <button onClick={() => act("hire_coach", { role, coach_id: c.id })}>Hire</button> },
  ];
  const room = data.budget - data.pay;
  return (
    <div>
      <Panel title="Your staff" right={<span className="small">Staff pay {money(data.pay)} of {money(data.budget)} your AD allows</span>}>
        <SortTable rows={data.members} cols={memberCols} rowKey={(c) => c.id} />
        {data.open.length > 0 && <p className="warn">Open: {data.open.map((r) => data.roles[r].toLowerCase()).join(", ")}. Until you hire one, you cover it yourself and the staff is weaker for it.</p>}
        <p className="small muted">Your coaches' skills are what you see working with them every day. Results move a coach's reputation; schools hire on reputation, so other schools can come for your coordinators, mostly in the carousel (late November to January 20).</p>
        {msg && <p className="error">{msg}</p>}
      </Panel>
      <Panel title="Hire a coordinator" right={<span className="seg" style={{ margin: 0 }}>{(["OC", "DC", "STC"] as Role[]).map((r) => (
        <button key={r} className={role === r ? "on" : ""} onClick={() => setRole(r)}>{data.roles[r]}{data.open.includes(r) ? " (open)" : ""}</button>))}</span>}>
        {!role ? <p className="muted">Pick a job to see who's available.</p> : (
          <>
            <p className="small muted">
              {data.in_season ? "During the season only coaches out of work are available. " : "In the offseason coordinators at schools a step below yours will listen too. "}
              Skills are your staff's read of another school's coach (give or take about 7). Hiring for a job someone holds lets him go. Room under your AD's limit: {money(Math.max(0, room))}.
              {data.carousel.open && ` The carousel runs until ${shortDate(data.carousel.close)}.`}
            </p>
            {data.candidates.length ? <SortTable rows={data.candidates} cols={candCols} rowKey={(c) => c.id} /> : <p className="muted">Nobody available right now.</p>}
          </>
        )}
      </Panel>
    </div>
  );
}
type StaffCand = CoachView & { ask: number };
