import { useLeague, useData } from "../App.tsx";
import { api } from "../api.ts";
import { Logo, TeamName } from "../util.tsx";
import { GameTable, Panel } from "./common.tsx";

export function Postseason() {
  const { id, state, team } = useLeague();
  const games = useData(() => api.schedule(id, {}), []);
  const p = state.settings.playoff;
  const fmt = p.format === "playoff" ? `${p.teams}-team playoff: ${p.auto_bids} automatic bids for the highest-ranked conference champions, ${p.byes} byes, ${p.campus_first_round ? "campus" : "neutral"} early rounds`
    : p.format === "bcs" ? "BCS: the top two in the BCS standings meet in one title game" : "Bowls only: the final AP poll names the champion (bowl games arrive in M1)";
  const titles = (games ?? []).filter((g) => g.kind === "conf_champ");
  const rounds = new Map<number, typeof titles>();
  for (const g of games ?? []) if (g.kind === "playoff") rounds.set(g.round!, [...(rounds.get(g.round!) || []), g]);
  return (
    <div>
      <p><b>Format:</b> {fmt}. <a href={`#/l/${id}/settings`}>Change</a></p>
      {state.champion != null && <div className="banner"><Logo team={team(state.champion)} size={40} /> {team(state.champion)?.school} are national champions</div>}
      <div className="cols">
        <div>
          {[...rounds].sort((a, b) => b[0] - a[0]).map(([r, gs]) => <Panel key={r} title={gs[0].label?.replace(/ \(.*\)$/, "") ?? `Round ${r}`}><GameTable games={gs} showDate /></Panel>)}
          <Panel title="Conference championships">{titles.length ? <GameTable games={titles} showDate /> : <p className="muted">Set after the last regular-season conference games.</p>}</Panel>
        </div>
        <Panel title="Field">
          {state.playoff ? (
            <table className="grid tight"><tbody>{state.playoff.field.map((f) => (
              <tr key={f.seed}><td className="num">{f.seed}</td><td><Logo team={team(f.team_id)} size={18} /> <TeamName team={team(f.team_id)} league={id} /></td></tr>
            ))}</tbody></table>
          ) : <p className="muted">Selected on selection day, the day after conference championships.</p>}
        </Panel>
      </div>
    </div>
  );
}
