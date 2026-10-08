import { Rng, type TeamRatings } from "@cfb/engine";
import { COUNTERS, OFF_CALLS, OFF_MIX, DEF_MIX, basePass, schemeDefMix, schemeOffMix, teamPass, type DefCall, type OffCall } from "./calls.ts";

export { basePass, teamPass };
import { mixSeed } from "./hash.ts";
import { SCHEMES, type TeamSchemes } from "./schemes.ts";
import { STAFF_HOURS } from "./staff.ts";

/**
 * Opponent scouting. Every week the staff spends some of its hours on film of the next opponent. What it
 * learns are that team's real tendencies: how often it runs or throws in each down and distance (the
 * engine's own pass tendencies, from its real play-calling), what its schemes lean on (the option keeps the
 * ball with the quarterback, a 3-3-5 blitzes), and who gets the ball. The more hours (and the better the
 * staff's scouting), the more of them it finds and the sharper its numbers.
 *
 * On game day the same knowledge tilts the coordinators' calls toward the counters (calls.ts Caller): a
 * defense that knows a team runs on 3rd and short loads the box there, an offense that knows a front
 * blitzes calls more screens. Every school scouts its opponents; the edge is in scouting more or better.
 */

/** Situations a report covers: [label, down, distance]. */
const SITUATIONS: [string, number, number][] = [
  ["1st and 10", 1, 10], ["2nd and long", 2, 9], ["2nd and medium", 2, 5], ["2nd and short", 2, 2],
  ["3rd and long", 3, 9], ["3rd and medium", 3, 6], ["3rd and short", 3, 3], ["3rd and inches", 3, 1],
];

/**
 * How well a staff knows an opponent, 0 to 1, from the hours it put into film (times its scouting skill's
 * worth an hour). An average staff at the usual split (24 hours a week) knows about half; a full week of
 * nothing else gets most of it.
 */
export const knowledge = (hours: number) => Math.round((1 - Math.exp(-Math.max(0, hours) / 35)) * 1000) / 1000;
/** What an hour of film is worth with a staff's scouting skill (1 for an average staff). */
export const filmEff = (scouting: number) => 0.6 + 0.8 * scouting / 100;
/** What every staff knows about any opponent before the week starts (old film, television), in film hours. */
export const BASE_FILM = 6;
/** Film hours in a usual week (the in-season split's opponent share). */
export const USUAL_FILM_HOURS = STAFF_HOURS * 0.15;

export interface Insight {
  id: string;
  side: "offense" | "defense" | "personnel";
  /** What the staff saw. */
  text: string;
  /** What it suggests doing about it (empty when nothing). */
  counter: string;
  /** How plain it is on film (0 to 1): the plainest are found first. */
  plain: number;
}

const DEF_LABEL: Record<DefCall, string> = {
  base: "base defense", load_box: "loading the box", blitz: "blitzing", cover2: "Cover 2", cover3: "Cover 3", man: "man press", prevent: "prevent",
};
const DEF_ADVICE: Partial<Record<DefCall, string>> = {
  load_box: "Stacking the box is the counter.", blitz: "Pressure is the counter: blitz more.", cover2: "Sit in Cover 2.", cover3: "Cover 3 takes it away.", man: "Man press can take it away.",
};
const OFF_ADVICE: Partial<Record<OffCall, string>> = {
  screen: "Screens punish it.", quick: "Get the ball out quick.", intermediate: "Attack the intermediate zones.", play_action: "Play-action works against it.",
  deep: "Take shots deep.", inside_run: "Run inside.", outside_run: "Get to the edge.", qb_run: "Use your quarterback's legs.",
};
const share = (rows: [string, number][], id: string) => { const t = rows.reduce((a, [, w]) => a + w, 0); return (rows.find(([c]) => c === id)?.[1] ?? 0) / t; };
const pct = (x: number) => `${Math.round(100 * x)}%`;
/** The opponent's own number, which a thin read blurs (marked for `insights`). */
const seen = (x: number) => `{${Math.round(100 * x)}}%`;

/** Every tendency there is to find on an opponent, plainest first (before knowledge decides which are found). */
export function tendencies(r: TeamRatings, sc: TeamSchemes): Insight[] {
  const out: Insight[] = [];
  // Down and distance: the three situations where this offense runs or throws most unlike other teams.
  const sits = SITUATIONS.map(([label, down, ytg]) => ({ label, down, ytg, p: teamPass(r, down, ytg), b: basePass(down, ytg) }))
    .filter((x) => Math.abs(x.p - x.b) >= 0.06).sort((x, y) => Math.abs(y.p - y.b) - Math.abs(x.p - x.b)).slice(0, 3);
  for (const { label, down, ytg, p, b } of sits) {
    const run = p < b;
    out.push({
      id: `sit:${down}:${ytg}`, side: "offense", plain: Math.min(1, Math.abs(p - b) / 0.2),
      text: run ? `Runs on ${seen(1 - p)} of ${label} (most teams ${pct(1 - b)}).` : `Throws on ${seen(p)} of ${label} (most teams ${pct(b)}).`,
      counter: run ? DEF_ADVICE.load_box! : "Play coverage there: Cover 2 or Cover 3 over loading the box.",
    });
  }
  // The offense's scheme: calls it leans on, and the defensive call that answers it best.
  const offS = SCHEMES[sc.off], om = schemeOffMix(sc.off);
  const best = (Object.entries(COUNTERS.def[sc.off]) as [DefCall, number][]).sort((a, b) => b[1] - a[1])[0];
  const worst = (Object.entries(COUNTERS.def[sc.off]) as [DefCall, number][]).sort((a, b) => a[1] - b[1])[0];
  for (const c of OFF_CALLS) {
    const kind = c.kind as "run" | "pass", a = share(om[kind], c.id), u = share(OFF_MIX[kind], c.id);
    if (a / u < 1.25 || a - u < 0.04) continue;
    const what = c.id === "qb_run" ? `the quarterback keeps it on ${seen(a)} of runs (most teams ${pct(u)})`
      : `${c.label.toLowerCase()} on ${seen(a)} of ${kind === "run" ? "runs" : "passes"} (most teams ${pct(u)})`;
    const first = !out.some((x) => x.id.startsWith("off:"));
    out.push({ id: `off:${c.id}`, side: "offense", plain: Math.min(1, (a - u) / 0.15), text: `${offS.name}: ${what}.`, counter: first && best && best[1] > 0.005 ? DEF_ADVICE[best[0]] ?? "" : "" });
  }
  if (worst && worst[1] < -0.02) {
    out.push({ id: `off:avoid:${worst[0]}`, side: "offense", plain: Math.min(1, -worst[1] / 0.05), text: `${offS.name} gashes ${DEF_LABEL[worst[0]]}.`, counter: `Go easy on ${DEF_LABEL[worst[0]]}.` });
  }
  // The front: what its coordinator calls more than most, and the offensive answer.
  const defS = SCHEMES[sc.def], dm = schemeDefMix(sc.def);
  for (const [d] of DEF_MIX) {
    const a = share(dm, d), u = share(DEF_MIX, d);
    if (a / u < 1.2 || a - u < 0.03) continue;
    const ans = (Object.entries(COUNTERS.off[sc.def]) as [OffCall, number][]).sort((x, y) => y[1] - x[1])[0];
    out.push({ id: `def:${d}`, side: "defense", plain: Math.min(1, (a - u) / 0.1), text: `${defS.name}: calls ${DEF_LABEL[d]} on ${seen(a)} of snaps (most teams ${pct(u)}).`,
      counter: ans && ans[1] > 0.005 ? OFF_ADVICE[ans[0]] ?? "" : "" });
  }
  // Who gets the ball.
  const lead = [...(r.rushers ?? [])].sort((a, b) => b.share - a.share)[0];
  if (lead && lead.share >= 30) out.push({ id: "who:carry", side: "personnel", plain: Math.min(1, lead.share / 60), text: `${lead.name} (${lead.pos}) gets ${seen(lead.share / 100)} of the carries.`, counter: "Make someone else beat you." });
  const tgt = [...(r.receivers ?? [])].sort((a, b) => b.share - a.share)[0];
  if (tgt && tgt.share >= 20) out.push({ id: "who:target", side: "personnel", plain: Math.min(1, tgt.share / 40), text: `${tgt.name} (${tgt.pos}) draws ${seen(tgt.share / 100)} of the targets.`, counter: "Shade coverage his way." });
  return out.sort((a, b) => b.plain - a.plain || a.id.localeCompare(b.id));
}

/**
 * What the staff has found with this much knowledge: plain tendencies need little film, subtle ones a lot.
 * Numbers in the text stay the true ones, but a thin read says "about" and can be a few points off.
 */
export function insights(all: Insight[], k: number, seed: number, gameId: number): Insight[] {
  const rng = new Rng(mixSeed(seed, gameId, "insights"));
  const found = all.filter((x) => k >= 0.15 + 0.75 * (1 - x.plain));
  return found.map((x) => ({
    ...x,
    text: x.text.replace(/\{(\d+)\}%/g, (_, n) => (k >= 0.8 ? `${n}%` : `about ${Math.max(1, Math.min(99, Math.round(Number(n) + (1 - k) * 8 * rng.gauss(0, 1))))}%`)),
  }));
}

