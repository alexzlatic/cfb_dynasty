import { Season, loadSeed, schemeRating, schemeLayout, SCHEMES } from "../src/index.ts";
/** Prints the inferred schemes: counts by level and a few well-known programs to eyeball. */
const seed = loadSeed();
const s = Season.create(seed, { seed: 1 });
const all = s.allSchemes();
const count = (lv: string) => {
  const c: Record<string, number> = {};
  for (const t of s.teams.filter((x) => x.level === lv)) { const sc = all[t.id]; c[sc.off] = (c[sc.off] ?? 0) + 1; c[sc.def] = (c[sc.def] ?? 0) + 1; }
  return c;
};
console.log("FBS", count("fbs"));
console.log("FCS", count("fcs"));
for (const name of process.argv.slice(2)) {
  const t = s.teams.find((x) => x.school === name);
  if (!t) continue;
  const sc = s.schemes(t.id);
  console.log(name, sc.off, `(${sc.off_coach})`, sc.def, `(${sc.def_coach})`);
}
const t = s.teams.find((x) => x.school === (process.argv[2] ?? "Navy"))!;
const sc = s.schemes(t.id);
for (const side of [sc.off, sc.def]) for (const { slot, role } of schemeLayout(side)) {
  const id = s.depthChart(t.id)[slot]?.[0];
  const p = s.playerById.get(id!);
  if (!p) continue;
  const r = schemeRating(p, side, slot);
  console.log(SCHEMES[side].name.padEnd(12), role.label.padEnd(30), p.pos, `${p.first} ${p.last}`.padEnd(22), p.ovr, r.rating, r.fit >= 0 ? `+${r.fit}` : r.fit);
}
