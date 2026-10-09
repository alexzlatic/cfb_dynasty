# Recruiting (M3 step 3)

High school recruiting runs all year. Four classes are live at once: this year's seniors (the real 2027
class in the first season), and the juniors, sophomores and freshmen behind them, generated from real
prospects. A new freshman class appears at every rollover and the seniors who signed enroll.

Code: `packages/core/src/recruiting.ts` (prospects, the service, scouting, the AI week, signing),
`packages/core/src/staff.ts` (coaching staff skills and time), the recruiting parts of
`packages/core/src/season.ts`, and `importer/build_recruits.py` (the generation pool and rating curve).

## Prospects and their true potential

Every prospect has a true potential on each July 1 from his freshman year to his arrival at college
(`path`). Year to year it carries 75%, 85%, 92% and 97% of where it stood (a stationary AR(1) drawn back
from where he arrives), so a freshman's potential can move a lot by his senior year and a senior's
hardly moves. Between those points the truth follows a smooth curve (Catmull-Rom), so it changes a
little every day and never jumps; no date moves everyone. His current overall rises about 9.5 points a
year through high school toward what he'll be as a college freshman.

Generated prospects are drawn from the 12,065 real prospects of the 2024-2026 classes (position,
hometown, size and composite), so five-stars come from where five-stars come from and the position mix
is real. The real 2027 class is filled out to a full class (4,114) with generated prospects at the low
end, and its real commitments start as verbals that can flip.

## The national service

Every class exists in full from the day it appears (about 4,100 prospects). The service rates about 50
freshmen, about 500 sophomores and every junior and senior, with stars, a composite (0.80 to 1.00, from
the real composite curve by rank: about 35 five-stars and 450 four-stars a class) and a national rank.
Its read of each prospect is his truth plus an error that shrinks as he gets older. It publishes new
ratings on May 15, August 1 and December 15, so stars and ranks change on those dates.

## Finding prospects

The rest of a young class is out there but unknown until someone finds him. Your staff knows everyone
the service rates or who has committed, plus whoever it has found itself. Each week every unknown
prospect has a small chance of being found, highest near home and in regions you pay a scout for:

| Where he lives | Chance a week (a top prospect) |
|---|---|
| Your home state or within 300 miles | 8% |
| A region you scout | 6% |
| Elsewhere, power program (national scouting) | 0.4% |
| Elsewhere | 0.2% |

Better prospects are found faster (the chance falls off quickly below the top 10% of a class), a staff
with better scouting finds more, and the share of staff time on scouting scales it (half to double).
A new league starts with what a staff would already have found. Prospects you put on your board, offer,
scout or spend hours on stay known. AI schools recruit the prospects in play nationally: the top 50
freshmen, top 500 sophomores and every junior and senior, so their recruiting is unchanged.

A prospect weighs his top schools; his page and the big board show who he is considering and his
leader's share. Schools at the very top (whose range reaches 91) consider prospects of any level, so
the best prospects always have suitors.

## Scouting

Your staff's read of a prospect is its own evaluation combined with the service's when he is rated:

- Its own read is about ±15 points (90% range) for a freshman, ±3 for a senior, narrowing every day.
- It is 30% tighter within 300 miles or in your home state, 25% tighter in a region where you pay a
  regional scout ($95,000 a year), 15% tighter for power programs, which scout nationally.
- Each evaluation trip narrows it further ($2,500 and 6 staff hours near home, $7,500 and 9 hours away).
- A staff with better scouting reads tighter (up to 25%).
- What the staff takes from the service follows the service's evaluators day by day, not its publishing
  dates, so your ranges never all jump on one day.

Early scouting can pay off or backfire: a sophomore you love may stall and one you passed on may grow.
Scouting costs come out of your operations budget.

## High school stats

Every prospect plays a high school season each fall (games on Fridays from late August, ten in the regular
season and up to five in the playoffs), and his stats build game by game. Code: `packages/core/src/hsstats.ts`.

- **Varsity or JV.** About 14% of freshmen start on varsity, 56% of sophomores, 93% of juniors and 98% of
  seniors; the better he is for his age, the sooner. Once on varsity he stays there.
- **Production follows the truth.** His numbers come from his true ability at the time (his true potential plus
  his own form), not anyone's read of him, with noise on top: his situation (competition, his team and its
  scheme, the same every year), the season itself (role, health, luck), and his age (a freshman produces less
  than the same player as a senior). Early bloomers pile up numbers young; late bloomers' numbers undersell them.
- **Your staff's read.** Scouts give stats a little weight, trusting them less than they deserve (they know numbers
  lie), so a sophomore's read moves about a point on average, a senior's under a tenth. Seasons count as they're
  played, so no date moves everyone. The service's ratings ignore stats, and the AI recruits on the service.

Sizes are a judgment call: there is no public table of high school production for college recruits, so an average
starter in a class has a normal good varsity season and the best reach what top recruits post. Seed 7, seniors'
senior seasons (starters): median / 90th percentile / best, from `npx tsx packages/core/scripts/hsstats-check.ts`:

| | median | 90th pct | best |
|---|---|---|---|
| QB passing yards, TD | 1,871, 16 | 3,020, 30 | 5,608, 51 |
| RB rushing yards, TD | 807, 11 | 1,407, 22 | 2,288, 40 |
| WR receiving yards | 520 | 953 | 2,121 |
| LB tackles | 80 | 113 | 167 |
| DE sacks | 5 | 10 | 27 |
| CB interceptions | 3 | 5 | 13 |

How much they tell you (correlation of a prospect's stats with where he truly arrives at college, against your
staff's read): sophomores 0.43 vs 0.63, juniors 0.53 vs 0.89, seniors 0.64 vs 0.97. Outside the service's top 300,
the sophomores whose stats run 6+ points above the service's read are truly 3+ points better three times as often
as the rest (22% vs 7%); juniors 19% vs 15%, seniors 8% vs 6%. Stats find the most among the young and the
unrated, where reads are wide; by senior year the scouts have mostly caught up.

The prospect list shows each one's latest season; pick a position to see and sort by every stat. A prospect's
page has his season-by-season table, and the big board shows his latest line.

## Staff

Every coach has five skills, 25 to 95 with 50 average: recruiting, scouting, development, game planning
and scheme, from the school's standing and a head coach's record. The staff splits its week (about 160
hours) between recruiting, scouting and preparing for the next game; you set your own split. In season
the usual split is 30/10/60 and a week of preparation is worth what the split and the staff's game
planning make it (spending the week recruiting costs you on Saturday). Development skill speeds growth
at the rollover by up to 10%.

## How the AI recruits

Every Sunday each school works a board: everyone committed to it, about four uncommitted targets per
open spot and a few prospects committed elsewhere it tries to flip. A school's targets are prospects in
its range (its last three classes), ranked by what he's worth to it, how badly it needs his position and
its chance with him. Its contact hours (more for power programs, worth more with a better recruiting
staff) build relationships; offers go out up to about five per open spot.

A prospect weighs each school the way real recruits chose (a choice model fit to 2024-2025 commitments):
distance and home state, prestige, the last season's record, power conference, playing time,
development, scheme fit and money, plus the relationship and the offer. Elite prospects go where elite
prospects go: a program's standing (its prestige and recent classes) pulls a four- or five-star harder
than playing time pushes him away. Each program also has a slow up-and-down cycle that moves how
recruits see it (a stand-in for coaching changes until the carousel).

Prospects with offers commit at the real pace by month (most in June and July and in December), wait
while a school they like better is still recruiting them, and sometimes flip. The early signing period
in December signs most commits; on national signing day (the first Wednesday of February) the rest
sign, and schools with room make late offers to the prospects left. The season ends the day after.

School class targets come from their rosters: who is leaving, how many spots open, and how much the
school fills from the portal (its real style).

## Gates

`npx tsx packages/core/scripts/recruit-gates.ts [seasons] [seed]` plays a dynasty with no user team and
checks each signing class against real ones. The 2027 class is real; from 2028 on the AI recruits.

Seed 7, the first three AI-recruited classes (2028-2030), with prospect discovery and the NFL draft's
effect on prestige in place:

| | real | 2028-2030 |
|---|---|---|
| Five-stars to top-10 classes | 70-90% | 74-83% |
| Four-stars to power programs | nearly all (a few to top Group of Six programs is fine) | 99.6-99.8% |
| Three-stars to power programs (of FBS signees) | 48% | 53-56% |
| Signees within 300 miles | 45-60% | 61-62% |
| Class size, 10th/50th/90th percentile | 12/20/29 | 11-14/20-21/25-27 |
| Position mix | | within 2 points of real |
| Class points, year-to-year correlation | 0.80-0.92 | 0.79-0.88 |
| Five-stars and four-stars a class | 25-40 and 380-520 | 35 and 452 |

Three-stars lean a little toward power programs and signees stay a little closer to home than real
ones; both are within a few points.

## Titles and year-to-year change

Three 20-season dynasties (`scripts/drift.ts`, seeds 7, 11 and 23), now that teams are built from
their own recruiting, with the program cycle and yearly coaching changes:

| | real 2006-2025 | dynasties |
|---|---|---|
| Different champions | 10 | 10, 10, 11 |
| Most titles by one school | 6 (Alabama) | 5, 4, 4 |
| Schools with more than three titles (several is fine if titles spread wide) | 1 | 1, 3, 2 |
| Top-four schools' share of titles | about 60% | 65-70% |
| Year-to-year strength correlation | 0.81 | 0.84 |
| Top-10 teams still top 10 next year | 5.7 | 6.1-6.7 |

Before recruiting, four schools won 75% of titles. Programs are still slightly steadier than real ones;
the transfer portal (step 5) and the coaching carousel (M4) are the remaining real sources of churn.

## Your recruiting

Your staff runs your board by default. Turn that off to run it yourself: put contact hours on the
prospects you want (your recruiting share of staff time sets the total), offer, and send scouts.
Actions: `recruit_auto`, `recruit_hours`, `recruit_offer`, `recruit_board` (your ordered big board),
`scout_prospect`, `scout_region`, `staff_time`. API: `GET /api/leagues/:id/recruiting` (a class as your
staff sees it, with filters `cls`, `pos`, `region`, `q`, `stars`, `status`, `sort` and `view` = known,
rated, found, board, mine or committed), `GET .../recruiting/prospect?pid=` (his page: who he's
considering, your read over time, projected ratings), `GET .../recruiting/board`,
`GET .../recruiting/map?cls=` and `GET .../recruiting/rankings?cls=`. Prospects your staff doesn't know
return 404.

## Determinism

The weekly recruiting draws from a stream seeded by the league seed and the date. How every school
looks to recruits (record, development, money, range, class target, starters) is fixed on the first day
of the recruiting year and saved, so a reopened league recruits exactly as one that never closed.
