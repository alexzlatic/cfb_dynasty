import { useMemo, useState } from "react";
import { ATTR_LABELS, ATTRS, fromZ, type Pos } from "@cfb/core/players";
import { useData, useLeague } from "../App.tsx";
import { api, type DepthChart, type GameRow, type Injury, type RatedPlayer } from "../api.ts";
import { Dial, DualBar } from "./ratings.tsx";
import { Logo, heightStr, onColor, shortDate } from "../util.tsx";
import { GameLine, Panel } from "./common.tsx";
import { FutureTab, WatchChip } from "./Retention.tsx";
import { PortalCard } from "./Portal.tsx";

export const POS_ORDER: Pos[] = ["QB", "RB", "WR", "TE", "OL", "DE", "DT", "LB", "CB", "S", "K", "P", "LS"];
const CLASS_ORDER = ["FR", "SO", "JR", "SR"];
const FOCUS_LABEL: Record<string, string> = { technique: "Technique", strength: "Strength and speed", film: "Film study", leadership: "Leadership" };
const sgn = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)}`;

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

/** When an injured player is back: "out for the season" or "back Oct 17". */
export const outUntil = (i: Injury) => (i.days >= 90 ? "out for the season" : `back ${shortDate(i.back)}`);

/** A red OUT tag with the injury and return date on hover. */
export function InjuryTag({ i }: { i: Injury | undefined | null }) {
  if (!i) return null;
  return <span className="inj" title={`${i.type}, ${outUntil(i)}`}>OUT</span>;
}

export const playerLink = (league: string, p: { id: number; first: string; last: string }) => <a href={`#/l/${league}/player/${p.id}`}>{p.first} {p.last}</a>;

/** Which depth chart slots a player holds, e.g. "QB" or "CB2 (2)". */
export function slotsOf(depth: DepthChart, id: number): string[] {
  return Object.entries(depth).flatMap(([s, ids]) => (ids ?? []).map((x, i) => (x === id ? (i ? `${s} (${i + 1})` : s) : null))).filter((x): x is string => !!x);
}

export function RosterTable({ players, depth, injuries = [] }: { players: RatedPlayer[]; depth: DepthChart; injuries?: Injury[] }) {
  const { id } = useLeague();
  const hurt = useMemo(() => new Map(injuries.map((i) => [i.pid, i])), [injuries]);
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
              <td className="num muted">{p.jersey ?? ""}</td><td>{playerLink(id, p)} <InjuryTag i={hurt.get(p.id)} /></td><td>{p.pos}</td><td><Rating v={p.ovr} /></td>
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
  ["rush_yds", "Rush yds"], ["rush_td", "TD"], ["rec", "Rec"], ["rec_yds", "Rec yds"], ["rec_td", "TD"], ["fgm", "FGM"], ["fga", "FGA"],
  ["tkl", "Tkl"], ["tfl", "TFL"], ["sacks", "Sacks"], ["def_int", "Int"], ["pd", "PD"], ["ff", "FF"]];

const AWARD_LABEL: Record<string, string> = {
  heisman: "Heisman Trophy winner", heisman_finalist: "Heisman finalist", all_american: "All-American", potw_off: "National offensive player of the week",
  potw_def: "National defensive player of the week", conf_potw_off: "Offensive player of the week", conf_potw_def: "Defensive player of the week",
  conf_poy_off: "Offensive player of the year", conf_poy_def: "Defensive player of the year",
};

/** A player's page, laid out like OOTP's: a header card, then tabs for ratings, stats and his background. */
export function PlayerPage({ pid, tab: initial }: { pid: number; tab?: string }) {
  const { id, state } = useLeague();
  const data = useData(() => api.player(id, pid), [pid]);
  const [tab, setTab] = useState<"ratings" | "stats" | "bio" | "future">(initial === "future" ? "future" : "ratings");
  if (!data) return <p className="muted">Loading...</p>;
  const { player: p, team: t, log, injury, potential } = data;
  const mine = t.id === state.user_team_id;
  // Each rating's potential: he grows about evenly toward his potential overall (as the staff reads it).
  const room = Math.max(0, potential.est - p.ovr);
  return (
    <div>
      <div className="hero" style={{ ["--c1" as string]: t.color, ["--c2" as string]: t.alt_color, color: onColor(t.color) }}>
        <div className="jersey">{p.jersey ?? p.pos}</div>
        <Logo team={t} size={84} />
        <div className="who">
          <div className="kicker">{p.pos} · {p.class}{data.redshirt ? " (redshirt)" : ""} · <a href={`#/l/${id}/team/${t.id}`} style={{ color: "inherit" }}>{t.school} {t.mascot}</a></div>
          <h1>{p.first} {p.last}</h1>
          <div className="bio">{[heightStr(p.height), p.weight ? `${p.weight} lb` : null, [p.home.city, p.home.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</div>
          <div className="chips">
            {data.slots.length > 0 && <span className="chip">{data.slots.join(", ")}</span>}
            {p.stars ? <span className="chip">{"★".repeat(p.stars)} recruit{p.natl_rank ? `, No. ${p.natl_rank}` : ""}</span> : null}
            {injury && <span className="chip bad">Injured: {injury.type}, {outUntil(injury)}</span>}
            {data.awards.some((a) => a.type === "heisman") && <span className="chip gold">Heisman winner</span>}
            {data.future && !data.portal && !data.future.watch.leaving && <a href={`#/l/${id}/player/${p.id}/future`} onClick={() => setTab("future")}><WatchChip w={data.future.watch} hero /></a>}
            {data.portal && <span className="chip bad">{data.portal.status === "open" ? "In the transfer portal" : data.portal.status === "committed" ? "Transferring" : "Left the portal unsigned"}</span>}
          </div>
        </div>
        <div className="dials">
          <Dial v={p.ovr} label="Overall" />
          <Dial v={potential.est} label="Potential" range={[potential.lo, potential.hi]} faded />
        </div>
      </div>
      <div className="pagetabs">
        <button className={tab === "ratings" ? "on" : ""} onClick={() => setTab("ratings")}>Ratings</button>
        <button className={tab === "stats" ? "on" : ""} onClick={() => setTab("stats")}>Stats ({log.length} games)</button>
        <button className={tab === "bio" ? "on" : ""} onClick={() => setTab("bio")}>Background</button>
        {data.future && !data.portal && <button className={tab === "future" ? "on" : ""} onClick={() => setTab("future")}>Future {data.future.watch.watch !== "settled" && !data.future.watch.leaving ? <span className={`dot w-${data.future.watch.watch}`} /> : null}</button>}
        {data.portal && <button className={tab === "future" ? "on" : ""} onClick={() => setTab("future")}>Portal</button>}
      </div>
      {tab === "ratings" && (
        <div className="cols">
          <Panel title="Ratings" right={<span className="small muted">now / potential</span>}>
            {ATTRS[p.pos].map((a) => <DualBar key={a} label={ATTR_LABELS[a]} now={p.attrs[a]} pot={Math.min(99, p.attrs[a] + room)} />)}
            <p className="muted small">{p.basis === "stats" ? `Rated from ${p.sample} ${p.pos === "QB" ? "attempts" : "plays"} of college stats plus recruiting.` : "Rated mostly from recruiting and experience (little college playing time)."}
              {" "}Potential is {mine ? "your staff's read (it knows its own players well)" : "what scouts see from outside the program, a wider guess"}.</p>
          </Panel>
          <div>
            <Panel title="Traits">
              <DualBar label="Stamina" now={p.traits.stamina} />
              <DualBar label="Toughness" now={p.traits.toughness} />
              <DualBar label="Discipline" now={p.traits.discipline} />
              {/* Injury proneness is stored 0-99 around 50; shown the other way up, on the ratings scale. */}
              <DualBar label="Durability" now={fromZ(-(p.traits.injury - 50) / 15)} />
              {p.tend.scramble != null && <p className="small">Scrambles on {(p.tend.scramble * 100).toFixed(0)}% of dropbacks.</p>}
            </Panel>
            {data.staff && data.staff.focus && (
              <Panel title="Your staff's read" right={<a href={`#/l/${id}/development`}>Development</a>}>
                <table className="grid tight"><tbody>
                  <tr><td>Working on</td><td>{FOCUS_LABEL[data.staff.focus.area]}{data.staff.plan ? " (his plan)" : " (staff's choice)"}{data.staff.focus.attrs.length > 0 && <div className="muted small">{data.staff.focus.attrs.map((a) => `${a.label} ${a.value}`).join(", ")}</div>}</td></tr>
                  <tr><td>Gained this {data.staff.phase === "offseason" ? "offseason" : data.staff.phase === "camp" ? "camp" : "season"}</td><td className={"num " + (data.staff.gained! - data.staff.by_now! >= 0.5 ? "win" : data.staff.gained! - data.staff.by_now! <= -0.5 ? "loss" : "")}>{sgn(data.staff.gained!)} <span className="muted small">of {sgn(data.staff.target!)} planned</span></td></tr>
                  <tr><td>Gained this year</td><td className="num">{sgn(data.staff.so_far!)}</td></tr>
                  <tr><td>Leadership</td><td className="num">{data.staff.leadership}</td></tr>
                  <tr><td>Adaptability</td><td className="num">{data.staff.adaptability}</td></tr>
                </tbody></table>
                <p className="muted small">Overall points, your staff's read. His listed rating (what scouts see) moves up at the rollover.</p>
              </Panel>
            )}
            {data.redshirt && <p className="small">Redshirting: {data.season?.gp ?? 0} of {data.redshirt_games} games played.</p>}
          </div>
        </div>
      )}
      {tab === "stats" && <GameLog log={log} />}
      {tab === "future" && (data.portal ? <PortalCard row={data.portal} /> : data.future && <FutureTab f={data.future} />)}
      {tab === "bio" && (
        <div className="cols even">
          <Panel title="Background">
            <table className="grid tight"><tbody>
              <tr><td>Recruiting</td><td>{p.stars ? `${"★".repeat(p.stars)} (${p.composite?.toFixed(4)})` : "Unranked"}{p.natl_rank ? `, #${p.natl_rank} nationally` : ""}</td></tr>
              <tr><td>Seasons in college</td><td>{Math.floor(p.years)}</td></tr>
              <tr><td>Listed position</td><td>{p.listed}</td></tr>
              <tr><td>Hometown</td><td>{[p.home.city, p.home.state].filter(Boolean).join(", ") || "Unknown"}</td></tr>
            </tbody></table>
          </Panel>
          <div>
            {data.awards.length > 0 && (
              <Panel title="Honors">
                <table className="grid tight"><tbody>{data.awards.map((a, i) => (
                  <tr key={i}><td className="nowrap">{shortDate(a.date)}</td><td>{AWARD_LABEL[a.type]}{a.conference && a.type.startsWith("conf") ? ` (${a.conference})` : ""}{a.team ? `, ${a.team === 1 ? "first" : "second"} team` : ""}
                    <div className="small muted">{a.line}</div></td></tr>
                ))}</tbody></table>
              </Panel>
            )}
            <Panel title="Injuries">
              {data.injuries.length ? <table className="grid tight"><tbody>{data.injuries.map((i) => (
                <tr key={`${i.game_id}`}><td>{shortDate(i.date)}</td><td>{i.type}</td><td className="muted">{i.days ? `${i.days >= 90 ? "season" : `${Math.round(i.days / 7) || 1} wk`}` : "rest of game"}</td></tr>
              ))}</tbody></table> : <p className="muted">None this season.</p>}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

function GameLog({ log }: { log: { game: GameRow; line: Record<string, number>; snaps: number }[] }) {
  const cols = STAT_COLS.filter(([k]) => log.some((g) => g.line[k]));
  const snaps = log.reduce((a, g) => a + g.snaps, 0);
  const tot: Record<string, number> = {};
  for (const g of log) for (const [k] of cols) tot[k] = (tot[k] ?? 0) + (g.line[k] ?? 0);
  return (
    <Panel title={`Game log (${log.length})`}>
      {!log.length ? <p className="muted">No stats yet.</p> : (
        <div className="scrollx"><table className="grid tight">
          <thead><tr><th>Game</th>{snaps > 0 && <th className="num" title="Snaps played">Snaps</th>}{cols.map(([k, l]) => <th key={k} className="num">{l}</th>)}</tr></thead>
          <tbody>
            {log.map(({ game, line, snaps: n }) => (
              <tr key={game.id}><td><GameLine g={game} showDate /></td>{snaps > 0 && <td className="num">{n || ""}</td>}{cols.map(([k]) => <td key={k} className="num">{line[k] ?? ""}</td>)}</tr>
            ))}
            <tr className="total"><td>Season</td>{snaps > 0 && <td className="num">{snaps}</td>}{cols.map(([k]) => <td key={k} className="num">{tot[k]}</td>)}</tr>
          </tbody>
        </table></div>
      )}
    </Panel>
  );
}
