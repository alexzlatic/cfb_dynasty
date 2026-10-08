import { useState } from "react";
import { useLeague } from "../App.tsx";
import { api, type Settings } from "../api.ts";

const FIELDS: Record<number, number[]> = { 2: [0], 4: [0], 8: [0], 12: [4, 0], 16: [0], 24: [8] };

export function SettingsScreen() {
  const { id, state } = useLeague();
  const [s, setS] = useState<Settings>(state.settings);
  const [msg, setMsg] = useState<string | null>(null);
  const p = s.playoff;
  const setP = (patch: Partial<Settings["playoff"]>) => {
    const next = { ...p, ...patch };
    if (next.format === "playoff" && !FIELDS[next.teams]?.includes(next.byes)) next.byes = FIELDS[next.teams]?.[0] ?? 0;
    if (next.auto_bids > next.teams) next.auto_bids = next.teams;
    setS({ ...s, playoff: next });
  };
  const save = async () => {
    try { await api.act(id, "update_settings", s); setMsg("Saved."); } catch (e) { setMsg((e as Error).message); }
  };
  return (
    <div className="narrowish settings">
      <h2>League settings</h2>
      <section className="panel">
        <h3>Postseason</h3>
        <label>Format <select value={p.format} onChange={(e) => setP({ format: e.target.value as never })}>
          <option value="playoff">Playoff</option><option value="bcs">BCS title game</option><option value="bowls">Bowls only (AP champion)</option>
        </select></label>
        {p.format === "playoff" && <>
          <label>Teams <select value={p.teams} onChange={(e) => setP({ teams: Number(e.target.value) })}>{Object.keys(FIELDS).map((n) => <option key={n}>{n}</option>)}</select></label>
          <label>First-round byes <select value={p.byes} onChange={(e) => setP({ byes: Number(e.target.value) })}>{FIELDS[p.teams].map((n) => <option key={n}>{n}</option>)}</select></label>
          <label>Automatic bids for conference champions <input type="number" min={0} max={p.teams} value={p.auto_bids} onChange={(e) => setP({ auto_bids: Number(e.target.value) })} /></label>
          <label className="check"><input type="checkbox" checked={p.campus_first_round} onChange={(e) => setP({ campus_first_round: e.target.checked })} /> Early rounds on campus</label>
        </>}
        {p.format === "bowls" && <p className="muted">Bowl games are simulated from M1. Until then the season ends with the final AP poll.</p>}
        <label className="check"><input type="checkbox" checked={s.conf_title_games} onChange={(e) => setS({ ...s, conf_title_games: e.target.checked })} /> Conference championship games</label>
        <p className="muted small">Postseason changes take effect this season until selection day, and next season after that.</p>
      </section>
      <section className="panel">
        <h3>Polls</h3>
        <label>Voter bias (brand, homer, recency, unbeaten) <input type="range" min={0} max={2} step={0.1} value={s.poll_bias} onChange={(e) => setS({ ...s, poll_bias: Number(e.target.value) })} /> {s.poll_bias.toFixed(1)}×</label>
        <label>Ballot noise <input type="range" min={0} max={2} step={0.1} value={s.poll_noise} onChange={(e) => setS({ ...s, poll_noise: Number(e.target.value) })} /> {s.poll_noise.toFixed(1)}×</label>
      </section>
      <section className="panel">
        <h3>Games</h3>
        <label>Home-field points assumed by polls and power ratings <input type="number" step={0.5} value={s.home_field_points} onChange={(e) => setS({ ...s, home_field_points: Number(e.target.value) })} /></label>
        <label>Injuries <select value={s.injuries ?? 1} onChange={(e) => setS({ ...s, injuries: Number(e.target.value) })}>
          <option value={0}>Off</option><option value={0.5}>Fewer</option><option value={1}>Realistic</option><option value={1.5}>More</option>
        </select></label>
        <label>Keep play-by-play for <select value={s.keep_pbp} onChange={(e) => setS({ ...s, keep_pbp: e.target.value as never })}>
          <option value="mine">My games</option><option value="mine_and_ranked">My games, ranked matchups and the postseason</option><option value="all">Every game</option>
        </select></label>
      </section>
      <section className="panel">
        <h3>College sports rules</h3>
        <label className="check"><input type="checkbox" checked={!!s.pcsa} onChange={(e) => setS({ ...s, pcsa: e.target.checked })} /> Protect College Sports Act</label>
        <p className="muted small">The federal bill the Senate passed in September 2026, now waiting on the House. Each school may pay up to $22.5M a year above the
          revenue-share cap to players who have completed a season there, paid for with booster money that used to go through the collective, and NIL deals face a
          stricter fair-market-value test. Its other rules (one free transfer, five years to play four, no head coach leaving mid-season, conferences capped at 20)
          take effect when the transfer portal and coaching moves arrive. Changing this re-signs every roster, so it can only change before the season's first game.</p>
      </section>
      <button className="primary" onClick={save}>Save settings</button> {msg && <span className="muted">{msg}</span>}
    </div>
  );
}
