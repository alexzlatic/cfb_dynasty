/**
 * Team ratings and the offense-vs-defense matchup blend (port of reference/cfb_sim/ratings.py).
 *
 * Rates are sack-adjusted: rushing excludes sacks and the sack rate is per dropback.
 */

export interface UnitRates {
  rush_ypc: number;
  rush_explosive: number;
  rush_stuff: number;
  comp_pct: number;
  yds_per_comp: number;
  sack_rate: number;
  int_rate: number;
  fumble_lost_rate: number;
  third_down_bonus: number;
}

export interface PlayerShare {
  name: string;
  pos: string;
  /** carry share (runners) or target share (receivers) */
  share: number;
  catch_mult?: number;
  ypc_mult?: number;
}

export interface TeamRatings {
  name: string;
  abbr: string;
  offense: UnitRates;
  defense: UnitRates;
  plays_per_game: number;
  pass_rate: number;
  penalty_rate: number;
  fg_skill: number;
  punt_gross: number;
  kick_touchback: number;
  kick_return_avg: number;
  punt_return_avg: number;
  aggressiveness: number;
  scramble_rate: number;
  scramble_scale: number;
  pass_tendency: Record<string, number>;
  qb: string;
  kicker: string;
  punter: string;
  rushers: PlayerShare[];
  receivers: PlayerShare[];
  notes?: string;
}

/** FBS-wide baseline (roughly 2023-2025 averages, sack-adjusted). */
export const LEAGUE: UnitRates = {
  rush_ypc: 4.8, rush_explosive: 0.105, rush_stuff: 0.17, comp_pct: 0.62, yds_per_comp: 11.8,
  sack_rate: 0.065, int_rate: 0.023, fumble_lost_rate: 0.007, third_down_bonus: 0.0,
};
export const LEAGUE_PLAYS_PER_GAME = 69.0;
export const LEAGUE_PASS_RATE = 0.42;
export const LEAGUE_PENALTY_RATE = 0.042;

/** A league-average team, for calibration checks and as a template. */
export function averageTeam(name = "Average", abbr = "AVG"): TeamRatings {
  return {
    name, abbr, offense: { ...LEAGUE }, defense: { ...LEAGUE },
    plays_per_game: LEAGUE_PLAYS_PER_GAME, pass_rate: LEAGUE_PASS_RATE, penalty_rate: LEAGUE_PENALTY_RATE,
    fg_skill: 0, punt_gross: 43, kick_touchback: 0.55, kick_return_avg: 21, punt_return_avg: 8,
    aggressiveness: 0, scramble_rate: 0, scramble_scale: 0, pass_tendency: {},
    qb: "QB1", kicker: "K", punter: "P", rushers: [], receivers: [],
  };
}

export interface Matchup extends UnitRates {}

const logit = (p: number) => { p = Math.min(Math.max(p, 1e-4), 1 - 1e-4); return Math.log(p / (1 - p)); };
const invLogit = (x: number) => 1 / (1 + Math.exp(-x));
const blendRate = (o: number, d: number, lg: number) => invLogit(logit(o) + logit(d) - logit(lg));
const blendYards = (o: number, d: number, lg: number) => o * d / lg;

/** homeEdge is a multiplicative yardage bump for the home offense (negative for the visitor). */
export function buildMatchup(offense: TeamRatings, defense: TeamRatings, homeEdge = 0): Matchup {
  const o = offense.offense, d = defense.defense, lg = LEAGUE, m = 1 + homeEdge;
  return {
    rush_ypc: blendYards(o.rush_ypc, d.rush_ypc, lg.rush_ypc) * m,
    rush_explosive: blendRate(o.rush_explosive, d.rush_explosive, lg.rush_explosive),
    rush_stuff: blendRate(o.rush_stuff, d.rush_stuff, lg.rush_stuff),
    comp_pct: Math.min(0.85, blendRate(o.comp_pct, d.comp_pct, lg.comp_pct) * (1 + homeEdge / 2)),
    yds_per_comp: blendYards(o.yds_per_comp, d.yds_per_comp, lg.yds_per_comp) * m,
    sack_rate: blendRate(o.sack_rate, d.sack_rate, lg.sack_rate) * (1 - homeEdge),
    int_rate: blendRate(o.int_rate, d.int_rate, lg.int_rate) * (1 - homeEdge),
    fumble_lost_rate: blendRate(o.fumble_lost_rate, d.fumble_lost_rate, lg.fumble_lost_rate),
    third_down_bonus: (o.third_down_bonus || 0) - (d.third_down_bonus || 0),
  };
}
