import { useLeague, useData } from "../App.tsx";
import { api, type RetentionData } from "../api.ts";
import { Logo, TeamName, addDays, fmtDate, shortDate } from "../util.tsx";
import { GameTable, NewsList, Panel } from "./common.tsx";
import { CareerCard } from "./Career.tsx";

export function Home() {
  const { id, state, team } = useLeague();
  const my = state.user_team_id;
  const myGames = useData(() => (my != null ? api.schedule(id, { team: String(my) }) : Promise.resolve([])), [my]);
  const today = useData(() => api.schedule(id, { date: state.date }), [state.date]);
  const headlines = useData(() => api.news(id, { stories: "0", limit: "12" }), []);
  const keep = useData(() => (my != null ? api.retention(id) : Promise.resolve(null)), [my, state.date]);
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
        {my != null && state.my_next_game?.date === state.date && (
          <div className="banner gameday">
            Game day: {team(state.my_next_game.away_id)?.school} {state.my_next_game.neutral ? "vs" : "at"} {team(state.my_next_game.home_id)?.school}
            <a className="button primary" href={`#/l/${id}/live`}>Play it live</a>
            <span className="small muted">or sim the day and your coordinators play it</span>
          </div>
        )}
        {keep && <NeedsYou keep={keep} />}
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
        {state.career && <CareerCard c={state.career} />}
        <Panel title="AP Top 25" right={<a href={`#/l/${id}/polls`}>Polls</a>}>
          {state.ap.length ? (
            <table className="grid tight"><tbody>{state.ap.map((r, i) => (
              <tr key={r.team_id} className={r.team_id === my ? "mine" : ""}><td className="num">{i + 1}</td><td><Logo team={team(r.team_id)} size={18} /> <TeamName team={team(r.team_id)} league={id} /></td><td className="num muted">{r.points}</td></tr>
            ))}</tbody></table>
          ) : <p className="muted">The preseason poll comes out on the first day.</p>}
        </Panel>
        {state.past.length > 0 && (
          <Panel title="Past seasons">
            <table className="grid tight"><tbody>{[...state.past].reverse().map((y) => (
              <tr key={y.year}>
                <td className="num">{y.year}</td>
                <td>{y.champion != null ? <><Logo team={team(y.champion)} size={18} /> {team(y.champion)?.school}</> : "-"}</td>
                <td className="muted">{y.user ? `You: ${y.user.w}-${y.user.l}${y.user.rank ? `, No. ${y.user.rank}` : ""}` : ""}</td>
              </tr>
            ))}</tbody></table>
          </Panel>
        )}
        {myStories && myStories.length > 0 && <Panel title="From your beat writer"><NewsList items={myStories} /></Panel>}
        <Panel title="Headlines" right={<a href={`#/l/${id}/news`}>All news</a>}>{headlines && <NewsList items={headlines} compact />}</Panel>
      </div>
    </div>
  );
}

/** What needs you this week: renewal talks, the portal, and players thinking about leaving. */
function NeedsYou({ keep }: { keep: RetentionData }) {
  const { id, state } = useLeague();
  const rows = keep.rows.filter((r) => !r.watch.leaving);
  const shopping = rows.filter((r) => (r.watch.watch === "shopping" || r.watch.watch === "gone") && r.importance <= 40);
  const open = keep.rows.filter((r) => r.talk && !r.talk.outcome && r.talk.plan?.kind === "needs_you" && !r.talk.offer);
  const answers = keep.rows.filter((r) => r.talk?.offer && r.talk.offer.answer <= addDays(state.date, 1));
  const portal = state.upcoming.find((e) => e.type === "portal_window");
  const items: { text: string; href: string }[] = [];
  if (keep.talks_open) {
    const pending = keep.rows.filter((r) => r.talk?.pending).length;
    if (pending) items.push({ text: `Confirm ${pending} auto-renewal${pending === 1 ? "" : "s"} (or revoke one to send him to the portal)`, href: `#/l/${id}/renewals` });
    if (open.length) items.push({ text: `${open.length} player${open.length === 1 ? "" : "s"} in renewal talks need${open.length === 1 ? "s" : ""} your decision`, href: `#/l/${id}/renewals` });
    if (answers.length) items.push({ text: `${answers.length} answer${answers.length === 1 ? "" : "s"} to your offers due by tomorrow`, href: `#/l/${id}/retention` });
    items.push({ text: `Talks close December 31; the portal opens ${portal ? shortDate(portal.date) : "January 2"}`, href: `#/l/${id}/retention` });
  } else if (keep.portal_open) {
    items.push({ text: "The transfer portal is open: bid for players to fill your needs", href: `#/l/${id}/portal` });
  }
  if (shopping.length) items.push({ text: `${shopping.length} of your key player${shopping.length === 1 ? " is" : "s are"} shopping: ${shopping.slice(0, 3).map((r) => `${r.pos} ${r.name}`).join(", ")}`, href: `#/l/${id}/retention` });
  if (!items.length) return null;
  return (
    <div className="needsyou">
      <h3>Needs you</h3>
      <ul>{items.map((x, i) => <li key={i}><a href={x.href}>{x.text}</a></li>)}</ul>
    </div>
  );
}
