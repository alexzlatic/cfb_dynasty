# True and scouted ratings: development, scheme fit and chemistry

Every season some teams are much better or worse than anyone projected in August. The reasons already exist
before the first game: players who developed, a roster that fits (or fights) its coaches' systems, and a
locker room that clicks. Media, pollsters and opposing scouts don't see them until the results do. The game
models this directly instead of moving ratings after results.

## Two layers

- **Scouted ratings** are the seed's ratings (what CFBD data and the ratings compiler produce). Power ratings,
  polls, the AD's expectations and the opponent scouting report all use them.
  Perception changes with results through the existing power updates and polls.
- **True ratings** are what the sim plays: the scouted ratings plus three hidden scores per unit (offense and
  defense), in points of margin. They are never updated from results.

`packages/core/src/hidden.ts` holds the model; `Season.hidden`, `hiddenStrength` and `staffView` expose it.
`applyHidden` turns points into small log-odds shifts of completion rate, yards per completion, sack and
interception rates, yards per carry, stuffs and explosive runs. It changes odds only, never the number of
random draws, so engine parity is untouched.

## The three scores

All three build through the calendar: spring camp (March and April) brings them to 40% of their final size,
summer to 50%, fall camp to 85% by the opener, and the rest arrives by mid-November.

- **Development.** Each player has a hidden development surprise (beyond what scouts expect for his class) and
  an expected gain that is largest for young players (5 overall points for a true freshman down to 1 for a
  fifth-year). A unit's development is the weighted sum over the players on the field (the QB counts three
  times), so a backup who comes in brings his own. Young units vary more (about 3.5 points) than veteran ones
  (about 2.8), and a returning lineup surprises less because it has been scouted for years.
- **Scheme fit.** The starters' average fit with the coaches' systems. Adaptable players shrug off a poor fit,
  and a good head coach (by career record) and an adaptable roster raise it through camp. It is the
  best-known score going into camp for a returning staff and swings much more with a new head coach.
- **Chemistry.** Built from the starters' leadership (the quarterback's counts three times), helped by scheme
  fit, plus what can't be explained. It swings more with a new quarterback. It also moves a little with how
  the season is going: winning beyond expectations lifts a locker room, losing more than expected wears on it.

## How they connect

- **Chemistry drives development.** A team with good chemistry develops faster: every player's expected gain
  is scaled by up to 1.5x (or down to 0.5x) by his unit's chemistry, so young players gain the most from a
  good locker room and lose the most in a bad one.
- **Fit drives chemistry.** Players in a system that suits them get along better with teammates.
- **Continuity amplifies.** A continuity team (same head coach, same quarterback, most starters back) has its
  chemistry amplified: a good locker room gets better and a bad one worse. Overall it has the fewest
  surprises, because fit and development are better known.
- **Change of scenery (next step, with transfers).** A transfer resets his fit and chemistry to his new team.
  A player whose fit or chemistry was poor gets a fresh draw, which tends to help; a player who leaves a good
  situation for a bigger NIL deal or more playing time risks a worse one. This waits for the transfer portal.

## Sizes

Calibrated to 658 real FBS team-seasons (reports/surprise-sizes.md): how far a team's true end-of-season
strength lands from its preseason rating, in points per game.

| Group | Real | Game (3 seasons, 414 team-seasons) |
| --- | --- | --- |
| All FBS | 6.6 to 6.8 | 6.56 |
| Continuity team | 4.7 | 4.57 |
| New head coach | 7.9 | 7.87 |
| New quarterback | 7.3 | 7.28 |
| New coach and new quarterback | 7.8 | 7.34 |

The hidden layer is unbiased: across the country it averages zero on offense and defense (coach quality
is relative to the rest of the country), and a small square-law correction keeps average scoring where the
scouted ratings put it, since a good offense gains more than a bad one loses.

Check with `npx tsx packages/core/scripts/hidden-check.ts spread 3`; `units` measures how many points of
margin one hidden point is worth (`POINTS_PER_UNIT`).

## What you see

- **Your staff knows first.** The Development screen shows your staff's read of your team's development,
  fit and chemistry by unit, and each player's progress beyond what was expected, leadership and
  adaptability. The read is blurred by how long the staff has watched the team: about 50% sure before
  August, sharper through camp, 90% from mid-September on. Other teams' hidden scores are never sent to the client.
- **Staff reports.** A fall camp report (with the preseason AD meeting) and a midseason report name the
  players ahead of and behind schedule and describe the fit and the locker room.
- **Development plans.** Your staff can put 8 players on individual plans (technique, strength and speed,
  film study, or leadership). A plan adds about 2 overall points over 80 days of work (2.5 at most in a year); a leadership plan raises
  the player's leadership, which feeds chemistry. Plans are actions in the league log (`set_lab`).

## Determinism and saves

Every hidden draw comes from `mixSeed(league seed, year, player or team, ...)`, so a replay from the action
log gives the same truth. `hidden_ctx` (who has a new coach or QB, continuity, coach quality), `morale` and
`lab` are saved in the league meta. A league saved before this change draws the same truth from its seed
when it is opened; games already played stay as they were.

## Next: what prospects value

Recruits and transfers will weigh scheme fit, chemistry (who else is there, the quarterback, the coach) and
development (a staff's record of developing players) against NIL money and playing time. Each prospect gets
his own priorities, so some chase money, some chase a starting job, and some pick the place they will grow.
