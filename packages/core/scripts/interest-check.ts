/**
 * Recruit interest checks (docs/recruiting.md, "Interest"): how committed prospects rate their own school,
 * how spread out uncommitted prospects' interest starts, and how often commitments flip.
 *
 *   npx tsx packages/core/scripts/interest-check.ts [league seed]
 */
import { loadSeed, Season, starsOf, type Prospect } from "../src/index.ts";

const leagueSeed = Number(process.argv[2] || 7);
const seed = loadSeed();
const season = Season.create(seed, { seed: leagueSeed, settings: { keep_pbp: "none" } as never });
const pct = (a: number, b: number) => +(100 * a / Math.max(1, b)).toFixed(1);
const q = (xs: number[], f: number) => { const s = [...xs].sort((a, b) => a - b); return +(s[Math.round(f * (s.length - 1))] ?? NaN).toFixed(3); };

function snapshot(label: string) {
  const st = season.state.recruiting!, year = season.state.year;
  const seniors = st.prospects.filter((p) => p.cls === year + 1 && p.svc && p.svc.rank <= 1500);
  const com = seniors.filter((p) => p.commit && !p.commit.signed), open = seniors.filter((p) => !p.commit);
  const mineShare: number[] = [], mineFirst: number[] = [];
  for (const p of com) {
    const c = season.considering(p);
    const i = c.findIndex((x) => x.team === p.commit!.team);
    mineShare.push(i >= 0 ? c[i].share : 0); mineFirst.push(i === 0 ? 1 : 0);
  }
  const lead: number[] = [], gap: number[] = [];
  for (const p of open.slice(0, 1200)) {
    const c = season.considering(p);
    if (c.length < 2) continue;
    lead.push(c[0].share); gap.push(c[0].share - c[1].share);
  }
  const juniors = st.prospects.filter((p) => p.cls === year + 2 && p.svc && p.svc.rank <= 500 && !p.commit).map((p) => season.considering(p)).filter((c) => c.length >= 2);
  console.log(JSON.stringify({
    at: label, date: season.state.date, committed_seniors: com.length,
    "committed: own school share p10/50/90": [q(mineShare, 0.1), q(mineShare, 0.5), q(mineShare, 0.9)],
    "committed: own school 1st %": pct(mineFirst.filter(Boolean).length, mineFirst.length),
    "committed: own school 70%+ %": pct(mineShare.filter((x) => x >= 0.7).length, mineShare.length),
    "open seniors: leader share p10/50/90": [q(lead, 0.1), q(lead, 0.5), q(lead, 0.9)],
    "open seniors: leader 50%+ %": pct(lead.filter((x) => x >= 0.5).length, lead.length),
    "open juniors: leader share p10/50/90": [q(juniors.map((c) => c[0].share), 0.1), q(juniors.map((c) => c[0].share), 0.5), q(juniors.map((c) => c[0].share), 0.9)],
  }));
}

snapshot("start");
let flips = 0, commits = 0;
const flipped = new Set<number>();
const first = new Map<number, number>();
for (const p of season.state.recruiting!.prospects) if (p.commit && p.cls === season.state.year + 1) first.set(p.id, p.commit.team);
const report = new Set(["-10-15", "-12-01"]);
while (!season.done) {
  const rep = season.advanceDay() as unknown as { news?: { headline?: string }[] } | undefined;
  void rep;
  for (const p of season.state.recruiting!.prospects) {
    if (p.cls !== season.state.year + 1) continue;
    const f = first.get(p.id);
    if (!p.commit) { if (f != null && !flipped.has(p.id)) { flipped.add(p.id); flips++; } continue; }
    if (f == null) { first.set(p.id, p.commit.team); commits++; }
    else if (f !== p.commit.team && !flipped.has(p.id)) { flipped.add(p.id); flips++; }
  }
  if ([...report].some((s) => season.state.date.endsWith(s))) snapshot(season.state.date);
  if (season.state.date.endsWith("-12-01")) break;
}
const st = season.state.recruiting!, year = season.state.year;
const P4 = new Set(["SEC", "Big Ten", "ACC", "Big 12"]);
const p4 = new Set(seed.teams.filter((t) => t.level === "fbs" && (P4.has(t.conference) || t.school === "Notre Dame")).map((t) => t.id));
const com = st.prospects.filter((p: Prospect) => p.cls === year + 1 && first.has(p.id) && p.svc);
const by = (f: (p: Prospect) => boolean) => { const xs = com.filter(f); return [xs.filter((p) => flipped.has(p.id)).length, xs.length]; };
console.log(JSON.stringify({
  "flipped or decommitted (ever) of committed seniors by Dec 1": pct(com.filter((p) => flipped.has(p.id)).length, com.length),
  "... first committed to a power program (real 18.8%)": by((p) => p4.has(first.get(p.id)!)),
  "5*/4*/3* flipped": [by((p) => starsOf(p.svc!.r) === 5), by((p) => starsOf(p.svc!.r) === 4), by((p) => starsOf(p.svc!.r) === 3)],
}));
