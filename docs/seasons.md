# Seasons and the rollover (M3 step 2)

A dynasty now runs past one season. When the season ends (the "Season complete" day, the day after
national signing day in early February),
the next sim starts the next season. In the app the sim bar shows **Start the 2027 season**.

## What happens at the rollover

`Season.nextSeason` (packages/core/src/season.ts) and `rollRosters` (packages/core/src/rollover.ts):

- **Players leave.** Anyone who has played five seasons leaves. After four seasons a player stays for a
  fifth when he still has a redshirt year, more likely the better he is against his own roster.
  Players rated 82 and up after their third or fourth season may turn pro; the higher the rating, the
  likelier. (Placeholder until the NFL draft step.)
- **Everyone else develops.** Each player gains what a year in college adds on average (3, 2, 3, 2 and
  1.5 points by year, from how each class rates above the one before it on the 2026 rosters at every
  level), faster at schools with better weight rooms, practice fields and medical facilities, plus the
  hidden development he actually had last season (hidden.ts). Past his potential, growth slows.
- **Rosters are refilled.** Each team goes back to its usual size, never over 105. The least-rated
  players at over-full positions are released first, then freshmen fill the positions furthest below
  their share. The freshmen are the school's signees (docs/recruiting.md), rated from their true
  potential on arrival; generated freshmen (rated like the team's own 2026 freshmen at each position)
  fill only the spots its class left open.
- **The schedule repeats** with home and away swapped, a year later on the same weekday (the season
  opens between August 22 and 28). Neutral-site games stay put.
- **Preseason power** follows the rosters: 70% last preseason's, 30% how the year actually went, then
  moved by how much the new rosters change each team's compiled ratings (a ridge fit of the engine's
  power on compiled ratings, R² 0.996).
- **Carried over:** facilities (and finished upgrades), the AD's projects, players' morale, the
  writers, your multi-year contracts and your career (job security carries; the AD sets new
  expectations). **Started fresh:** budgets, everyone else's revenue-share deals, collectives,
  hidden camp scores, injuries, depth charts and redshirts.
- **Coaching changes.** Until the coaching carousel (M4), about one program in five gets a new head
  coach each year (2026 had 35 of 138 FBS), of unknown quality; a new staff swings how the roster fits
  its scheme, so those programs are the least predictable. The news reports each change.

## The record book and the league file

Each finished season is summarized in `past` (champion, final top 25, conference champions, the
Heisman, every FBS record and yours). Last season's games, calendar, polls and news stay in the league
file under their year (migration 4 adds a `season` column; this season's rows have none).

## Drift gate

`npx tsx packages/core/scripts/drift.ts [seasons] [seed]` plays a dynasty with no user team and prints
team-strength spread, the P4 vs Group of Five gap, top-25 turnover and starter ratings each season.

First 20-season run (seed 7, no user team), season 1 vs the average of the last five:

| | season 1 | last 5 | gate (±10%) |
|---|---|---|---|
| Power spread (SD) | 9.64 | 9.12 | pass |
| P4 minus Group of Five | 13.07 | 10.85 | **fails (−17%)** |
| New teams in the final AP top 25 | 11 | 12 | pass |
| Starter overall | 74.7 | 73.3 | pass |

Champions over the 20 years: Georgia 5, Notre Dame 4, Alabama 3, USC 3, Ohio State 2, Texas, Oklahoma,
Texas A&M. The P4 edge erodes because every school's freshmen are only as good as its own 2026 class,
and nothing yet moves good players up a level. Recruiting (step 3) and the portal (step 5), where power
schools win the top prospects and pull the best Group of Five players, are what should hold the gap;
the gate is rerun after each.
