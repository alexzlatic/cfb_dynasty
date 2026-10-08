# The NFL draft (M3 step 4)

Every April the NFL drafts 257 players (seven rounds sized like 2025's, compensatory picks included)
from everyone leaving college: seniors and graduates, plus underclassmen who declared.

Code: `packages/core/src/draft.ts` (grades, declaring, the draft, prestige), the draft parts of
`packages/core/src/season.ts`, and the early-entry rule in `packages/core/src/rollover.ts`.

## Declaring

On January 15 (the declaration deadline) every third-year player, and every fourth-year player with a
redshirt year left, decides. The chance he goes depends on where the NFL would take him among this
year's draft-eligible players and on what he's paid to stay:

| Projected slot | Chance he declares |
|---|---|
| First round | 95% |
| Picks 33-100 | 80% |
| Rest of the draft | 50% |
| Just outside (to about 400) | 12% |
| Further down | 2% |

College pay of more than half a rookie deal at his slot starts to keep him (at a full rookie deal,
about 57% as likely). Declared players leave at the rollover whatever happens in the draft. Your own
declarers show up in the news on the deadline.

## The draft

The NFL grades each player by his true overall (not what scouts see), plus what his position is worth
(offensive linemen, tight ends and receivers up; linebackers, safeties and running backs down;
specialists far down), a Group of Five discount, part of his remaining upside (more for underclassmen),
and some disagreement among teams. The picks go in grade order; the NFL team order is shuffled each
year. The draft page shows a mock draft before the deadline, the declared list, every pick by round and
picks by school.

## What it does for recruiting

A school's picks a year over its last three drafts, against an average power program's (about three),
add to its prestige with recruits: half a point per pick above three, from -1.5 up to +4 for the top
factories.

## Gates

`npx tsx packages/core/scripts/draft-gates.ts [drafts] [seed]` plays a dynasty with no user team and
checks each draft against the 2023-2026 drafts. Seeds 7 and 11, the 2027 and 2028 drafts:

| | real | sim |
|---|---|---|
| Picks from power programs (and Notre Dame) | 80-92% | 86-90% |
| FCS picks | 5-15 | 10-13 (seed 7) |
| Most from one school | 10-15 | 8-12 |
| Juniors declaring | about 60-90 | 79-110 |
| Position mix (OL, WR, DT, DE, CB, LB, TE, S, RB, QB) | | within 3 points except OL (-3 to +6) |

Offensive linemen swing the most from draft to draft because so many are graded close together. The
most picks from one school runs a little low: the 2027 drafts take the 2026 rosters, which are spread
more evenly than real draft classes; later drafts concentrate as recruiting does.

## Determinism

Declarations draw from a stream seeded by the league seed and the year, one draw per draft-eligible
player in board order; the draft's disagreement among teams and the NFL order are hashed from the
league seed, the year and the player.
