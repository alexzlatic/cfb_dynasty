# Working on CFB Dynasty

- TypeScript runs through `tsx`; there is no build step except the client (`vite build`). Typecheck with
  `npm run typecheck`, test with `npm test`.
- `reference/cfb_sim/` is a copy of the Python engine from the cfb-sim project, synced whenever its
  CHANGES.md logs an engine change. The only local edit is the optional `rng` argument to `GameSim`.
  After syncing, regenerate `fixtures/engine/parity.json` with `python3 reference/make_fixtures.py`
  and port the change to `packages/engine/src/engine.ts` until the parity test passes again.
- Keep RNG draw order identical between `engine.ts` and `engine.py`. Decision suggestions are computed
  before the engine yields, so a provider that returns the suggestion changes nothing.
- Every league change goes through `League.apply` (an action in the log). Anything random in the season
  must draw from a stream seeded by `mixSeed(league seed, ...)` so replays match.
- League schema changes are new entries at the end of `MIGRATIONS` in `packages/server/src/db.ts`;
  never edit an existing migration.
- Never commit the CFBD API key or team logos.
