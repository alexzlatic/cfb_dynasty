import { useEffect, useRef, useState } from "react";
import { money } from "./util.tsx";

/**
 * Small SVG charts for the money screens: one value axis, thin rounded bars and 2px lines, a legend for two
 * or more series, and a hover tooltip per column. Series colors are the categorical slots in styles.css
 * (--series-1 to --series-3), in that fixed order; text stays in the ink colors.
 */
export interface Series {
  name: string;
  /** Categorical slot, 1 to 3. */
  slot: 1 | 2 | 3;
  kind: "bar" | "line";
  values: (number | null)[];
}

/** The container's width in pixels, so chart text stays at its real size at any width. */
function useWidth(): [React.RefObject<HTMLDivElement>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(Math.max(240, Math.round(el.clientWidth))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

const PAD = { l: 58, r: 14, t: 10, b: 26 };

/** Round axis ticks spanning the data (zero always included). */
function ticks(lo: number, hi: number, n = 4): number[] {
  const span = hi - lo || Math.abs(hi) || 1;
  const raw = span / n, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((k) => k * mag).find((s) => span / s <= n) ?? 10 * mag;
  const out: number[] = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step) out.push(Math.round(v * 1e6) / 1e6);
  if (out[out.length - 1] < hi) out.push(out[out.length - 1] + step);
  return out;
}

/**
 * Columns (grouped bars) and lines over the same labels. `faded` marks projected columns (lighter, dashed
 * lines); `marks` draws a labeled vertical rule at a column.
 */
export function Chart({ labels, series, height = 210, fmt = money, faded, marks, desc, yMin, yMax }: {
  labels: string[]; series: Series[]; height?: number; fmt?: (x: number) => string; faded?: (i: number) => boolean;
  marks?: { at: number; label: string }[]; desc: string; yMin?: number; yMax?: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const [ref, W] = useWidth();
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const tk = ticks(Math.min(0, yMin ?? Math.min(...all)), yMax ?? Math.max(0, ...all), yMax != null ? 5 : 4);
  const lo = tk[0], hi = tk[tk.length - 1];
  const H = height, ih = H - PAD.t - PAD.b, iw = W - PAD.l - PAD.r;
  const y = (v: number) => PAD.t + ih - ((v - lo) / (hi - lo || 1)) * ih;
  const band = iw / Math.max(1, labels.length), x = (i: number) => PAD.l + band * (i + 0.5);
  const bars = series.filter((s) => s.kind === "bar"), lines = series.filter((s) => s.kind === "line");
  const bw = Math.min(28, (band * 0.72) / Math.max(1, bars.length) - 2);
  // Show every label when they fit, otherwise every few.
  const every = Math.max(1, Math.ceil(labels.length / Math.floor(iw / 46)));
  return (
    <div className="chart" ref={ref}>
      {series.length > 1 && <div className="legend">{series.map((s) => <span key={s.name}><i className={`sw cs${s.slot} ${s.kind}`} />{s.name}</span>)}</div>}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={desc} onMouseLeave={() => setHover(null)}>
        {tk.map((t) => <g key={t}><line className={t === 0 ? "zero" : "gridline"} x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} />
          <text className="axis" x={PAD.l - 6} y={y(t) + 4} textAnchor="end">{fmt(t)}</text></g>)}
        {labels.map((l, i) => i % every === 0 && <text key={i} className="axis" x={x(i)} y={H - 8} textAnchor="middle">{l}</text>)}
        {hover != null && <rect className="hoverband" x={x(hover) - band / 2} y={PAD.t} width={band} height={ih} />}
        {bars.map((s, k) => s.values.map((v, i) => {
          if (v == null) return null;
          const bx = x(i) - (bars.length * (bw + 2)) / 2 + k * (bw + 2) + 1;
          const top = Math.min(y(v), y(0)), h = Math.max(1, Math.abs(y(v) - y(0)));
          return <rect key={`${s.name}${i}`} className={`bar cs${s.slot}${faded?.(i) ? " faded" : ""}`} x={bx} y={top} width={bw} height={h} rx={Math.min(4, bw / 2)} />;
        }))}
        {lines.map((s) => {
          const pts = s.values.map((v, i) => (v == null ? null : [x(i), y(v)] as const));
          const seg = (from: number, to: number) => pts.slice(from, to + 1).filter((p): p is readonly [number, number] => !!p).map((p) => p.join(",")).join(" ");
          const cut = faded ? labels.findIndex((_, i) => faded(i)) : -1;
          return <g key={s.name}>
            <polyline className={`line cs${s.slot}`} points={seg(0, cut < 0 ? labels.length : Math.max(0, cut - 1))} />
            {cut >= 0 && <polyline className={`line cs${s.slot} dashed`} points={seg(Math.max(0, cut - 1), labels.length)} />}
            {pts.map((p, i) => p && <circle key={i} className={`dot cs${s.slot}`} cx={p[0]} cy={p[1]} r={hover === i ? 5 : 3.5} />)}
          </g>;
        })}
        {marks?.map((m) => <g key={m.label}><line className="mark" x1={x(m.at)} x2={x(m.at)} y1={PAD.t} y2={PAD.t + ih} />
          <text className="marklabel" x={x(m.at) + (m.at > labels.length / 2 ? -4 : 4)} y={PAD.t + 10} textAnchor={m.at > labels.length / 2 ? "end" : "start"}>{m.label}</text></g>)}
        {labels.map((_, i) => <rect key={i} className="hit" x={x(i) - band / 2} y={0} width={band} height={H} onMouseEnter={() => setHover(i)} />)}
      </svg>
      {hover != null && (
        <div className="tip" style={{ left: `${(x(hover) / W) * 100}%` }}>
          <b>{labels[hover]}{faded?.(hover) ? " (projected)" : ""}</b>
          {series.map((s) => s.values[hover] != null && <div key={s.name}><i className={`sw cs${s.slot} ${s.kind}`} />{s.name} <span className="num">{fmt(s.values[hover]!)}</span></div>)}
        </div>
      )}
    </div>
  );
}

/** Horizontal bars for the parts of a whole (budget lines), each with its value and share. */
export function HBars({ rows, slot, fmt = money, total, highlight }: {
  rows: { label: React.ReactNode; value: number; key: string }[]; slot: 1 | 2 | 3; fmt?: (x: number) => string; total?: number; highlight?: string;
}) {
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  const sum = total ?? rows.reduce((a, r) => a + r.value, 0);
  return (
    <div className="hbars">
      {rows.map((r) => (
        <div key={r.key} className={"hbar" + (highlight === r.key ? " mine" : "")} title={`${fmt(r.value)} (${sum ? Math.round((r.value / sum) * 100) : 0}%)`}>
          <span className="lbl">{r.label}</span>
          <span className="track"><span className={`fill cs${slot}`} style={{ width: `${(Math.abs(r.value) / max) * 100}%` }} /></span>
          <span className="num">{fmt(r.value)}</span>
          <span className="num muted small pct">{sum ? `${Math.round((r.value / sum) * 100)}%` : ""}</span>
        </div>
      ))}
    </div>
  );
}

/** A headline number with a short label and an optional note under it. */
export function Stat({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: React.ReactNode; tone?: "win" | "loss" }) {
  return <div className="stat"><div className="small muted">{label}</div><div className={"big " + (tone ?? "")}>{value}</div>{note && <div className="small muted">{note}</div>}</div>;
}
