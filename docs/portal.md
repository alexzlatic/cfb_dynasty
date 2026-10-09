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

Money counts double the recruits' weight: pay is the one lever you control directly, so a player who's
only underpaid can be kept by paying him.

**Reasons** are the factors pulling him away by a meaningful amount, worst first. **What keeps him** is
`payFor`: the pay that brings his chance down to 25% (`COMMIT`, the least he'll commit to stay for), or
"money won't fix it" when even two and a half times his value doesn't ("not money alone" when pay is one
of several reasons). A player who has committed shows as Committed.

**Watch levels:** under 12% Settled, under 30% Restless, under 60% Shopping, otherwise Likely gone.

**What you know:** until you talk with him, your staff reads him as a typical personality, so his reasons
and number are estimates (shown as a wider range), and it only half sees his own pull this year. A talk
(five a week) reveals his real personality and lifts his morale a little.

## Renewal talks (no arbitration)

When talks open every player you have posts a status:

- **Staying:** his renewal number is enough; he'll commit at that. The renewal number is what he's paid now
  (revenue share and NIL together), nudged by his season: where his production ranks among FBS players at his
  position (linemen and punters by games played) moves it from -5% to +8%, an All-American adds 5% and a
  conference player of the year 3%, and a player who didn't play takes 3% less (`renewalNudge`).
- **Wants a raise:** money would settle him; he asks his number plus a margin (money-first players push hardest).
- **Testing the market / Leaving:** money won't fix it (playing time, fit, home, winning or unhappiness).
- **Weighing the NFL / Out of eligibility:** not part of the talks.

Players under a multi-year deal renegotiate too: every player is effectively a free agent each winter.

**Negotiating.** You offer an amount and a length. He answers in one or two days: at or above the least he'll
commit for, he commits to stay. Below it he declines and names a number part of the way down from his
last, never below that least amount. Each decline costs a round of patience (mercenaries have 2, steady
players 4, everyone else 3); an offer under 70% of his number insults him (two rounds and a morale hit).
Out of patience, he stops talking and enters the portal. There is no arbitration: with no deal by
December 31, a player who wanted one enters on January 2.

**Your standing rule** keeps you from negotiating with a hundred players: re-sign everyone happy to stay
at his renewal number, and everyone else asking up to 110% of value; for the rest the staff offers up to 100%; let reserves go when they ask more than $25K and
won't start; keep renewals under 80% of next season's budget. Your top 30 players by value always come
to you ("Needs you"); any you don't get to get the standard offer on December 31. Tick "I'll decide" on a
player to keep the staff's December 31 plan off him (then no deal means the portal).

**Nothing the rule signs is official until you confirm it.** The Renewals screen lists every auto-renewal
(pay now, the renewal, the change and why), the players who need a new deal, the ones heading to the portal
and the ones leaving anyway. Confirm them all or one at a time; revoke one and he enters the portal on
January 2, or renegotiate and talk with him yourself. Your staff confirms whatever's left when the portal
opens.

**Promises.** You can promise a starting job next season, one per starting spot at a position. It counts as
starting in his score. If he isn't starting by your fourth game, the promise is broken: morale drops hard.

## Contract offers during the season (OOTP-style)

On the Payroll screen, Change opens an offer: pick an amount and a length and you see what he wants for it.
For this season alone he takes anything that isn't a pay cut; a longer deal locks him in, so he wants the least
he'd commit to stay for at that length (his premium per extra season on top), at least half his value and no
less than he makes now, and some players won't sign that long at all (`contractDemand`). Your offer waits a day
or two; his answer comes to your inbox (Contracts): he accepts and the deal starts, or turns it down and names
his number (an offer under 70% of it insults him and hurts his mood). You can withdraw an offer he hasn't
answered. Ending a deal is still immediate.

## The portal window

Each day every AI school works out what it still needs at each position next season: open spots on a full
roster (counting returning players, its signed recruits and transfers already in), starting jobs no
returning player can hold, and upgrades on its two-deep. It offers to the best fits in reach of its level
(only the most prestigious programs chase anyone; others stay within reach of their starters; everyone
moves on from players already holding a crowd of offers), paying his value at its own pay rate, from its style's share of next season's budget
(portal and win-now schools 40%, balanced 30%, developers 20%). Out of money it can still offer a
scholarship to players with no market value.

Nobody commits the day he enters. After that, players holding offers commit with a daily chance that grows through the window, picking by the recruits'
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
| FBS entrants a team | 24.2 | 21.4 | 19.2 | 20.6 |
| Entry rate, P4 / G5 | 22.1% / 18.4% | 20.5 / 16.8 | 20.1 / 16.7 | 22.3 / 17.0 |
| P4 entry by seasons in college (0, 1, 2, 3) | 16, 28, 28, 21 | 15.8, 26.5, 26.9, 21.7 | 14.6, 27.9, 29.5, 20.2 | 16.3, 31.5, 31.2, 22.7 |
| No school, P4 / G5 entrants | 14.8% / 29.8% | 11.3 / 22.9 | 14.9 / 25.6 | 17.5 / 27.7 |
| G5 to P4 | 482 | 441 | 326 | 304 |
| P4 to P4 | 873 | 766 | 709 | 679 |
| P4 to G5 | 545 | 497 | 308 | 326 |

Entry rates, the shape by year and the no-school shares hold. In the first winter all of the top 100 FBS
entrants found schools, 96 of them at power programs. Moves between levels run 10-20% light in the first
winter and drift lower after it, P4 to G5 most (power schools fill more of their needs with freshmen once
the sim's own recruiting classes arrive); worth revisiting with the coaching carousel (M4). A full winter
runs in about ten seconds headless.

## Screens

- **My Team > Retention:** the portal watch for every player all season (counts by level, reasons, what
  keeps him), next season's budget, and in December the talks: your standing rule, each player's status
  and number, one-click "Pay his number", and a link to his talks.
- **My Team > Renewals:** the end-of-season screen above (Home's "Needs you" card links to it while talks are open).
- **Player page:** a watch chip in the header and a **Future** tab: the chance he enters with its
  reasons, what keeps him, talk and promise buttons, the negotiation card (status, his number, market,
  patience, your offer and when he answers, I'll decide, let him go) and five players like him with their
  pay. Players in the portal show a **Portal** tab instead (why he left, his ask, where he's leaning,
  your bid, or "bring him back" for your own).
- **Recruiting > Transfer portal:** your needs by position (click to filter), your money left after
  offers, and every entrant with his reasons, ask, offers, where he's leaning, your bid and pitch.
- **Home:** a "Needs you" card: players in talks waiting on you, answers due, key players shopping, the
  portal open.
- The calendar's "To next event" stops when talks open and when the portal opens.
