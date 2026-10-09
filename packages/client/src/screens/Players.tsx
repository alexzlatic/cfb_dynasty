import React, { useMemo, useState } from "react";
import { useSort, type Col } from "../sort.tsx";
import { StatsTable, catsWith, sumLines } from "../stats.tsx";
import { ATTR_LABELS, ATTRS, fromZ, type Pos } from "@cfb/core/players";
import { useData, useLeague } from "../App.tsx";
import { api, type DepthChart, type GameRow, type Injury, type PersonaView, type PlayerSeason, type RatedPlayer, type Eligibility } from "../api.ts";
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
export const ratingTier = (v: number) => (v >= 90 ? "r-elite" : v >= 82 ? "r-great" : v >= 74 ? "r-good" : v >= 66 ? "r-ok" : "r-low");

export function Rating({ v, big = false }: { v: number; big?: boolean }) {
  return <span className={`rating ${ratingTier(v)}${big ? " big" : ""}`}>{v}</span>;
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

/** His personality, OOTP-style: his class and its traits (his own once you've talked with him; his class's typical ones until then). */
export function PersonaPanel({ v, talkable = false }: { v: PersonaView; talkable?: boolean }) {
  return (
    <Panel title="Personality" right={<span className="chip persona flat">{v.name}</span>}>
      <p className="small">{v.label}.</p>
      <table className="grid tight"><tbody>{v.traits.map((t) => (
        <tr key={t.factor}><td>{t.label}</td><td className={"num " + (t.level === "High" ? "win" : t.level === "Low" ? "loss" : "muted")}>{t.level}</td></tr>
      ))}</tbody></table>
      <p className="small muted">{v.known ? "What you've learned talking with him." : `Typical for a ${v.name.toLowerCase()}.${talkable ? " Talk with him to learn his own." : " Everyone in his class weighs these a little differently."}`}</p>
    </Panel>
  );
}

/** Which depth chart slots a player holds, e.g. "QB" or "CB2 (2)". */
export function slotsOf(depth: DepthChart, id: number): string[] {
  return Object.entries(depth).flatMap(([s, ids]) => (ids ?? []).map((x, i) => (x === id ? (i ? `${s} (${i + 1})` : s) : null))).filter((x): x is string => !!x);
}

export function RosterTable({ players, depth, injuries = [], personas = {} }: { players: RatedPlayer[]; depth: DepthChart; injuries?: Injury[]; personas?: Record<number, string> }) {
  const { id } = useLeague();
  const hurt = useMemo(() => new Map(injuries.map((i) => [i.pid, i])), [injuries]);
  const [pos, setPos] = useState<Pos | "ALL">("ALL");
  const starters = useMemo(() => new Set(Object.values(depth).map((ids) => ids?.[0])), [depth]);
  // By position (starters first) until a column header is clicked.
  const filtered = useMemo(() => players.filter((p) => pos === "ALL" || p.pos === pos).sort((a, b) =>
    POS_ORDER.indexOf(a.pos) - POS_ORDER.indexOf(b.pos) || +starters.has(b.id) - +starters.has(a.id) || b.ovr - a.ovr), [players, pos, starters]);
  const attrs = pos === "ALL" ? [] : ATTRS[pos];
  const { rows, th } = useSort(filtered, {
    jersey: (p) => p.jersey, name: (p) => `${p.last} ${p.first}`, pos: (p) => POS_ORDER.indexOf(p.pos), ovr: (p) => p.ovr, class: (p) => CLASS_ORDER.indexOf(p.class),
    ht: (p) => p.height, wt: (p) => p.weight, stars: (p) => p.stars, persona: (p) => personas[p.id], depth: (p) => slotsOf(depth, p.id)[0],
    ...Object.fromEntries(attrs.map((a) => [a, (p: RatedPlayer) => p.attrs[a]])),
  }, { asc: ["jersey", "pos", "class"] });
  return (
    <>
      <div className="filters">
        {(["ALL", ...POS_ORDER] as const).map((x) => <button key={x} className={pos === x ? "on" : ""} onClick={() => setPos(x)}>{x === "ALL" ? "All" : x}</button>)}
        <span className="small muted">Click a column to sort.</span>
      </div>
      <div className="scrollx">
        <table className="grid tight roster">
          <thead><tr>{th("jersey", "#")}{th("name", "Name")}{th("pos", "Pos")}{th("ovr", "Ovr")}{th("class", "Class")}{th("ht", "Ht")}{th("wt", "Wt")}{th("stars", "Rec", { title: "Recruiting stars" })}{th("persona", "Personality")}
            {attrs.map((a) => <React.Fragment key={a}>{th(a, abbr(a), { title: ATTR_LABELS[a] })}</React.Fragment>)}{th("depth", "Depth")}</tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id} className={starters.has(p.id) ? "starter" : ""}>
              <td className="num muted">{p.jersey ?? ""}</td><td>{playerLink(id, p)} <InjuryTag i={hurt.get(p.id)} /></td><td>{p.pos}</td><td><Rating v={p.ovr} /></td>
              <td>{p.class}</td><td>{heightStr(p.height)}</td><td>{p.weight ?? ""}</td><td className="muted">{p.stars ? "★".repeat(p.stars) : ""}</td><td className="small">{personas[p.id] ?? ""}</td>
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
const ordinal = (n: number) => `${n}${n === 1 ? "st" : n === 2 ? "nd" : n === 3 ? "rd" : "th"}`;
/** "2 years of eligibility left", "Final year of eligibility" */
const eligShort = (e: Eligibility) => (e.left <= 1 ? (e.fifth ? "Final year, a fifth possible" : "Final year of eligibility") : `${e.left} years of eligibility left`);
/** Further along in college than his class says: he has sat out a season (a redshirt). */
const CLASS_YEAR: Record<string, number> = { FR: 0, SO: 1, JR: 2, SR: 3 };
const redshirted = (p: { class: string; years: number }) => p.class in CLASS_YEAR && Math.floor(p.years) > CLASS_YEAR[p.class];
const eligNote = (e: Eligibility) => (e.left <= 1
  ? (e.fifth ? "His fourth season; some players stay for a fifth (a redshirt year)." : "His last season of college football.")
  : `This season and ${e.left - 1} more${e.fifth ? ", plus a possible fifth year" : ""}.`);

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
          <div className="kicker">{p.pos} · {redshirted(p) ? "RS " : ""}{p.class}{data.redshirt ? " (redshirt)" : ""} · <a href={`#/l/${id}/team/${t.id}`} style={{ color: "inherit" }}>{t.school} {t.mascot}</a></div>
          <h1>{p.first} {p.last}</h1>
          <div className="bio">{[heightStr(p.height), p.weight ? `${p.weight} lb` : null, [p.home.city, p.home.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ")}</div>
          <div className="chips">
            {data.slots.length > 0 && <span className="chip">{data.slots.join(", ")}</span>}
            <span className="chip" title={data.persona.label}>{data.persona.name}</span>
            <span className="chip" title={eligNote(data.eligibility)}>{eligShort(data.eligibility)}</span>
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
      {tab === "stats" && <>
        <CareerStats rows={[...data.career, ...(data.season ? [{ ...data.season, year: state.year }] : [])]} />
        <GameLog log={log} />
      </>}
      {tab === "future" && (data.portal ? <PortalCard row={data.portal} /> : data.future && <FutureTab f={data.future} />)}
      {tab === "bio" && (
        <div className="cols even">
          <div>
          <Panel title="Background">
            <table className="grid tight"><tbody>
              <tr><td>Recruiting</td><td>{p.stars ? `${"★".repeat(p.stars)} (${p.composite?.toFixed(4)})` : "Unranked"}{p.natl_rank ? `, #${p.natl_rank} nationally` : ""}</td></tr>
              <tr><td>Season in college</td><td>{ordinal(data.eligibility.year)}{redshirted(p) ? ` (redshirt ${p.class === "FR" ? "freshman" : p.class === "SO" ? "sophomore" : p.class === "JR" ? "junior" : "senior"})` : ""}</td></tr>
              <tr><td>Eligibility</td><td>{eligShort(data.eligibility)}<div className="small muted">{eligNote(data.eligibility)}</div></td></tr>
              <tr><td>Listed position</td><td>{p.listed}</td></tr>
              <tr><td>Hometown</td><td>{[p.home.city, p.home.state].filter(Boolean).join(", ") || "Unknown"}</td></tr>
            </tbody></table>
          </Panel>
          <PersonaPanel v={data.persona} talkable={mine} />
          </div>
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

type CareerRow = PlayerSeason & { year: number; total?: boolean };

/** Season by season, every category he has a line in, with his career totals at the bottom. */
function CareerStats({ rows }: { rows: CareerRow[] }) {
  const { id, team } = useLeague();
  const [perGame, setPerGame] = useState(false);
  const all = useMemo(() => rows.length > 1 ? [...rows, { ...(sumLines(rows) as PlayerSeason), team_id: -1, year: 0, total: true }] : rows, [rows]);
  // Scrimmage repeats rushing for a player with no catches.
  const cats = catsWith(rows).filter((c) => c.key !== "scrimmage" || rows.some((r) => r.rec));
  if (!cats.length) return null;
  const lead: Col<CareerRow>[] = [
    { key: "year", label: "Season", cell: (r) => (r.total ? <b>Career</b> : r.year), by: (r) => (r.total ? null : r.year), asc: true },
    { key: "team", label: "Team", cell: (r) => (r.total ? "" : <a className="nowrap" href={`#/l/${id}/team/${r.team_id}`}><Logo team={team(r.team_id)} size={16} /> {team(r.team_id)?.abbr}</a>) },
  ];
  return (
    <Panel title="Season by season" right={<span className="seg small" style={{ marginBottom: 0 }}><button className={!perGame ? "on" : ""} onClick={() => setPerGame(false)}>Totals</button><button className={perGame ? "on" : ""} onClick={() => setPerGame(true)}>Per game</button></span>}>
      {cats.map((c) => <div key={c.key}><h4>{c.label}</h4>
        <StatsTable rows={all} line={(r) => r} cat={c} lead={lead} rowKey={(r) => (r.total ? "total" : `${r.year}-${r.team_id}`)} rowClass={(r) => (r.total ? "total" : undefined)} rank={false} keepOrder perGame={perGame} /></div>)}
    </Panel>
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
