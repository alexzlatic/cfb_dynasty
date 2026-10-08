/** Rating pieces shared by player and prospect pages: overlaid current and potential bars, stars and dials. */

export const tierOf = (v: number) => (v >= 90 ? "r-elite" : v >= 82 ? "r-great" : v >= 74 ? "r-good" : v >= 66 ? "r-ok" : "r-low");

/** Half stars from 1/2 to 5, OOTP style: about 40 is half a star, 75 three, 95 five. */
export function Stars({ v, label }: { v: number; label?: string }) {
  const n = Math.max(0.5, Math.min(5, Math.round(((v - 35) / 12) * 2) / 2));
  return (
    <span className="stars" title={`${label ? label + ": " : ""}${n} stars (${v})`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={n >= i ? "full" : n >= i - 0.5 ? "half" : "empty"}>★</span>)}
    </span>
  );
}

/** A ring dial for a headline number (overall or potential), with an optional range under it. */
export function Dial({ v, label, range, faded = false }: { v: number; label: string; range?: [number, number]; faded?: boolean }) {
  const r = 26, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, (v - 20) / 79));
  return (
    <div className={"dial t-" + tierOf(v) + (faded ? " faded" : "")}>
      <svg viewBox="0 0 64 64" width="72" height="72">
        <circle cx="32" cy="32" r={r} className="ring-bg" />
        <circle cx="32" cy="32" r={r} className="ring" strokeDasharray={`${c * f} ${c}`} transform="rotate(-90 32 32)" />
        <text x="32" y="38" textAnchor="middle">{v}</text>
      </svg>
      <div className="dlabel">{label}</div>
      {range && <div className="drange">{range[0]}-{range[1]}</div>}
      <Stars v={v} label={label} />
    </div>
  );
}

/**
 * One rating as a bar: what he is now (solid) and where your staff thinks he'll get to (the lighter part
 * beyond it), with both numbers.
 */
export function DualBar({ label, now, pot }: { label: string; now: number; pot?: number }) {
  const w = (x: number) => `${Math.max(2, ((x - 20) / 79) * 100)}%`;
  return (
    <div className="dual">
      <span className="lbl">{label}</span>
      <span className="track">
        {pot != null && pot > now && <span className={"pot " + tierOf(pot)} style={{ width: w(pot) }} />}
        <span className={"now " + tierOf(now)} style={{ width: w(now) }} />
      </span>
      <span className="nums"><b>{now}</b>{pot != null && <span className="muted"> / {pot}</span>}</span>
    </div>
  );
}

/** Colored stars for a recruit (the service's 2 to 5). */
export const recruitStars = (n: number | null | undefined) => (n ? <span className={`rstars s${n}`}>{"★".repeat(n)}</span> : <span className="muted small">NR</span>);
