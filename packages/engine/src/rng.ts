/**
 * Seeded random numbers shared with the Python reference engine (reference/cfb_sim/shared_rng.py).
 *
 * sfc32 seeded through splitmix32. The sampling methods use the same algorithms as Python's
 * random.Random (gauss, expovariate, uniform) except gammavariate, which both sides implement as
 * Marsaglia-Tsang. Same seed in, same draws out, in both languages.
 */
export class Rng {
  private a = 0;
  private b = 0;
  private c = 0;
  private d = 0;
  private gaussNext: number | null = null;

  constructor(seed: number = 0) {
    let x = seed >>> 0;
    const st: number[] = [];
    for (let i = 0; i < 4; i++) {
      x = (x + 0x9e3779b9) >>> 0;
      let z = x;
      z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
      z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
      z = (z ^ (z >>> 15)) >>> 0;
      st.push(z);
    }
    [this.a, this.b, this.c, this.d] = st as [number, number, number, number];
    for (let i = 0; i < 12; i++) this.random();
  }

  /** Snapshot for save files; restore with Rng.fromState. */
  state(): [number, number, number, number, number | null] {
    return [this.a, this.b, this.c, this.d, this.gaussNext];
  }

  static fromState(s: [number, number, number, number, number | null]): Rng {
    const r = new Rng(0);
    [r.a, r.b, r.c, r.d, r.gaussNext] = s;
    return r;
  }

  random(): number {
    let { a, b, c, d } = this;
    let t = (a + b) >>> 0;
    a = (b ^ (b >>> 9)) >>> 0;
    b = (c + (c << 3)) >>> 0;
    c = ((c << 21) | (c >>> 11)) >>> 0;
    d = (d + 1) >>> 0;
    t = (t + d) >>> 0;
    c = (c + t) >>> 0;
    this.a = a; this.b = b; this.c = c; this.d = d;
    return t / 4294967296;
  }

  uniform(lo: number, hi: number): number {
    return lo + (hi - lo) * this.random();
  }

  gauss(mu: number, sigma: number): number {
    let z = this.gaussNext;
    this.gaussNext = null;
    if (z === null) {
      const x2pi = this.random() * 2 * Math.PI;
      const g2rad = Math.sqrt(-2 * Math.log(1 - this.random()));
      z = Math.cos(x2pi) * g2rad;
      this.gaussNext = Math.sin(x2pi) * g2rad;
    }
    return mu + z * sigma;
  }

  expovariate(lambd: number): number {
    return -Math.log(1 - this.random()) / lambd;
  }

  /** Marsaglia-Tsang; the engine only uses alpha >= 1 (1.35 and 1.6). */
  gammavariate(alpha: number, beta: number): number {
    const d = alpha - 1 / 3;
    const c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x: number;
      let v: number;
      do {
        x = this.gauss(0, 1);
        v = 1 + c * x;
      } while (v <= 0);
      v = v * v * v;
      const u = this.random();
      if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * beta;
    }
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.random() * n);
  }
}
