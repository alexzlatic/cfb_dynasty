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
    campus early rounds configurable), a BCS title game, or bowls only with an AP champion (bowl games
    arrive in M1). The default is the current 12-team format.
- **Server** (`packages/server`): one authoritative game server. Every change is an action appended to
  the league's log and pushed to every open client over a WebSocket; re-running the log from the seed
  reproduces the season exactly.
- **Client** (`packages/client`): React screens for the new league, home, calendar, schedule, standings,
  polls (with every writer's ballot), postseason, writers, news, team and game pages, and settings.
- **Importer** (`importer/`): builds `data/seed/2026wk1/` from CFBD. Team strength is as of Aug 24,
  2026, from the backtest's preseason prior; no 2026 result feeds the sim.

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
python3 reference/make_fixtures.py   # regenerate parity fixtures from the Python engine
```

Rebuilding the seed needs CFBD access (`CFBD_API_KEY`, or a proxy that injects it):

```sh
python3 importer/build_team_ratings.py --cfb-sim <path to cfb-sim> --work /tmp/cutoff
python3 importer/build_seed.py
npm run seed:power
```
