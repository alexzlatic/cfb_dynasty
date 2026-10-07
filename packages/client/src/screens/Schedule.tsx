import { useLeague, useData } from "../App.tsx";
import { api } from "../api.ts";
import { go } from "../router.ts";
import { addDays, fmtDate } from "../util.tsx";
import { GameTable } from "./common.tsx";

export function Schedule({ date }: { date?: string }) {
  const { id, state } = useLeague();
  const d = date || state.date;
  const games = useData(() => api.schedule(id, { date: d }), [d]);
  const sorted = (games ?? []).slice().sort((a, b) => {
    const ra = Math.min(a.home_rank ?? 99, a.away_rank ?? 99), rb = Math.min(b.home_rank ?? 99, b.away_rank ?? 99);
    return ra - rb || (a.kickoff_et ?? "99").localeCompare(b.kickoff_et ?? "99");
  });
  return (
    <div>
      <div className="calhead">
        <button onClick={() => go("l", id, "schedule", addDays(d, -1))}>‹</button>
        <h2>{fmtDate(d, true)}</h2>
        <button onClick={() => go("l", id, "schedule", addDays(d, 1))}>›</button>
        <input type="date" value={d} onChange={(e) => e.target.value && go("l", id, "schedule", e.target.value)} />
        {d !== state.date && <button onClick={() => go("l", id, "schedule", state.date)}>Today</button>}
      </div>
      {games && <p className="muted">{games.length} game{games.length === 1 ? "" : "s"}{d >= state.date && games.some((g) => g.status !== "final") ? ", not yet played" : ""}</p>}
      {games && <GameTable games={sorted} />}
    </div>
  );
}
