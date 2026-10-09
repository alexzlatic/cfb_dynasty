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
Its read of each prospect is his truth plus an error that shrinks as he gets older, plus a miss that
never washes out and depends on how much he's seen (his rank on its last list): about ±3 points (90%
range) for the top 25, ±4 for the top 100, ±6 to No. 300, ±11 to No. 1,000 and ±14 below that. Below
No. 1,000 the miss runs mostly one way: an unknown kid is far more often underrated than overrated.
The real 2027 class keeps its real ratings, with the truth around them just as wide. It publishes new
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
freshmen, top 500 sophomores and every junior and senior.

A prospect weighs his top schools; his page and the big board show who he is considering and his
leader's share. Schools at the very top (whose range reaches 91) consider prospects of any level, so
the best prospects always have suitors.

## Scouting

Every school's read of a prospect, yours and the AI's alike, is its own evaluation combined with his high
school stats and with the service's read when he is rated (each weighted by how far it can be trusted):

- Its own read, before it puts any time into him, is about ±16 points (90% range) for a freshman and ±7
  for a senior, narrowing every day.
- Time narrows it a lot: every evaluation trip, and every 20 contact hours, is a look, and five looks
  cut the range by more than half (a senior a staff has worked hard is read within two or three points).
- It is 30% tighter within 300 miles or in your home state, 25% tighter in a region where you pay a
  regional scout ($95,000 a year), 15% tighter for power programs, which scout nationally.
- Each evaluation trip narrows it further ($2,500 and 6 staff hours near home, $7,500 and 9 hours away).
- A staff with better scouting reads tighter (up to 25%).
- What the staff takes from the service follows the service's evaluators day by day, not its publishing
  dates, so your ranges never all jump on one day.

So a school that works a prospect knows him far better than the service, and one that never looked
leans on the service and his stats. Early scouting can pay off or backfire: a sophomore you love may stall and one you passed on may grow.
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
- **Every school's read.** Scouts give stats a little weight, trusting them less than they deserve (they know numbers
  lie), so a sophomore's read moves about a point on average, a senior's about a third of a point. Seasons count as
  they're played, so no date moves everyone. The service's ratings ignore stats.

Sizes are a judgment call: there is no public table of high school production for college recruits, so an average
starter in a class has a normal good varsity season and the best reach what top recruits post. Seed 7, seniors'
senior seasons (starters): median / 90th percentile / best, from `npx tsx packages/core/scripts/hsstats-check.ts`:

| | median | 90th pct | best |
|---|---|---|---|
| QB passing yards, TD | 1,879, 16 | 3,342, 33 | 6,179, 59 |
| RB rushing yards, TD | 795, 12 | 1,449, 23 | 2,359, 40 |
| WR receiving yards | 522 | 993 | 1,890 |
| LB tackles | 79 | 116 | 177 |
| DE sacks | 5 | 11 | 19 |
| CB interceptions | 3 | 5 | 11 |

How much they tell you (correlation of a prospect's stats with where he truly arrives at college, against a
staff's read of him before it has put any time in): sophomores 0.37 vs 0.57, juniors 0.45 vs 0.75, seniors 0.65
vs 0.93. Outside the service's top 300, the juniors whose stats run 6+ points above the service's read are truly
3+ points better 64% of the time, against 41% of everyone there; seniors 62% against 35%. So stats point to
real sleepers, and a third of the time they mislead: a weak schedule, a pass-happy offense or an early growth
spurt.

The prospect list shows each one's latest season; pick a position to see and sort by every stat. A prospect's
page has his season-by-season table, and the big board shows his latest line.

## Staff

Every coach has five skills, 25 to 95 with 50 average: recruiting, scouting, development, game planning
and scheme, from the school's standing and a head coach's record. The staff splits its week (160 hours:
the head coach and three coordinators, about 40 flexible hours each beyond the practices, meetings and
games that fill a 70 to 80 hour week; 96 at FCS schools) between recruiting, scouting and preparing for
the next game; you set your own split. The head coach's own 40 hours go by the same split (about 12 for
recruiting in season, 28 out of it), and his home visits and official-visit weekends draw on them.
Off-field recruiting staffers (a director of recruiting, personnel staff, analysts) add 16 contact hours a
week each, all year: power programs carry three, others none, and you can hire up to eight at $85K a year
out of operations (`recruit_staffers`, the Strategy screen). In season
the usual split is 30/10/60 and a week of preparation is worth what the split and the staff's game
planning make it (spending the week recruiting costs you on Saturday). Development skill speeds growth
at the rollover by up to 10%.

## How the AI recruits

AI schools scout the way you do: each sees prospects through its own read (its staff's scouting skill,
national scouting for power programs, and the looks its contact hours buy), decides who is in its range
by that read, and values a target 65% by its own read and 35% by his stars (class rankings sell). The
prospects it works hardest are the ones it reads best. Prospects judge themselves (playing time, their
standing) by the service.

Every Sunday each school works a board: everyone committed to it, about four uncommitted targets per
open spot and a few prospects committed elsewhere it tries to flip. A school's targets are prospects in
its range (its last three classes), ranked by what he's worth to it, how badly it needs his position and
its chance with him. Its contact hours (its coaches' recruiting share plus its recruiting staff, worth
more with a better recruiting staff) build relationships; offers go out up to about five per open spot.

A prospect weighs each school the way real recruits chose (a choice model fit to 2024-2025 commitments):
distance and home state, prestige, the last season's record, power conference, playing time,
development, scheme fit and money, plus the relationship and the offer. Elite prospects go where elite
prospects go: a program's standing (its prestige and recent classes) pulls a four- or five-star harder
than playing time pushes him away. Each program also has a slow up-and-down cycle that moves how
recruits see it (a stand-in for coaching changes until the carousel).

Prospects with offers commit at the real pace by month (most in June and July and in December), wait
while a school they like better is still recruiting them, and sometimes flip (see Interest). The early signing period
in December signs most commits; on national signing day (the first Wednesday of February) the rest
sign, and schools with room make late offers to the prospects left. The season ends the day after.

School class targets come from their rosters: who is leaving, how many spots open, and how much the
school fills from the portal (its real style).

## Interest

A prospect's interest in each school (his page and the big board: his chance of picking it if he chose
today) is his base score for it plus what the school has built with him (`pullFor` in `recruiting.ts`):
contact hours, an offer (0.45 logit points, up from 0.3), being one of his favorites, and his commitment.

- **Favorites.** When he is first recruited about a third of prospects have one clear favorite and a
  quarter two or three, mostly the schools near the top of his list anyway (the home-state power, a blue
  blood), now and then a surprise; the rest are wide open. A lone favorite adds 2.5, one of a few 1.5.
- **Commitments.** Each commitment draws how firm it is: 70% locked in, 20% listening, 10% soft. While no
  school that has offered him beats his school by more than his loyalty (0.8, 0.4 or 0 by firmness, plus
  0.7 as the commitment ages over 120 days), his school gets a bond that puts it at a share drawn for his
  firmness (88-97%, 70-88% or 45-70%). A commitment to a school outside his list now puts it on the list.
- **Flip threats.** When an offer does beat his school by more than his loyalty (often his dream school
  offering late), the bond comes off and his list shows that school close or ahead. Each week he looks
  again one time in five and goes half the time, as before.

`npx tsx packages/core/scripts/interest-check.ts [seed]` measures it. Seed 7, 2027 seniors ranked in the top
1,500, on October 15:

| | before | now |
|---|---|---|
| Committed: own school first | 26% | 98% |
| Committed: own school's share, 10th/50th/90th pct | 0% / 3% / 19% | 68% / 91% / 96% |
| Uncommitted seniors: leader's share, 10th/50th/90th pct | 5% / 9% / 18% | 6% / 23% / 63% |
| Uncommitted seniors with a leader above 50% | 0% | 22% |
| Uncommitted rated juniors: leader's share, 90th pct | 27% | 76% |
| Committed seniors who flipped by Dec 1 | 3.6% | 4.0% |

Before, a commitment added nothing to his interest, so most committed prospects looked uncommitted. Sizes
are judgment calls: there's no public data on how early leaders form. Flips stay well below the real rate
(247Sports: 18.8% of the 2024 class's power-program commitments ended in a decommitment, over the whole
cycle): in the game few power-program commits flip (about 2% from August to December) because the schools
that could pull them have usually filled that position. Lowering loyalty barely raised that and spread
five-stars wider, so it's left as before.

## Gates

`npx tsx packages/core/scripts/recruit-gates.ts [seasons] [seed]` plays a dynasty with no user team and
checks each signing class against real ones. The 2027 class is real; from 2028 on the AI recruits.

Seed 7, the first three AI-recruited classes (2028-2030), with prospect discovery and the NFL draft's
effect on prestige in place, and (last column) the first two once schools recruit on their own scouts' reads:

| | real | 2028-2030 | own reads, 2028-2029 |
|---|---|---|---|
| Five-stars to top-10 classes | 70-90% | 74-83% | 63-66% |
| Four-stars to power programs | nearly all (a few to top Group of Six programs is fine) | 99.6-99.8% | 98.4-98.9% |
| Three-stars to power programs (of FBS signees) | 48% | 53-56% | 52.5-52.6% |
| Signees within 300 miles | 45-60% | 61-62% | 58-59% |
| Class size, 10th/50th/90th percentile | 12/20/29 | 11-14/20-21/25-27 | 14/21-22/27-30 |
| Position mix | | within 2 points of real | within 1.1 points |
| Class points, year-to-year correlation | 0.80-0.92 | 0.79-0.88 | 0.79-0.88 |
| Five-stars and four-stars a class | 25-40 and 380-520 | 35 and 452 | 35 and 447-452 |

Three-stars lean a little toward power programs and signees stay a little closer to home than real
ones; both are within a few points. Five-stars spread a little wider than real ones: the game had already
slipped to 63-69% before schools scouted for themselves (the carousel and the portal came after the first
measure), and schools that read a five-star lower than the service does now pass on some of them.

With the interest changes (favorites, commitment bonds, a bigger offer bump), against main on seeds 7, 11 and
23 (classes 2028-2029): five-stars to top-10 classes 46-69% (main 40-63%); four-stars to power programs
97.9-99.8% (97.1-98.7%); signees within 300 miles 56-60% (57-60%); class sizes and year-to-year
correlation unchanged.

## Busts and sleepers

How often the service is wrong is calibrated to real drafts: CFBD's 2018-2025 NFL drafts matched to the
players' recruiting classes, against `npx tsx packages/core/scripts/draft-ranks.ts 11 7` (drafts 2032-2036,
the first made of classes the game generated and recruited).

| | real | game |
|---|---|---|
| First-rounders who were top-25 recruits | 21% | 21% |
| ... No. 26-100 | 18% | 30% |
| ... No. 101-300 | 17% | 21% |
| ... No. 301-1,000 | 26% | 19% |
| ... below 1,000 or unranked | 18% | 9% |
| Top-25 recruits ever drafted | 53% | 62% |
| Top-25 recruits drafted in the first round | 19% | 26% |

One seed's drafts swing a lot from year to year (a top-25 share of 6% to 38% in single drafts). The game's
first round still leans to the top 300 (72% against 56%), and top recruits pan out a little more often
than real ones. The rest of the real gap is
college development (late bloomers, walk-ons and junior college players), which the game models more
tamely than real life. Before this, the game's rosters were filled out with generated freshmen rated like
the school's own recruits, so elite programs' filler linemen were five-star talents who went in the first
round by the dozen; with recruiting on, the fillers are now unranked walk-ons.

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
prospects you want (up to 10 a week on one prospect; your recruiting share of staff time, your
recruiting staff and this week's visits set the total, and a board set past it is spread thinner), offer,
and send scouts.
Actions: `recruit_auto`, `recruit_hours`, `recruit_offer`, `recruit_board` (your ordered big board),
`scout_prospect`, `scout_region`, `staff_time`. API: `GET /api/leagues/:id/recruiting` (a class as your
staff sees it, with filters `cls`, `pos`, `region`, `q`, `stars`, `status`, `sort` and `view` = known,
rated, found, board, mine or committed), `GET .../recruiting/prospect?pid=` (his page: who he's
considering, your read over time, projected ratings), `GET .../recruiting/board`,
`GET .../recruiting/map?cls=` and `GET .../recruiting/rankings?cls=`. Prospects your staff doesn't know
return 404.

### Your pitch (the Pitch page)

Every rated sophomore, junior and senior has a pitch page (`#/l/:id/pitch/:pid`, `core/src/pitch.ts`).
Everything on it adds one number to how much he likes your school (`Prospect.pull`), on top of contact
hours and the scholarship offer; the weekly recruiting, flips and signing day all read it.

- Selling points (up to three, `recruit_pitch`): early playing time, development, winning, close to home,
  NIL and money, scheme fit, family and culture. Each lands by how much he cares about it (his
  personality factor, squared) times how your school really compares on it with the others he's
  considering (standard units, -2 to 2). Selling a weakness backfires. Effects split as 1/sqrt(n) over the
  points and add up to at most 0.6. The pitch is heard in proportion to your contact hours with him, fully
  at 15; at 30 your staff learns his real priorities (until then the page reads his personality type).
- Visits (`recruit_visit`): an official visit (juniors and seniors, once, $3K near home and $8K far, 8
  staff hours of which 2 are the head coach's) is worth 0.14 to 0.3 by how the campus shows; the head
  coach in his home (twice per recruit, $1.5K or $4K, 6 or 10 of his own hours) 0.06 to 0.14 by the
  staff's recruiting skill. Both fade with a 20-week half-life. Visit hours come out of the week's contact
  hours, and the head coach can't visit past his own recruiting hours (`recruitLedger`), so in season he
  manages one or two homes a week. Travel goes into operations with scouting.
- NIL (`recruit_nil`, amount 0 takes back an offer or ends a deal): a deal a year for when he enrolls,
  negotiated like a contract. He answers in a day or two in your inbox: yes at or above his number (about
  his market value, more for a money-first recruit, 15% less where you're his favorite and 15% more
  where you're outside his top three), else he counters; lowballs cost patience and running out ends the
  talks for the year (a small hit with him). An agreed deal pulls by how far it beats what he'd expect
  from your school's money, times how much money matters to him (at most 1.5). Ending an agreed deal
  costs 0.2. Senior deals count against next season's roster budget (`nextBudget().recruits`), must pass
  the fair-market-value ceiling, and become his contract when he enrolls (a multi-year deal locked).

The NIL tracker (`#/l/:id/recruiting/nil`, `GET .../recruiting/nil`) shows next season's budget with the
recruits' deals, offers and NIL talks by class and by position, every talk in one table, and this
season's roster pay by position and class. `GET .../recruiting/pitch?pid=` serves the pitch page.

## Determinism

The weekly recruiting draws from a stream seeded by the league seed and the date. How every school
looks to recruits (record, development, money, range, class target, starters) is fixed on the first day
of the recruiting year and saved, so a reopened league recruits exactly as one that never closed.
