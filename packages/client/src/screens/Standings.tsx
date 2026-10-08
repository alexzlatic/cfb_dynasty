import { useLeague, useData } from "../App.tsx";
import { api } from "../api.ts";
import { Logo, TeamName } from "../util.tsx";
import { SortTable } from "../sort.tsx";

/** Win share, with more wins ahead on ties (5-1 over 4-1 over 0-0). */
const pct = (w: number, l: number) => (w + l ? w / (w + l) : 0) + w * 1e-4;

const ORDER = ["SEC", "Big Ten", "ACC", "Big 12", "Pac-12", "American Athletic", "Mountain West", "Sun Belt", "Mid-American", "Conference USA", "FBS Independents"];

export function Standings() {
  const { id, team, rank, state } = useLeague();
  const data = useData(() => api.standings(id), []);
  if (!data) return <p className="muted">Loading...</p>;
  const confs = data.slice().sort((a, b) => ORDER.indexOf(a.conference) - ORDER.indexOf(b.conference));
  return (
    <div className="standings">
      {confs.map((c) => (
        <section key={c.conference} className="panel">
          <h3>{c.conference}</h3>
          <SortTable rows={c.rows} rowKey={(r) => r.team_id} rowClass={(r) => (r.team_id === state.user_team_id ? "mine" : undefined)} cols={[
            { key: "team", label: "Team", by: (r) => team(r.team_id)?.school, cell: (r) => <><Logo team={team(r.team_id)} size={18} /> <TeamName team={team(r.team_id)} rank={rank(r.team_id)} league={id} />
              {Object.values(state.playoff?.field ?? []).some((f) => f.team_id === r.team_id) ? <span className="tag">playoff</span> : null}</> },
            { key: "conf", label: "Conf", className: "num", by: c.conference === "FBS Independents" ? undefined : (r) => pct(r.cw, r.cl), cell: (r) => (c.conference === "FBS Independents" ? "" : `${r.cw}-${r.cl}`) },
            { key: "all", label: "All", className: "num", by: (r) => pct(r.w, r.l), cell: (r) => `${r.w}-${r.l}` },
          ]} />
        </section>
      ))}
    </div>
  );
}
