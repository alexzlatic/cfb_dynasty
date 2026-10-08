import { useLeague, useData } from "../App.tsx";
import { api } from "../api.ts";
import { Logo, TeamName } from "../util.tsx";

const ORDER = ["SEC", "Big Ten", "ACC", "Big 12", "Pac-12", "American Athletic", "Mountain West", "Sun Belt", "Mid-American", "Conference USA", "FBS Independents"];

export function Standings() {
  const { id, team, rank, state } = useLeague();
  const data = useData(() => api.standings(id), []);
  if (!data) return <p className="muted">Loading...</p>;
  // Conferences the league made up go after the real power conferences, independents last.
  const at = (c: string) => (ORDER.includes(c) ? ORDER.indexOf(c) : c === "FBS Independents" ? 99 : 3.5);
  const confs = data.slice().sort((a, b) => at(a.conference) - at(b.conference));
  return (
    <div className="standings">
      {confs.map((c) => (
        <section key={c.conference} className="panel">
          <h3>{c.conference}</h3>
          <table className="grid tight">
            <thead><tr><th>Team</th><th className="num">Conf</th><th className="num">All</th></tr></thead>
            <tbody>{c.rows.map((r) => (
              <tr key={r.team_id} className={r.team_id === state.user_team_id ? "mine" : ""}>
                <td><Logo team={team(r.team_id)} size={18} /> <TeamName team={team(r.team_id)} rank={rank(r.team_id)} league={id} />
                  {Object.values(state.playoff?.field ?? []).some((f) => f.team_id === r.team_id) ? <span className="tag">playoff</span> : null}</td>
                <td className="num">{c.conference === "FBS Independents" ? "" : `${r.cw}-${r.cl}`}</td>
                <td className="num">{r.w}-{r.l}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
