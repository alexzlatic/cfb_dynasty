# Keeping players and the transfer portal (M3 step 5)

Every winter each player weighs staying at his school against what the market would give him elsewhere.
You see it coming all season, get first chance to fix it in December's renewal talks, and bid against every
other school for the players who leave. Code: `packages/core/src/portal.ts` (the model) and the portal
section of `season.ts` (the calendar, AI schools and views).

## The offseason calendar

| When | What |
|---|---|
| All season, Mondays | Portal watch: your players' chance to enter is recomputed; a starter or top-25 player crossing into Shopping makes the news |
| Monday after the first Saturday of December | **Renewal talks open** (the sim stops for you). Your standing rule re-signs everyone it covers |
| Until December 31 | You talk, make offers, promise starting jobs, let players go. Each offer gets an answer in a day or two |
| December 31 | Talks close. Your staff's plan settles whatever you left to it |
| January 2 | **The portal opens** (the sim stops). Everyone who wanted a deal and has none enters, and so does anyone else whose stay-or-go draw says go. Players whose teams are still playing enter the day after their last game |
| Every day after | AI schools bid to fill their needs; players with offers commit, slowly at first |
| National signing day | The portal closes: entrants with offers pick one; anyone without a school leaves college football |
| Rollover | Committed transfers join their new schools a year older |

## The stay-or-go score

`stayScore` adds up what pulls him to stay (positive) or go (negative), each weighted by his hidden
personality (`persona`, the same one recruits have):

- **Pay:** staying's pay against what the level he'd land at pays for his value, times how many schools
  would want him (up to 1.8 for a player well above that level's starters).
- **Playing time:** his chance to start here next season (his projected rank at his position after
  graduations and draft declarations) against there. A promised starting job counts as starting.
- **Development, scheme fit, winning, home:** the recruits' terms (facilities, his hidden fit, prestige and
  record, distance from home).
- **Unhappy here:** his morale (pay, playing time, a broken promise).

Then friction, the things that keep anyone put: by seasons in college, by level (Group of Five and FCS
players have fewer places to move up to), loyalty, a multi-year deal, a second transfer that would cost a
season (Act), nowhere better to play, and dropping a level. A per-player, per-year draw adds his own pull.
His chance to enter is the logistic of minus the total.

The level he'd land at is the best of power, Group of Five and FCS among the levels that would want him
(where he's within reach of their starters).

**Reasons** are the factors pulling him away by a meaningful amount, worst first. **What keeps him** is
`payFor`: the pay that brings his chance below 12% (Settled), or "money won't fix it" when even two and a
half times his value doesn't.

**Watch levels:** under 12% Settled, under 30% Restless, under 60% Shopping, otherwise Likely gone.

**What you know:** until you talk with him, your staff reads him as a typical personality, so his reasons
and number are estimates (shown as a wider range). A talk (five a week) reveals his real personality and
lifts his morale a little.

## Renewal talks (no arbitration)

When talks open every player you have posts a status:

- **Staying:** settled at what staying pays him now; he'll commit at that.
- **Wants a raise:** money would settle him; he asks his number plus a margin (money-first players push hardest).
- **Testing the market / Leaving:** money won't fix it (playing time, fit, home, winning or unhappiness).
- **Weighing the NFL / Out of eligibility:** not part of the talks.

Players under a multi-year deal renegotiate too: every player is effectively a free agent each winter.

**Negotiating.** You offer an amount and a length. He answers in one or two days: at or above the least he'll
commit for (the pay that settles him), he commits to stay. Below it he declines and names a number part of
the way down from his last, never below that least amount. Each decline costs a round of patience (two
for steady players, four... see `patienceOf`: mercenaries 2, steady 4, others 3); an offer under 70% of his
number insults him (two rounds and a morale hit). Out of patience, he stops talking and enters the portal.
There is no arbitration: with no deal by December 31, a player who wanted one enters on January 2.

**Your standing rule** keeps you from negotiating with a hundred players: re-sign everyone asking up to
110% of value; for the rest the staff offers up to 100%; let reserves go when they ask more than $25K and
won't start; keep renewals under 80% of next season's budget. Your top 30 players by value always come
to you ("Needs you"). Tick "I'll decide" on a player to keep the staff's December 31 plan off him.

**Promises.** You can promise a starting job next season, one per starting spot at a position. It counts as
starting in his score. If he isn't starting by your fourth game, the promise is broken: morale drops hard.

## The portal window

Each day every AI school works out what it still needs at each position next season: open spots on a full
roster (counting returning players, its signed recruits and transfers already in), starting jobs no
returning player can hold, and upgrades on its two-deep. It offers to the best fits in reach of its level
(a school doesn't chase players far above its starters, and moves on from players already holding a
crowd of offers), paying his value at its own pay rate, from its style's share of next season's budget
(portal and win-now schools 40%, balanced 30%, developers 20%). Out of money it can still offer a
scholarship to players with no market value.

Players holding offers commit with a daily chance that grows through the window, picking by the recruits'
choice model (money against his value, playing time, development, prestige and record, distance, his old
school) plus your pitch calls (six a day; each builds interest, up to four). Most FBS players whose best road
leads down to FCS stop playing instead.

You see every entrant with his reasons (public once he's in), his ask, how many offers he has and where
he's leaning, plus your needs and how much of next season's budget is left after your other offers.

## The Protect College Sports Act (setting)

- **One free transfer:** a second transfer costs a season of eligibility, which weighs on his decision
  to enter and shows on the portal list.
- **Five seasons in five years:** fourth-year players stay for a fifth unless they're done or turn pro
  (better players more often), instead of today's redshirt-based exits.
- **Retention fund:** only for players who've completed a season at the school (a transfer who just
  arrived can't get it).
- Not modeled yet: the ban on head coaches leaving mid-season (career moves, M4); the 20-team
  conference cap and 5% agent fees have no effect on play. Players start with no transfer history (moves
  are counted from the first winter).

## Gates

From the January 2026 portal (CFBD's portal list matched to the 2025 rosters,
`scripts/portal-real.ts`), against a no-user dynasty (`scripts/portal-gates.ts 3 7`):

| | real | winter 1 | winter 2 | winter 3 |
|---|---|---|---|---|
| FBS entrants a team | 24.2 | 21.3 | 19.9 | 20.1 |
| Entry rate, P4 / G5 | 22.1% / 18.4% | 21.1 / 16.1 | 22.1 / 15.9 | 22.8 / 15.7 |
| P4 entry by seasons in college (0, 1, 2, 3) | 16, 28, 28, 21 | 16.5, 28.2, 26.4, 22.1 | 17.7, 31.3, 29.9, 22.5 | 17.7, 32.6, 31.6, 22.6 |
| No school, P4 / G5 entrants | 14.8% / 29.8% | 13.7 / 26.3 | 16.9 / 24.5 | 20.7 / 29.4 |
| G5 to P4 | 482 | 350 | 321 | 248 |
| P4 to P4 | 873 | 752 | 693 | 628 |
| P4 to G5 | 545 | 482 | 368 | 300 |

Entry rates, the shape by year and the no-school shares hold. Moves between levels run 15-30% light in the
first winter and drift down after it (power schools fill more of their needs with freshmen once the sim's
own recruiting classes arrive); worth revisiting with the coaching carousel (M4). A full winter runs in
about ten seconds headless.
