"""The random-number generator shared with the TypeScript engine (packages/engine/src/rng.ts).

sfc32 seeded through splitmix32, plus the exact sampling algorithms the TypeScript engine uses, so a
GameSim built with SharedRng(seed) plays the same game, snap for snap, as the TypeScript engine with
the same seed. Python's own random.Random stays the default for research and backtests.
"""
from __future__ import annotations

import math
import random

M32 = 0xFFFFFFFF


def _imul(a: int, b: int) -> int:
    return (a * b) & M32


class SharedRng(random.Random):
    def __init__(self, seed: int = 0):
        self._seed_value = seed
        super().__init__(seed)

    def seed(self, a=None, version=2):  # noqa: D102 - called by random.Random.__init__
        x = (int(a or 0)) & M32
        st = []
        for _ in range(4):
            x = (x + 0x9E3779B9) & M32
            z = x
            z = _imul(z ^ (z >> 16), 0x21F0AAAD)
            z = _imul(z ^ (z >> 15), 0x735A2D97)
            z = (z ^ (z >> 15)) & M32
            st.append(z)
        self._a, self._b, self._c, self._d = st
        self.gauss_next = None
        for _ in range(12):
            self.random()

    def getstate(self):
        return (self._a, self._b, self._c, self._d, self.gauss_next)

    def setstate(self, state):
        self._a, self._b, self._c, self._d, self.gauss_next = state

    def random(self) -> float:
        a, b, c, d = self._a, self._b, self._c, self._d
        t = (a + b) & M32
        a = b ^ (b >> 9)
        b = (c + (c << 3)) & M32
        c = ((c << 21) | (c >> 11)) & M32
        d = (d + 1) & M32
        t = (t + d) & M32
        c = (c + t) & M32
        self._a, self._b, self._c, self._d = a, b, c, d
        return t / 4294967296.0

    # gauss, expovariate and uniform: random.Random's own algorithms already match rng.ts.

    def gammavariate(self, alpha: float, beta: float) -> float:
        """Marsaglia-Tsang (alpha >= 1), as in rng.ts; Python's built-in uses a different algorithm."""
        d = alpha - 1 / 3
        c = 1 / math.sqrt(9 * d)
        while True:
            while True:
                x = self.gauss(0, 1)
                v = 1 + c * x
                if v > 0:
                    break
            v = v * v * v
            u = self.random()
            if u < 1 - 0.0331 * x ** 4 or math.log(u) < 0.5 * x * x + d * (1 - v + math.log(v)):
                return d * v * beta
