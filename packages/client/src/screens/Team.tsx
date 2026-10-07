import { useMemo, useState } from "react";
import { useLeague, useData } from "../App.tsx";
import { api, type Player } from "../api.ts";
import { Logo, heightStr, onColor } from "../util.tsx";
import { GameTable, NewsList, Panel } from "./common.tsx";
import { RosterTable } from "./Players.tsx";

const POS_ORDER = ["QB", "RB", "WR", "TE", "OL", "DL", "EDGE", "LB", "DB", "CB", "S", "K", "P", "LS", "ATH"];
const ROLE = { HC: "Head coach", OC: "Offensive coordinator", DC: "Defensive coordinator", STC: "Special teams coordinator" } as const;

export function TeamPage({ tid }: { tid: number }) {
  const { id } = useLeague();
  const data = useData(() => api.team(id, tid), [tid]);
  const stories = useData(() => api.news(id, { team: String(tid), kind: "story", limit: "6" }), [tid]);
  const [sort, setSort] = useState<"pos" | "name" | "class" | "jersey">("pos");
  const roster = useMemo(() => {
    const r = (data?.roster ?? []).slice();
    const cls = ["FR", "SO", "JR", "SR"];
    r.sort((a: Player, b: Player) =>
      sort === "name" ? a.last.localeCompare(b.last) :
      sort === "class" ? cls.indexOf(b.class) - cls.indexOf(a.class) :
      sort === "jersey" ? (a.jersey ?? 999) - (b.jersey ?? 999) :
      (POS_ORDER.indexOf(a.pos) + 99) % 99 - (POS_ORDER.indexOf(b.pos) + 99) % 99 || a.last.localeCompare(b.last));
    return r;
  }, [data, sort]);
  if (!data) return <p className="muted">Loading...</p>;
  const t = data.team;
  const fin = data.games.filter((g) => g.status === "final");
  const w = fin.filter((g) => (g.home_id === tid) === (g.home_score! > g.away_score!)).length;
  return (
    <div>
      <div className="teamhead" style={{ background: t.color, color: onColor(t.color), borderBottomColor: t.alt_color }}>
        <Logo team={t} size={72} />
        <div>
          <h1>{data.rank ? <span className="rank big">{data.rank}</span> : null}{t.school} {t.mascot}</h1>
          <div>{t.conference}{t.division ? ` (${t.division})` : ""} · {w}-{fin.length - w} · {t.level.toUpperCase()}</div>
          <div className="small">{t.venue.name}, {t.venue.city}, {t.venue.state}{t.venue.capacity ? ` · capacity ${t.venue.capacity.toLocaleString()}` : ""}{t.venue.elevation_m ? ` · elevation ${Math.round(t.venue.elevation_m * 3.281).toLocaleString()} ft` : ""}</div>
        </div>
        <div className="power" title="Expected margin against an average FBS team on a neutral field">Strength {data.power >= 0 ? "+" : ""}{data.power?.toFixed(1)}</div>
      </div>
      <div className="cols">
        <div>
          <Panel title="Schedule"><GameTable games={data.games} showDate /></Panel>
          {data.players.length ? (
            <Panel title={`Roster (${data.players.length})`} right={<a href={`#/l/${id}/depth/${tid}`}>Depth chart</a>}>
              <RosterTable players={data.players} depth={data.depth} />
            </Panel>
          ) : (
            <Panel title={`Roster (${data.roster.length})`} right={
              <select value={sort} onChange={(e) => setSort(e.target.value as never)}>
                <option value="pos">By position</option><option value="name">By name</option><option value="class">By class</option><option value="jersey">By number</option>
              </select>}>
              <table className="grid tight">
                <thead><tr><th>#</th><th>Name</th><th>Pos</th><th>Class</th><th>Ht</th><th>Wt</th><th>Hometown</th></tr></thead>
                <tbody>{roster.map((p) => (
                  <tr key={String(p.id)}><td className="num muted">{p.jersey ?? ""}</td><td>{p.first} {p.last}</td><td>{p.pos}</td><td>{p.class}</td>
                    <td>{heightStr(p.height)}</td><td>{p.weight ?? ""}</td><td className="muted">{[p.home.city, p.home.state].filter(Boolean).join(", ")}</td></tr>
                ))}</tbody>
              </table>
            </Panel>
          )}
        </div>
        <div>
          <Panel title="Staff">
            <table className="grid tight"><tbody>{data.coaches.map((c, i) => {
              const recs = c.career.reduce((a, s) => ({ w: a.w + s.wins, l: a.l + s.losses }), { w: 0, l: 0 });
              return (
                <tr key={i}><td>{ROLE[c.role]}</td><td>{c.first} {c.last}</td>
                  <td className="muted small">{c.role === "HC" && c.career.length ? `${recs.w}-${recs.l} career` : c.source === "generated" ? "generated" : c.source_url ? <a href={c.source_url} target="_blank" rel="noreferrer">source</a> : ""}</td></tr>
              );
            })}</tbody></table>
          </Panel>
          <Panel title="Beat coverage">{stories && <NewsList items={stories} />}</Panel>
        </div>
      </div>
    </div>
  );
}
