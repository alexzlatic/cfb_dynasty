import { useMemo, useState } from "react";
import { ATTR_LABELS, ATTRS, type Pos } from "@cfb/core/players";
import { useData, useLeague } from "../App.tsx";
import { api, type DepthChart, type RatedPlayer } from "../api.ts";
import { Logo, heightStr, onColor } from "../util.tsx";
import { GameLine, Panel } from "./common.tsx";

export const POS_ORDER: Pos[] = ["QB", "RB", "WR", "TE", "OL", "DE", "DT", "LB", "CB", "S", "K", "P", "LS"];
const CLASS_ORDER = ["FR", "SO", "JR", "SR"];

/** A rating as a colored number: 90+ elite, 80s very good, 75 a typical starter, 60s depth. */
export function Rating({ v, big = false }: { v: number; big?: boolean }) {
  const tier = v >= 90 ? "r-elite" : v >= 82 ? "r-great" : v >= 74 ? "r-good" : v >= 66 ? "r-ok" : "r-low";
  return <span className={`rating ${tier}${big ? " big" : ""}`}>{v}</span>;
}

export function Bar({ label, v }: { label: string; v: number }) {
  return (
    <div className="attr">
      <span className="lbl">{label}</span>
      <span className="track"><span className="fill" style={{ width: `${Math.max(2, ((v - 20) / 79) * 100)}%` }} /></span>
      <Rating v={v} />
    </div>
  );
}

export const playerLink = (league: string, p: { id: number; first: string; last: string }) => <a href={`#/l/${league}/player/${p.id}`}>{p.first} {p.last}</a>;

/** Which depth chart slots a player holds, e.g. "QB" or "CB2 (2)". */
export function slotsOf(depth: DepthChart, id: number): string[] {
  return Object.entries(depth).flatMap(([s, ids]) => (ids ?? []).map((x, i) => (x === id ? (i ? `${s} (${i + 1})` : s) : null))).filter((x): x is string => !!x);
}

export function RosterTable({ players, depth }: { players: RatedPlayer[]; depth: DepthChart }) {
  const { id } = useLeague();
  const [pos, setPos] = useState<Pos | "ALL">("ALL");
  const [sort, setSort] = useState<"pos" | "ovr" | "name" | "class">("pos");
  const starters = useMemo(() => new Set(Object.values(depth).map((ids) => ids?.[0])), [depth]);
  const rows = useMemo(() => {
    const r = players.filter((p) => pos === "ALL" || p.pos === pos).slice();
    r.sort((a, b) =>
      sort === "ovr" ? b.ovr - a.ovr :
      sort === "name" ? a.last.localeCompare(b.last) :
      sort === "class" ? CLASS_ORDER.indexOf(b.class) - CLASS_ORDER.indexOf(a.class) || b.ovr - a.ovr :
      POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || +starters.has(b.id) - +starters.has(a.id) || b.ovr - a.ovr);
    return r;
  }, [players, pos, sort, starters]);
  const attrs = pos === "ALL" ? [] : ATTRS[pos];
  return (
    <>
      <div className="filters">
        {(["ALL", ...POS_ORDER] as const).map((x) => <button key={x} className={pos === x ? "on" : ""} onClick={() => setPos(x)}>{x === "ALL" ? "All" : x}</button>)}
        <select value={sort} onChange={(e) => setSort(e.target.value as never)}>
          <option value="pos">By position</option><option value="ovr">By overall</option><option value="name">By name</option><option value="class">By class</option>
        </select>
      </div>
      <div className="scrollx">
        <table className="grid tight roster">
          <thead><tr><th>#</th><th>Name</th><th>Pos</th><th>Ovr</th><th>Class</th><th>Ht</th><th>Wt</th><th title="Recruiting stars">Rec</th>
            {attrs.map((a) => <th key={a} title={ATTR_LABELS[a]}>{abbr(a)}</th>)}<th>Depth</th></tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id} className={starters.has(p.id) ? "starter" : ""}>
              <td className="num muted">{p.jersey ?? ""}</td><td>{playerLink(id, p)}</td><td>{p.pos}</td><td><Rating v={p.ovr} /></td>
              <td>{p.class}</td><td>{heightStr(p.height)}</td><td>{p.weight ?? ""}</td><td className="muted">{p.stars ? "★".repeat(p.stars) : ""}</td>
              {attrs.map((a) => <td key={a} className="num">{p.attrs[a]}</td>)}
              <td className="muted small">{slotsOf(depth, p.id).join(", ")}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

const abbr = (a: string) => ATTR_LABELS[a].split(" ").map((w) => w.slice(0, 3)).join(" ");

const STAT_COLS: [string, string][] = [["att", "Att"], ["cmp", "Cmp"], ["pass_yds", "Pass yds"], ["pass_td", "TD"], ["int", "Int"], ["car", "Car"],
  ["rush_yds", "Rush yds"], ["rush_td", "TD"], ["rec", "Rec"], ["rec_yds", "Rec yds"], ["rec_td", "TD"], ["fgm", "FGM"], ["fga", "FGA"]];

export function PlayerPage({ pid }: { pid: number }) {
  const { id } = useLeague();
  const data = useData(() => api.player(id, pid), [pid]);
  if (!data) return <p className="muted">Loading...</p>;
  const { player: p, team: t, log } = data;
  const cols = STAT_COLS.filter(([k]) => log.some((g) => g.line[k]));
  const tot: Record<string, number> = {};
  for (const g of log) for (const [k] of cols) tot[k] = (tot[k] ?? 0) + (g.line[k] ?? 0);
  return (
    <div>
      <div className="teamhead" style={{ background: t.color, color: onColor(t.color), borderBottomColor: t.alt_color }}>
        <Logo team={t} size={64} />
        <div>
          <h1>{p.jersey != null ? <span className="muted">#{p.jersey} </span> : null}{p.first} {p.last}</h1>
          <div>{p.pos} · {p.class} · <a href={`#/l/${id}/team/${t.id}`} style={{ color: "inherit" }}>{t.school}</a>{data.slots.length ? ` · ${data.slots.join(", ")} on the depth chart` : ""}</div>
          <div className="small">{[heightStr(p.height), p.weight ? `${p.weight} lb` : null, [p.home.city, p.home.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</div>
        </div>
        <div className="power">Overall <Rating v={p.ovr} big /></div>
      </div>
      <div className="cols">
        <div>
          <Panel title="Ratings">
            {ATTRS[p.pos].map((a) => <Bar key={a} label={ATTR_LABELS[a]} v={p.attrs[a]} />)}
            <p className="muted small">{p.basis === "stats" ? `Rated from ${p.sample} ${p.pos === "QB" ? "attempts" : "plays"} of 2024-25 stats plus recruiting.` : "Rated mostly from recruiting and experience (little college playing time)."}</p>
          </Panel>
          <Panel title={`2026 game log (${log.length})`}>
            {!log.length ? <p className="muted">No stats yet.</p> : (
              <table className="grid tight">
                <thead><tr><th>Game</th>{cols.map(([k, l]) => <th key={k} className="num">{l}</th>)}</tr></thead>
                <tbody>
                  {log.map(({ game, line }) => (
                    <tr key={game.id}><td><GameLine g={game} showDate /></td>{cols.map(([k]) => <td key={k} className="num">{line[k] ?? ""}</td>)}</tr>
                  ))}
                  <tr className="total"><td>Season</td>{cols.map(([k]) => <td key={k} className="num">{tot[k]}</td>)}</tr>
                </tbody>
              </table>
            )}
          </Panel>
        </div>
        <div>
          <Panel title="Traits">
            <Bar label="Stamina" v={p.traits.stamina} />
            <Bar label="Toughness" v={p.traits.toughness} />
            <Bar label="Discipline" v={p.traits.discipline} />
            <Bar label="Injury proneness" v={p.traits.injury} />
            {p.tend.scramble != null && <p className="small">Scrambles on {(p.tend.scramble * 100).toFixed(0)}% of dropbacks.</p>}
            <p className="muted small">Potential and work ethic are hidden until scouting arrives.</p>
          </Panel>
          <Panel title="Background">
            <table className="grid tight"><tbody>
              <tr><td>Recruiting</td><td>{p.stars ? `${"★".repeat(p.stars)} (${p.composite?.toFixed(4)})` : "Unranked"}{p.natl_rank ? `, #${p.natl_rank} nationally` : ""}</td></tr>
              <tr><td>Seasons in college</td><td>{Math.floor(p.years)}</td></tr>
              <tr><td>Listed position</td><td>{p.listed}</td></tr>
            </tbody></table>
          </Panel>
        </div>
      </div>
    </div>
  );
}
