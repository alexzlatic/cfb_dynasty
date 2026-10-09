# Staff, the coaching carousel and your career (M4)

Every head coach and coordinator in the country is a person: hidden skills, a public reputation, a contract,
a record by season. Athletic directors fire on results, schools hire on reputation, and coaches move up,
step down or drop out. You hire your own coordinators, other schools can take them, and your own job is on
the line the same way. Code: `packages/core/src/carousel.ts` (the model and the market) and the coaching
section of `season.ts` (the calendar, your actions and views).

## Coaches

| Field | What it is |
|---|---|
| Skills | Recruiting, scouting, development, game planning, scheme, 25-95. Hidden: you see your own staff's exactly, everyone else's give or take about 7 |
| Reputation | 0-100, what schools hire on. Each season moves it 35% of the way to what the season says (25% in a coach's first year) |
| Side and schemes | Offense or defense, and his offense and front. A new coordinator brings his scheme |
| Contract | Salary and the year it runs through. Firing a coach costs 70% of the rest of his deal |

What a season says about a coach: a head coach scores 50 + 60·(win pct - .5) + 40·(win pct - expected), +4 at
a power program; a coordinator scores 45 + 8 × his unit's result against the roster's expectation (in
standard deviations) + 25·(win pct - .5), plus a level and prestige adjustment. Skills drift with age (still
learning under 40, slowing past 55, fading past 62). Coaches out of work lose 4 reputation a year. Coaches
retire from 62 (6%, +4% a year).

The league starts from the real staffs in the seed (skills exactly as before M4) plus 187 former FBS head
coaches out of work (`importer/build_coach_pool.py`, from CFBD). Each year new coaches enter: position coaches
getting their first coordinator shot, enough to keep about 170 out of work (at least 30 a year).

## The calendar

| When | What |
|---|---|
| All season | The Coaching carousel screen shows every FBS head coach's hot seat: the chance his AD lets him go, from his record so far |
| Sunday after the last full Saturday of November | **The carousel opens.** Every season goes on the record, reputations move, ADs let coaches go, coordinators are let go, coaches retire, newcomers arrive |
| Every day until January 20 | Openings fill best jobs first. A school takes its top candidate if he clears its bar, and waits up to 14 days for one who does. Hiring a sitting coach opens his old job, so the carousel cascades |
| January 20 | The market closes: anything still open is filled with a newcomer |

## Who gets let go (fit to real FBS coaching changes, 2006-2024)

Head coaches: a logistic fit on FBS coach-seasons, `importer/build_coach_pool.py --rates`:
log-odds = -1.882 - 4.053·(win pct - .5) - 0.829·(win pct - expected) - 0.581·(last year - .5) + 0.052·tenure
(capped at 10) - 1.424 in his first two years + 0.363 at a power program. FCS head coaches: 16% a year.
Coordinators: sigmoid(-2.6 - 0.9·unit - 1.5·(win pct - expected)); a new head coach keeps each coordinator
40% of the time (55% for one with reputation 60+) and brings his own when he can.

## Who gets hired

A school ranks every willing candidate by reputation plus its own read (noise of about 7), +4 for a sitting
head coach, +1 for a former head coach, -5 for a power
job with no head-coaching experience, -3 a year out of work, -8 at 63 and older.

Who is willing:
- A sitting head coach moves only for a clearly better job (2+ years in, appeal +20, +22 from a power job).
- A coordinator takes a head job down to 45 appeal points below his school, if his reputation is 40+, and a
  coordinator job at a school 10+ appeal points better after 2 years.
- Coaches out of work take anything on their side of the ball.

Appeal is prestige, +15 for power programs, -15 for FCS. That is what puts successful power coordinators first
in line for Group of Five head jobs, Group of Five winners first in line for power jobs, and coaches who are
let go a step down or out of coaching.

## Calibration

`npx tsx packages/core/scripts/carousel-gates.ts 8 7` plays 8 full seasons (about 20 seconds each);
`--synthetic 20 7` draws 20 seasons from team strength in a couple of seconds. League seed 7:

| Check | Real (CFBD 2006-2024) | 8 full seasons | 20 synthetic seasons |
|---|---|---|---|
| Head-coach changes a year | 20.1% | 22.4% | 19.4% |
| Power / Group of Five | 18.7% / 21.6% | 18.0% / 26.6% | 14.7% / 24.0% |
| Changes that are a move to another FBS head job | 24.4% | 28.3% | 19.2% |
| Moves G5>P4, P4>P4, G5>G5, P4>G5 | 53 / 27 / 13 / 7% | 57 / 19 / 20 / 4% | 40 / 35 / 15 / 11% |
| Let go by win pct <.2 / .2-.4 / .4-.6 / .6+ | 33 / 28 / 16 / 6% | 54 / 24 / 14 / 5% | 37 / 23 / 14 / 6% |
| G5 head coach winning 80%+ hired away | 28% | 28% (39) | 37% (65) |
| Power hires: first FBS head job / G5 HC / former HC / P4 HC | 39 / 27 / 19 / 15% | 37 / 41 / 11 / 11% | 50 / 21 / 12 / 18% |
| G5 hires: first job / former HC / G5 HC | 70 / 19 / 6% | 69 / 23 / 9% | 67 / 30 / 4% |

Full seasons spread records out more than the synthetic draw, so Group of Five winners stand out more and power
schools hire them more than real (41% vs 27%). Group of Five schools change coaches a little more often than
real. Samples are small (about 100 power hires in 8 seasons; the under-.200 bucket is a few dozen coaches).
Coordinator changes (37-45% a year) are an estimate; CFBD has no coordinator history.

## Money (estimates)

Salaries are estimates, not real contracts: power head coaches $3M-$11M by prestige and reputation, Group of
Five $0.6M-$2.2M, FCS about $250K; power coordinators $0.7M-$2.3M, Group of Five $230K-$650K. Your AD allows
staff pay up to 115% of what a typical staff at your school costs. Buyouts go on the budget as one-time charges.

## You

- **Staff screen:** your staff, Let go, and a hire tab per coordinator job. In the offseason coordinators at
  schools a step below yours will listen too; during the season only coaches out of work. An open job you
  don't fill stays open (you cover it and the staff is weaker). AI schools never fill your openings.
- **Job offers:** when you're a school's top candidate it offers you the job and you have 3 days to answer.
  Taking it moves your career there.
- **Firing:** at the carousel your AD fires you if job security is under 20 and you've had 3 years, or under 10
  in any year. You're out of work until an offer comes (the worst open job calls after 10 days if nobody
  else does). If security is 75+ at the end-of-season meeting your AD extends you five years with a raise.

Not in M4 yet: non-conference scheduling.
