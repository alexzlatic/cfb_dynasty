# CFB Dynasty

An OOTP-style college football management game built on the CFB Sim play-by-play engine. You run a
real program through a real season, one day at a time: the 2026 FBS and FCS world from
CollegeFootballData, a daily calendar from Aug 24, 2026 through the national championship, and every
game played snap by snap by the engine.

This is milestone **M0 (foundation)**: no player ratings, play calling, recruiting or money yet. See
the plan doc for the roadmap (M1 ratings and one playable season, M1.5 online leagues, M2 money, M3
talent pipeline, M4 staff and careers, M5 per-snap matchups).

## Play it

Node 22.13 or newer. Once, from the game folder:

```sh
npm install
npm run install-app
```

That adds a **CFB Dynasty** app (macOS: `~/Applications`, so it shows in Spotlight and Launchpad and can
be dragged to the Dock; Windows: a desktop and Start menu shortcut; Linux: the applications menu).
Opening it pulls the latest code from `main`, starts the game server in the background if it is not
already running and opens the game in its own window (a Chrome, Edge or Brave app window when one is
installed, otherwise your default browser). The start screen has a **Continue** button for the league
you played last. The server shuts itself down 20 minutes after the last game window closes, or right
away with **Quit game** on the start screen.

Saved leagues are SQLite files in `~/Documents/CFB Dynasty/leagues` (one per league), outside the code
folder, so updates never touch them. Leagues saved in the old `leagues/` folder are copied there on
first start. Logs are in `~/Documents/CFB Dynasty/logs`.

`npm run play` does the same as the app from a terminal. For development:

```sh
npm start            # builds the client and serves http://localhost:8787
npm run dev          # server with reload on :8787 plus Vite on :5173
```

Open the same league in two windows and sim a day in one: the other updates live.

## What's in M0

- **Engine** (`packages/engine`): TypeScript port of the Python engine. A shared seeded generator
  (sfc32) makes the port reproduce the Python engine play for play; `fixtures/engine/parity.json` holds
  60 Python games the tests replay. Games are steppable: the engine asks a decision provider at each
  snap, 4th down, play call, two-point try, onside kick and kneel-down, with today's logic as the default.
- **Season core** (`packages/core`): the daily calendar (morning events, actions, day processing,
  evening games), conference title games, polls, the postseason and news.
  - **Polls** are ballots, not a sort of true strength. The AP poll is 86 beat writers (one per Power 4
    team and Notre Dame, two or three per smaller conference, three national columnists), each with a
    voting style (homer, brand loyalist, recency chaser, numbers person, contrarian, steady hand) and a
    lean toward the team and conference they cover. Writers file a story on their beat every week.
    The coaches poll and the CFP committee are separate panels.
  - **Postseason format** is a setting: a 2, 4, 8, 12, 16 or 24-team playoff (automatic bids, byes and
    campus early rounds configurable), a BCS title game, or bowls only with an AP champion. The default
    is the current 12-team format.
  - **Bowls** (`packages/core/src/bowls.ts`): the 2025-26 slate of 35 bowls plus whichever New Year's
    Six bowls the playoff leaves free, filled on selection day by conference tie-in from teams with six
    wins (one may be over an FCS team) and a .500 record, best first; 5-7 teams fill only what is left.
- **Server** (`packages/server`): one authoritative game server. Every change is an action appended to
  the league's log and pushed to every open client over a WebSocket; re-running the log from the seed
  reproduces the season exactly.
- **Client** (`packages/client`): React screens for the new league, home, calendar, schedule, standings,
  polls (with every writer's ballot), postseason, writers, news, team and game pages, and settings.
- **Importer** (`importer/`): builds `data/seed/2026wk1/` from CFBD. Team strength is as of Aug 24,
  2026, from the backtest's preseason prior; no 2026 result feeds the sim.

## M1 so far: rated players

- **Players** (`packages/core/src/players.ts`): every player on the 2026 FBS and FCS rosters has 3 to 7
  position attributes on a 0 to 99 scale (75 = median FBS starter, 8 points = one standard deviation),
  plus stamina, injury proneness, toughness, discipline, hidden potential and work ethic, and
  tendencies (QB scramble rate, carry and target shares). Overall is for display only.
- **Rating real players** (`npm run seed:players`, `packages/core/scripts/rate-players.ts`): a recruiting
  prior (composite within the class, seasons on the field), 2025 stats with 2024 at half weight
  (standardized against regulars at the position, discounted for Group of Five and FCS), shrunk by
  sample size, then each team anchored to its preseason strength: the starters' unit ratings move (by at
  most 0.9 SD) toward what the team's measured rates need, and the rest stays as the team's scheme
  offset. Writes `data/seed/2026wk1/players.json` (ratings only; identity stays in `rosters.json`).
  Depth charts open with each team's real starting QB from its first 2026 game.
- **Ratings compiler** (`packages/core/src/compiler.ts`): the depth chart's players become the engine's
  unit rates, named runners and receivers, scramble rate and kicking. With every player at 75 it returns
  the FBS rates; with each team's seed depth chart it returns that team's preseason ratings exactly, so
  the season plays at the same strength as M0 while injuries and depth-chart changes now matter.
- **Play calling** (`packages/core/src/calls.ts`, `live.ts`): play your game live from the Game day tab. Call 8
  offensive plays and 7 defenses yourself, or let your coordinators call them and stop you at key moments
  (4th downs, two-point tries, two-minute drills, late defensive stands, overtime, injuries). Each call
  against each defense shifts the snap's odds through an engine `SnapMod` that draws nothing extra from
  the RNG; the coordinators' mix averages out to the calibrated engine (`scripts/calls-check.ts`). Your
  calls are saved as a `call_game` action, so the season replays the game exactly.
- **Game day** (`packages/core/src/gameday.ts`): players tire as they play (by position and stamina) and
  recover on the sideline; a tired player plays up to 0.3 SD below his ratings until the coach rotates in
  the next player on the depth chart, so defensive linemen play about 60% of snaps and quarterbacks and
  linemen nearly all. Players get hurt (by position, with ball carriers most exposed, scaled by injury
  proneness); the backup takes over, and injuries run from a few snaps to the season, healing faster for
  tough players. Starters sit in blowouts. Injuries carry across the season, skip the player in every
  depth chart until he is back, and show on the roster, depth chart, player and game screens. The
  Injuries setting turns them off or up and down. Injuries draw from their own random stream, so the
  engine's draws are unchanged.
- **Checks**: `npm run check:seasons` sims full seasons and counts FBS players reaching real season marks;
  `npx tsx packages/core/scripts/gameday-check.ts` reports snap shares, injury rates and scoring.

## Data notes

- Logos are fetched from the CFBD CDN by the server and cached in `.logo-cache/`; they are not in the
  repository. Without network access the server draws a badge in the team's colors.
- FCS rosters are the real CFBD 2026 rosters; FCS head coaches are generated.
- Coordinators were researched from each team's 2026 season page (`importer/coordinators_2026.csv`,
  with a source link per team); gaps get generated names in M1.
- 2027 recruiting commitments are as of the October 2026 pull, not Aug 24.
- Writers' names and outlets are made up.

## Checks

```sh
npm run typecheck
npm test                 # parity, calibration, full season, replay, sync, postseason formats, polls
npm run bench            # speed gate
npm run results:check    # Aug 24 strength vs real Weeks 1-6 scores
npm run replay:2025      # M1 gate: sim the 2025 regular season 100 times from the Aug 2025 seed vs real scores
python3 reference/make_fixtures.py   # regenerate parity fixtures from the Python engine
```

Rebuilding the seed needs CFBD access (`CFBD_API_KEY`, or a proxy that injects it):

```sh
python3 importer/build_team_ratings.py --cfb-sim <path to cfb-sim> --work /tmp/cutoff
python3 importer/build_seed.py
python3 importer/build_finances.py   # home crowds, and Knight-Newhouse football finances if importer/.cache/knight_newhouse.csv exists
npm run seed:power
```

The 2025 replay bundle (`data/seed/2025wk1/`, no recruiting class or history) is built the same way with
the season passed to each step:

```sh
python3 importer/build_team_ratings.py --cfb-sim <path to cfb-sim> --year 2025 --out data/seed/2025wk1/team_ratings.json
python3 importer/build_seed.py --season 2025 --replay
python3 importer/build_finances.py --season 2025
npm run seed:players -- 2025
npm run seed:power -- 400 2025
```
