import type { Game, Team } from "./types.ts";

export interface Record3 { w: number; l: number; cw: number; cl: number }

export function records(games: Game[], teams: Team[]): Map<number, Record3> {
  const conf = new Map(teams.map((t) => [t.id, t.conference]));
  const out = new Map<number, Record3>(teams.map((t) => [t.id, { w: 0, l: 0, cw: 0, cl: 0 }]));
  for (const g of games) {
    if (g.status !== "final") continue;
    const homeWon = g.home_score! > g.away_score!;
    const confGame = g.kind === "regular" && g.conference_game && conf.get(g.home_id) === conf.get(g.away_id);
    for (const [id, won] of [[g.home_id, homeWon], [g.away_id, !homeWon]] as const) {
      const r = out.get(id);
      if (!r) continue;
      if (won) { r.w++; if (confGame) r.cw++; } else { r.l++; if (confGame) r.cl++; }
    }
  }
  return out;
}

/**
 * Poll score: 0.6 x current power (expected margin vs an average team) plus a resume in which each
 * win is worth 3 and each loss -4.5, both adjusted by 0.1 x the opponent's power, so early polls
 * follow strength and late polls follow who you beat. Tuned in M1 against real final polls.
 */
export function resumes(games: Game[], power: Record<number, number>): Map<number, number> {
  const out = new Map<number, number>();
  for (const g of games) {
    if (g.status !== "final") continue;
    const homeWon = g.home_score! > g.away_score!;
    for (const [id, opp, won] of [[g.home_id, g.away_id, homeWon], [g.away_id, g.home_id, !homeWon]] as const) {
      const v = (won ? 3 : -4.5) + 0.1 * (power[opp] ?? 0);
      out.set(id, (out.get(id) ?? 0) + v);
    }
  }
  return out;
}

export function rankTeams(teams: Team[], games: Game[], power: Record<number, number>, champs: Set<number> = new Set()) {
  const res = resumes(games, power);
  return teams
    .filter((t) => t.level === "fbs")
    .map((t) => ({ team_id: t.id, points: Math.round(((power[t.id] ?? 0) * 0.6 + (res.get(t.id) ?? 0) + (champs.has(t.id) ? 4 : 0)) * 10) / 10 }))
    .sort((a, b) => b.points - a.points || a.team_id - b.team_id);
}

/** Elo-style power update after a game, in points; margins are capped so blowouts do not dominate. */
export function updatePower(power: Record<number, number>, g: Game, hfa: number, k = 0.08): void {
  const exp = (power[g.home_id] ?? 0) - (power[g.away_id] ?? 0) + (g.neutral ? 0 : hfa);
  const act = Math.max(-28, Math.min(28, g.home_score! - g.away_score!));
  const d = k * (act - exp);
  power[g.home_id] = Math.round(((power[g.home_id] ?? 0) + d) * 100) / 100;
  power[g.away_id] = Math.round(((power[g.away_id] ?? 0) - d) * 100) / 100;
}
