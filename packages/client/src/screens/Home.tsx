import { useLeague, useData } from "../App.tsx";
import { api } from "../api.ts";
import { Logo, TeamName, fmtDate, shortDate } from "../util.tsx";
import { GameTable, NewsList, Panel } from "./common.tsx";

export function Home() {
  const { id, state, team } = useLeague();
  const my = state.user_team_id;
  const myGames = useData(() => (my != null ? api.schedule(id, { team: String(my) }) : Promise.resolve([])), [my]);
  const today = useData(() => api.schedule(id, { date: state.date }), [state.date]);
  const headlines = useData(() => api.news(id, { stories: "0", limit: "12" }), []);
  const myStories = useData(() => (my != null ? api.news(id, { team: String(my), kind: "story", limit: "3" }) : Promise.resolve([])), [my]);
  const recent = (myGames ?? []).filter((g) => g.status === "final").slice(-3);
  const next = (myGames ?? []).filter((g) => g.status !== "final").slice(0, 3);
  const rec = (myGames ?? []).filter((g) => g.status === "final").reduce((r, g) => {
    const won = (g.home_id === my) === (g.home_score! > g.away_score!);
    return won ? { ...r, w: r.w + 1 } : { ...r, l: r.l + 1 };
  }, { w: 0, l: 0 });
  return (
    <div className="cols">
      <div>
        {state.champion != null && <div className="banner"><Logo team={team(state.champion)} size={40} /> {team(state.champion)?.school} are national champions</div>}
        {my != null && (
          <Panel title={`${team(my)?.school} (${rec.w}-${rec.l})`} right={<a href={`#/l/${id}/team/${my}`}>Team page</a>}>
            <h4>Up next</h4>
            <GameTable games={next} showDate />
            <h4>Recent</h4>
            <GameTable games={recent} showDate />
          </Panel>
        )}
        <Panel title={`Today: ${fmtDate(state.date)}`} right={<a href={`#/l/${id}/schedule/${state.date}`}>Full schedule</a>}>
          {today && today.length ? <GameTable games={today.slice(0, 15)} /> : <p className="muted">No games today.</p>}
        </Panel>
        <Panel title="Coming up" right={<a href={`#/l/${id}/calendar`}>Calendar</a>}>
          <table className="grid"><tbody>{state.upcoming.map((e) => (
            <tr key={e.id}><td className="nowrap">{shortDate(e.date)}{e.end_date ? `–${shortDate(e.end_date)}` : ""}</td><td>{e.label}{e.approx ? <span className="muted"> (approx.)</span> : null}{!e.active ? <span className="tag">later milestone</span> : null}</td></tr>
          ))}</tbody></table>
        </Panel>
      </div>
      <div>
        <Panel title="AP Top 25" right={<a href={`#/l/${id}/polls`}>Polls</a>}>
          {state.ap.length ? (
            <table className="grid tight"><tbody>{state.ap.map((r, i) => (
              <tr key={r.team_id} className={r.team_id === my ? "mine" : ""}><td className="num">{i + 1}</td><td><Logo team={team(r.team_id)} size={18} /> <TeamName team={team(r.team_id)} league={id} /></td><td className="num muted">{r.points}</td></tr>
            ))}</tbody></table>
          ) : <p className="muted">The preseason poll comes out on the first day.</p>}
        </Panel>
        {myStories && myStories.length > 0 && <Panel title="From your beat writer"><NewsList items={myStories} /></Panel>}
        <Panel title="Headlines" right={<a href={`#/l/${id}/news`}>All news</a>}>{headlines && <NewsList items={headlines} compact />}</Panel>
      </div>
    </div>
  );
}
