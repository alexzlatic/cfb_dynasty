/** Team and player stat books (port of reference/cfb_sim/boxscore.py). */

export const TEAM_FIELDS = [
  "plays", "first_downs", "penalty_first_downs", "rush_att", "rush_yards", "pass_att",
  "completions", "pass_yards", "sacks_taken", "sack_yards", "sacks", "ints_thrown", "turnovers", "takeaways",
  "third_att", "third_conv", "fourth_att", "fourth_conv", "red_zone_trips", "red_zone_tds", "penalties",
  "penalty_yards", "punts", "punt_yards", "fga", "fgm", "xpa", "xpm", "two_pt_att", "two_pt_made", "tds",
  "return_tds", "def_tds", "kick_return_yards", "punt_return_yards", "explosive", "success", "top_seconds",
] as const;

export type TeamField = (typeof TEAM_FIELDS)[number];
export type TeamStats = Record<TeamField, number>;

export function newTeamStats(): TeamStats {
  const s = {} as TeamStats;
  for (const f of TEAM_FIELDS) s[f] = 0;
  return s;
}

export interface TeamBox extends TeamStats {
  net_pass_yards: number;
  total_yards: number;
  scrimmage_plays: number;
  ypp: number;
  success_rate: number;
}

export function teamDerived(s: TeamStats): TeamBox {
  const net = s.pass_yards - s.sack_yards;
  const total = s.rush_yards + net;
  const sp = s.rush_att + s.pass_att + s.sacks_taken;
  return {
    ...s, net_pass_yards: net, total_yards: total, scrimmage_plays: sp,
    ypp: Math.round((total / Math.max(1, sp)) * 100) / 100,
    success_rate: Math.round((s.success / Math.max(1, sp)) * 1000) / 1000,
  };
}

export type PlayerLine = Partial<Record<
  "car" | "rush_yds" | "rush_td" | "rush_long" | "att" | "cmp" | "pass_yds" | "pass_td" | "int" | "sacked" |
  "tgt" | "rec" | "rec_yds" | "rec_td" | "rec_long" | "fum_lost" | "fga" | "fgm" | "fg_long" | "xpa" | "xpm",
  number>>;

export class PlayerBook {
  readonly p = new Map<string, PlayerLine>();

  private row(name: string): PlayerLine {
    let r = this.p.get(name);
    if (!r) { r = {}; this.p.set(name, r); }
    return r;
  }
  private inc(r: PlayerLine, k: keyof PlayerLine, v: number) { r[k] = (r[k] || 0) + v; }

  rush(name: string, yds: number, td: boolean) {
    const r = this.row(name);
    this.inc(r, "car", 1); this.inc(r, "rush_yds", yds); this.inc(r, "rush_td", +td);
    r.rush_long = Math.max(r.rush_long || 0, yds);
  }
  pass(name: string, comp: boolean, yds: number, td: boolean, intc: boolean) {
    const r = this.row(name);
    this.inc(r, "att", 1); this.inc(r, "cmp", +comp); this.inc(r, "pass_yds", yds);
    this.inc(r, "pass_td", +td); this.inc(r, "int", +intc);
  }
  sacked(name: string) { this.inc(this.row(name), "sacked", 1); }
  target(name: string) { this.inc(this.row(name), "tgt", 1); }
  catch(name: string, yds: number, td: boolean) {
    const r = this.row(name);
    this.inc(r, "tgt", 1); this.inc(r, "rec", 1); this.inc(r, "rec_yds", yds); this.inc(r, "rec_td", +td);
    r.rec_long = Math.max(r.rec_long || 0, yds);
  }
  fumble(name: string) { this.inc(this.row(name), "fum_lost", 1); }
  /** Called once per attempt with made=false, then again with made=true when it is good (as in boxscore.py). */
  kick(name: string, dist: number, made: boolean) {
    const r = this.row(name);
    if (made) { this.inc(r, "fgm", 1); r.fg_long = Math.max(r.fg_long || 0, dist); } else this.inc(r, "fga", 1);
  }
  pat(name: string, made: boolean) { const r = this.row(name); this.inc(r, "xpa", 1); this.inc(r, "xpm", +made); }

  toJSON(): Record<string, PlayerLine> {
    const o: Record<string, PlayerLine> = {};
    for (const [k, v] of this.p) o[k] = { ...v };
    return o;
  }
}
