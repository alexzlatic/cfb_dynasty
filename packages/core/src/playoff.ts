import type { PlayoffSettings } from "./types.ts";

/**
 * Bracket shapes for any supported field: `teams` seeds, the top `byes` skip the opening round.
 * The opening round pairs the non-bye seeds high against low; each winner takes the higher seed's
 * slot, and slots then meet in a fixed bracket (1 v 8, 4 v 5, 3 v 6, 2 v 7 for eight slots), with
 * no reseeding, as the CFP does.
 */
export const VALID_FIELDS: { teams: number; byes: number[] }[] = [
  { teams: 2, byes: [0] }, { teams: 4, byes: [0] }, { teams: 8, byes: [0] }, { teams: 12, byes: [4, 0] },
  { teams: 16, byes: [0] }, { teams: 24, byes: [8] },
];

export function validatePlayoff(p: PlayoffSettings): string | null {
  if (p.format !== "playoff") return null;
  const f = VALID_FIELDS.find((x) => x.teams === p.teams);
  if (!f) return `field size must be one of ${VALID_FIELDS.map((x) => x.teams).join(", ")}`;
  if (!f.byes.includes(p.byes)) return `a ${p.teams}-team field supports ${f.byes.join(" or ")} byes`;
  if (p.auto_bids < 0 || p.auto_bids > p.teams) return "automatic bids must be between 0 and the field size";
  return null;
}

/** Slots after the opening round (a power of two). */
export function slotCount(teams: number, byes: number): number {
  if (byes === 0) return teams;
  return byes + (teams - byes) / 2;
}

/** Opening-round pairs as [higher seed, lower seed]; empty when the field is already a power of two with no byes. */
export function openingPairs(teams: number, byes: number): [number, number][] {
  if (byes === 0) return [];
  const out: [number, number][] = [];
  for (let hi = byes + 1, lo = teams; hi < lo; hi++, lo--) out.push([hi, lo]);
  return out;
}

/** Standard bracket order for n slots, e.g. 8 -> [1, 8, 4, 5, 2, 7, 3, 6]; adjacent pairs meet. */
export function bracketOrder(n: number): number[] {
  let order = [1];
  while (order.length < n) {
    const m = order.length * 2;
    order = order.flatMap((s) => [s, m + 1 - s]);
  }
  return order;
}

/** Number of rounds after the opening round. */
export function mainRounds(teams: number, byes: number): number {
  return Math.round(Math.log2(slotCount(teams, byes)));
}
