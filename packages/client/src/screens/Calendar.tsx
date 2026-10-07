import { useState } from "react";
import { useLeague, useData } from "../App.tsx";
import { api, type CalEvent } from "../api.ts";
import { addDays } from "../util.tsx";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function CalendarScreen() {
  const { id, state } = useLeague();
  const [month, setMonth] = useState(state.date.slice(0, 7));
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const startPad = new Date(first + "T12:00:00Z").getUTCDay();
  const gridStart = addDays(first, -startPad);
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  const data = useData(() => api.calendar(id, days[0], days[41]), [month]);
  const myGames = useData(() => (state.user_team_id != null ? api.schedule(id, { team: String(state.user_team_id) }) : Promise.resolve([])), []);
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); setMonth(d.toISOString().slice(0, 7)); };
  const byDay = new Map<string, CalEvent[]>();
  for (const e of data?.events ?? []) {
    for (let d = e.date; d <= (e.end_date ?? e.date); d = addDays(d, 1)) {
      if (e.end_date && d !== e.date && e.type !== "portal_window") continue;
      byDay.set(d, [...(byDay.get(d) || []), e]);
    }
  }
  return (
    <div>
      <div className="calhead">
        <button onClick={() => shift(-1)}>‹</button><h2>{MONTHS[m - 1]} {y}</h2><button onClick={() => shift(1)}>›</button>
        <button onClick={() => setMonth(state.date.slice(0, 7))}>Today</button>
      </div>
      <div className="calendar">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="dow">{d}</div>)}
        {days.map((d) => {
          const mine = myGames?.find((g) => g.date === d);
          const opp = mine ? (mine.home_id === state.user_team_id ? mine.away_id : mine.home_id) : null;
          return (
            <div key={d} className={"day" + (d.slice(0, 7) !== month ? " other" : "") + (d === state.date ? " today" : "") + (d < state.date ? " past" : "")}>
              <div className="dnum">{Number(d.slice(8))}</div>
              {mine && <a className="ev mygame" href={`#/l/${id}/${mine.status === "final" ? "game/" + mine.id : "schedule/" + d}`}>{mine.home_id === state.user_team_id ? "vs" : "at"} <MiniTeam id={opp!} />{mine.status === "final" ? ` ${score(mine, state.user_team_id!)}` : ""}</a>}
              {(byDay.get(d) || []).map((e) => (
                <a key={e.id} href={e.type === "game_day" ? `#/l/${id}/schedule/${d}` : undefined} className={`ev t-${e.type}${e.active ? "" : " inactive"}${e.status === "done" ? " done" : ""}`} title={e.approx ? "Approximate date" : ""}>
                  {e.type === "game_day" ? e.label : e.label}
                </a>
              ))}
            </div>
          );
        })}
      </div>
      <p className="muted small">Faded events belong to systems built in later milestones; they appear on the calendar but do nothing yet.</p>
    </div>
  );
}

function MiniTeam({ id }: { id: number }) {
  const { team } = useLeague();
  return <>{team(id)?.abbr ?? "?"}</>;
}

function score(g: { home_id: number; home_score: number | null; away_score: number | null }, me: number) {
  const us = g.home_id === me ? g.home_score! : g.away_score!, them = g.home_id === me ? g.away_score! : g.home_score!;
  return `${us > them ? "W" : "L"} ${us}-${them}`;
}
