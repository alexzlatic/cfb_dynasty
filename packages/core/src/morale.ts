import type { Unit } from "./hidden.ts";

/**
 * Player morale from pay and playing time (M2). Each player compares his pay (revenue share and NIL)
 * with what's fair at his school: his value times what the school pays for value across the roster. A
 * starter paid well below that loses morale; a backup paid like a starter at his position sours the
 * room if he isn't playing; a player whose value says he should start and doesn't sits unhappy.
 * Morale moves a little each week (players remember: it will matter when the portal opens), and the
 * starters' morale moves their unit's chemistry: at the extremes about a point a game for the team.
 */

export interface MoodInput {
  id: number; pos: string; unit: Unit | null; value: number; pay: number;
  /** In the depth chart's starting lineup. */
  starter: boolean;
  /** His value ranks among the starters' worth at his position, so he expects to start. */
  expects_start: boolean;
}

/** This week's mood for each player (about -2 to +0.5), and the room effect by unit. */
export function moods(roster: MoodInput[]): { mood: Map<number, number>; room: Record<Unit, number> } {
  const paid = roster.filter((p) => p.value > 0);
  const totalValue = paid.reduce((a, p) => a + p.value, 0), totalPay = paid.reduce((a, p) => a + p.pay, 0);
  const norm = totalValue > 0 ? totalPay / totalValue : 0;
  const mood = new Map<number, number>();
  const room: Record<Unit, number> = { off: 0, def: 0 };
  // What starters at each position are paid (the median), for backups paid like starters.
  const starterPay = new Map<string, number[]>();
  for (const p of roster) if (p.starter) starterPay.set(p.pos, [...(starterPay.get(p.pos) ?? []), p.pay]);
  const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
  for (const p of roster) {
    let m = 0;
    if (p.value > 0 && norm > 0) {
      const r = Math.max(0.05, p.pay / (p.value * norm));
      m += p.starter ? Math.max(-1.5, Math.min(0.5, Math.log(r))) : 0.5 * Math.max(-1, Math.min(0.3, Math.log(r)));
    }
    if (p.expects_start && !p.starter) m -= 0.8;
    mood.set(p.id, Math.round(m * 100) / 100);
    const sp = starterPay.get(p.pos);
    if (!p.starter && p.unit && sp?.length && p.pay > 0) {
      const over = p.pay / Math.max(1, median(sp)) - 1;
      if (over > 0) room[p.unit] -= Math.min(1, 0.3 * over);
    }
  }
  return { mood, room };
}

/** A unit's chemistry change in points of margin: its starters' average morale and the room, capped. */
export function unitMood(starters: number[], room: number): number {
  const avg = starters.length ? starters.reduce((a, b) => a + b, 0) / starters.length : 0;
  return Math.max(-0.6, Math.min(0.4, 0.5 * avg + 0.25 * room));
}

/** Words for a player's morale. */
export function moodWord(m: number): string {
  return m >= 0.25 ? "Happy" : m > -0.25 ? "Content" : m > -0.8 ? "Unhappy" : "Angry";
}
