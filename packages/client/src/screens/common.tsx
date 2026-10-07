import { useLeague } from "../App.tsx";
import type { GameRow, NewsItem } from "../api.ts";
import { Logo, TeamName, fmtKick, shortDate } from "../util.tsx";

/** One game as a compact scoreboard row: away at home, score or kickoff, and a link to the game page. */
export function GameLine({ g, showDate = false }: { g: GameRow; showDate?: boolean }) {
  const { id, team, state } = useLeague();
  const h = team(g.home_id), a = team(g.away_id);
  const final = g.status === "final";
  const homeWon = final && g.home_score! > g.away_score!;
  const mine = state.user_team_id != null && (g.home_id === state.user_team_id || g.away_id === state.user_team_id);
  return (
    <tr className={mine ? "mine" : ""}>
      {showDate && <td className="muted nowrap">{shortDate(g.date)}</td>}
      <td className={final && !homeWon ? "win" : ""}><Logo team={a} size={20} /> <TeamName team={a} rank={g.away_rank} league={id} />{g.away_seed ? <span className="seed">({g.away_seed})</span> : null}</td>
      <td className="num">{final ? g.away_score : ""}</td>
      <td className="muted center">{g.neutral ? "vs" : "at"}</td>
      <td className={final && homeWon ? "win" : ""}><Logo team={h} size={20} /> <TeamName team={h} rank={g.home_rank} league={id} />{g.home_seed ? <span className="seed">({g.home_seed})</span> : null}</td>
      <td className="num">{final ? g.home_score : ""}</td>
      <td className="muted small">{final ? <a href={`#/l/${id}/game/${g.id}`}>Final{g.overtime ? " (OT)" : ""}</a> : fmtKick(g.kickoff_et)}</td>
      <td className="muted small">{g.label ?? (g.conference_game ? h?.conference : "")}</td>
    </tr>
  );
}

export function GameTable({ games, showDate = false }: { games: GameRow[]; showDate?: boolean }) {
  if (!games.length) return <p className="muted">No games.</p>;
  return <table className="grid games"><tbody>{games.map((g) => <GameLine key={g.id} g={g} showDate={showDate} />)}</tbody></table>;
}

export function NewsList({ items, compact = false }: { items: NewsItem[]; compact?: boolean }) {
  const { id } = useLeague();
  if (!items.length) return <p className="muted">Nothing yet.</p>;
  return (
    <ul className={"news" + (compact ? " compact" : "")}>
      {items.map((n) => (
        <li key={n.id} className={"k-" + n.kind}>
          <div className="headline">{n.headline}</div>
          {!compact && n.body && <div className="body">{n.body}</div>}
          <div className="meta">{shortDate(n.date)}{n.author ? <> · <a href={`#/l/${id}/writer/${n.author}`}>beat writer</a></> : null}</div>
        </li>
      ))}
    </ul>
  );
}

export function Panel({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return <section className="panel"><h3>{title}<span className="right">{right}</span></h3>{children}</section>;
}
