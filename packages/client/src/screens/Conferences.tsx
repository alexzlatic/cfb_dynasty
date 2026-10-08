import { useState } from "react";
import { useData, useLeague } from "../App.tsx";
import { api, type ConferenceDef, type ConferenceSetup, type Team, type TieIns } from "../api.ts";
import { Logo, TeamName } from "../util.tsx";

const IND = "FBS Independents";
const TIERS: Record<ConferenceDef["tier"], string> = { power: "Power", group: "Group of Six", independent: "Independents" };
const tierOrder = (c: ConferenceDef) => (c.tier === "power" ? 0 : c.tier === "group" ? 1 : 2);
const avgPrestige = (c: ConferenceDef, byId: Map<number, Team>) => c.members.reduce((s, id) => s + (byId.get(id)?.prestige ?? 0), 0) / Math.max(1, c.members.length);
export const sortConfs = (cs: ConferenceDef[], byId: Map<number, Team>) => [...cs].sort((a, b) => tierOrder(a) - tierOrder(b) || avgPrestige(b, byId) - avgPrestige(a, byId));

/** Moves a team to a conference: out of its old one (whose divisions, now uneven, go away) and into the new one. */
function moveTeam(setup: ConferenceSetup, team: number, to: string): ConferenceSetup {
  const conferences = setup.conferences.map((c) => {
    const had = c.members.includes(team);
    if (c.name === to && !had) return { ...c, members: [...c.members, team], divisions: null };
    if (c.name !== to && had) {
      const members = c.members.filter((x) => x !== team);
      return { ...c, members, divisions: null, conf_games: Math.min(c.conf_games, Math.max(0, members.length - 1)) };
    }
    return c;
  });
  return { ...setup, conferences };
}

function renameIn(t: TieIns, from: string, to: string | null): TieIns {
  const swap = (xs: string[]) => xs.flatMap((n) => (n === from ? (to ? [to] : []) : [n]));
  return Object.fromEntries(Object.entries(t).map(([b, [x, y]]) => [b, [swap(x), swap(y)]])) as TieIns;
}

/**
 * The new-league conference editor: drag schools between conferences (or use each school's menu), add,
 * rename and remove conferences, and set each one's rules and its bowls.
 */
export function ConferenceEditor({ teams, value, onChange, bowls, cap }: {
  teams: Team[]; value: ConferenceSetup; onChange: (v: ConferenceSetup) => void;
  bowls: { name: string; ny6: boolean }[]; cap: number;
}) {
  const byId = new Map(teams.map((t) => [t.id, t]));
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const tie = value.tie_ins ?? {};
  const set = (name: string, patch: Partial<ConferenceDef>) => onChange({ ...value, conferences: value.conferences.map((c) => (c.name === name ? { ...c, ...patch } : c)) });
  const rename = (from: string, to: string) => {
    if (!to.trim() || value.conferences.some((c) => c.name === to)) return;
    onChange({ conferences: value.conferences.map((c) => (c.name === from ? { ...c, name: to } : c)), tie_ins: renameIn(tie, from, to) });
  };
  const remove = (name: string) => {
    const c = value.conferences.find((x) => x.name === name)!;
    let next: ConferenceSetup = { ...value };
    for (const id of c.members) next = moveTeam(next, id, IND);
    onChange({ conferences: next.conferences.filter((x) => x.name !== name), tie_ins: renameIn(tie, name, null) });
  };
  const add = () => {
    const name = newName.trim();
    if (!name || value.conferences.some((c) => c.name === name)) return;
    onChange({ ...value, conferences: [...value.conferences, { name, tier: "group", members: [], divisions: null, title_game: true, conf_games: 8, cfp_bids: 0 }] });
    setNewName("");
  };
  const names = value.conferences.filter((c) => c.tier !== "independent").map((c) => c.name);
  const problems = value.conferences.filter((c) => c.tier !== "independent" && (c.members.length < 4 || c.members.length > cap))
    .map((c) => (c.members.length < 4 ? `${c.name} needs at least 4 schools` : `${c.name} is over the Protect College Sports Act's ${cap}-school cap (fine with the Act off)`));
  const bids = value.conferences.reduce((s, c) => s + c.cfp_bids, 0);
  return (
    <div className="confedit">
      <p className="muted small">Drag schools between conferences. A conference whose schools change gets a new conference schedule; the others keep their real 2026 schedules.</p>
      <div className="row">
        <input placeholder="New conference name" value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button onClick={add} disabled={!newName.trim()}>Add conference</button>
        {bids > 0 && <span className="muted small">{bids} playoff spots guaranteed to conferences</span>}
      </div>
      {problems.length > 0 && <ul className="warn">{problems.map((p) => <li key={p}>{p}</li>)}</ul>}
      <div className="confgrid">
        {sortConfs(value.conferences, byId).map((c) => (
          <section key={c.name} className={"panel confcard" + (over === c.name ? " over" : "")}
            onDragOver={(e) => { e.preventDefault(); setOver(c.name); }} onDragLeave={() => setOver(null)}
            onDrop={(e) => { e.preventDefault(); setOver(null); if (drag != null) onChange(moveTeam(value, drag, c.name)); setDrag(null); }}>
            <div className="confhead">
              {c.tier === "independent" ? <h3>{c.name}</h3> : <input className="confname" defaultValue={c.name} onBlur={(e) => rename(c.name, e.target.value.trim())} />}
              <span className="muted small">{c.members.length}</span>
              {c.tier !== "independent" && <button className="small" title="Remove (its schools become independents)" onClick={() => remove(c.name)}>×</button>}
            </div>
            {c.tier !== "independent" && <div className="confrules small">
              <select value={c.tier} onChange={(e) => set(c.name, { tier: e.target.value as ConferenceDef["tier"] })}>
                <option value="power">Power</option><option value="group">Group of Six</option>
              </select>
              <label><input type="checkbox" checked={c.title_game} onChange={(e) => set(c.name, { title_game: e.target.checked })} /> Title game</label>
              <label>Conf. games <input type="number" min={0} max={Math.min(11, c.members.length - 1)} value={c.conf_games}
                onChange={(e) => set(c.name, { conf_games: Math.max(0, Math.min(11, c.members.length - 1, Number(e.target.value) || 0)) })} /></label>
              <label title="Playoff spots kept for this conference's best teams in the committee's ranking">Playoff spots <input type="number" min={0} max={12} value={c.cfp_bids}
                onChange={(e) => set(c.name, { cfp_bids: Math.max(0, Number(e.target.value) || 0) })} /></label>
              {c.divisions && <span className="muted">Divisions: {Object.keys(c.divisions).join(" / ")}</span>}
            </div>}
            <ul className="confteams">
              {c.members.map((id) => byId.get(id)).filter((t): t is Team => !!t).sort((a, b) => a.school.localeCompare(b.school)).map((t) => (
                <li key={t.id} draggable onDragStart={() => setDrag(t.id)} onDragEnd={() => setDrag(null)}>
                  <Logo team={t} size={16} /> <span>{t.school}</span>
                  <select value={c.name} aria-label={`Move ${t.school}`} onChange={(e) => onChange(moveTeam(value, t.id, e.target.value))}>
                    {value.conferences.map((x) => <option key={x.name} value={x.name}>{x.name}</option>)}
                  </select>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <details className="tieins">
        <summary>Bowl tie-ins</summary>
        <p className="muted small">Each side of a bowl takes the best available team from its conferences; a side with none is at-large. The New Year's Six host playoff games when the playoff needs them.</p>
        <table className="grid tight"><thead><tr><th>Bowl</th><th>One side</th><th>Other side</th></tr></thead>
          <tbody>{bowls.map((b) => (
            <tr key={b.name}><td>{b.name}{b.ny6 ? <span className="tag">NY6</span> : null}</td>
              {[0, 1].map((side) => {
                const cur = tie[b.name]?.[side] ?? [];
                const put = (xs: string[]) => { const sides = [...(tie[b.name] ?? [[], []])] as [string[], string[]]; sides[side] = xs; onChange({ ...value, tie_ins: { ...tie, [b.name]: sides } }); };
                return (
                  <td key={side}>
                    {cur.length === 0 && <span className="muted small">at-large </span>}
                    {cur.map((n) => <button key={n} className="chip small" title="Remove" onClick={() => put(cur.filter((x) => x !== n))}>{n} ×</button>)}
                    <select value="" onChange={(e) => e.target.value && put([...cur, e.target.value])}>
                      <option value="">+</option>
                      {names.filter((n) => !cur.includes(n)).map((n) => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </td>
                );
              })}
            </tr>
          ))}</tbody></table>
      </details>
    </div>
  );
}

/** League > Conferences: who is in each conference, its rules, champion and bowls. */
export function Conferences() {
  const { id, team, rank } = useLeague();
  const data = useData(() => api.conferences(id), []);
  if (!data) return <p className="muted">Loading...</p>;
  const byId = new Map(data.conferences.flatMap((c) => c.members.map((m) => [m, team(m)!] as const)).filter(([, t]) => !!t));
  const bowlsOf = (name: string) => Object.entries(data.tie_ins).filter(([, s]) => s[0].includes(name) || s[1].includes(name)).map(([b]) => b);
  return (
    <div className="confgrid">
      {sortConfs(data.conferences, byId).map((c) => {
        const champ = data.champs[c.name];
        return (
          <section key={c.name} className="panel confcard">
            <h3>{c.name} <span className="muted small">{TIERS[c.tier]} · {c.members.length} schools</span></h3>
            {c.tier !== "independent" && <p className="small muted">
              {c.conf_games} conference games{c.title_game ? ", title game" : ", no title game"}{c.divisions ? ` (${Object.keys(c.divisions).join(" and ")} divisions)` : ""}
              {c.cfp_bids ? `, ${c.cfp_bids} guaranteed playoff spot${c.cfp_bids > 1 ? "s" : ""}` : ""}</p>}
            {champ != null && <p className="small">Champion: <TeamName team={team(champ)} league={id} /></p>}
            <ul className="confteams">{c.members.map((m) => team(m)).filter((t): t is Team => !!t).sort((a, b) => a.school.localeCompare(b.school)).map((t) => (
              <li key={t.id}><Logo team={t} size={16} /> <TeamName team={t} rank={rank(t.id)} league={id} /></li>
            ))}</ul>
            {c.tier !== "independent" && <p className="small muted">Bowls: {bowlsOf(c.name).join(", ") || "at-large only"}</p>}
          </section>
        );
      })}
    </div>
  );
}
