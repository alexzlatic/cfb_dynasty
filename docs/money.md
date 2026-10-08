# Money (M2)

Every FBS program has a budget, and you pay your roster. Money reaches the field only through the hidden
scores from M1 (chemistry now; development and injuries once facility upgrades open), never as a direct
ratings boost.

## Paying players

Two kinds of money reach players, and you spend both as **one roster pool**.

- **Revenue share (the athletic department's).** The school pays players directly under a cap for all
  sports: $20.5M in 2025-26, $21.5M in 2026-27, then 4% a year. Your AD decides how much goes to football
  (about 75% at power schools; schools whose whole roster budget is smaller give less, like Boston
  College; other schools give a share that grows with prestige).
- **Collective NIL (the boosters').** Your collective raises money on top. Donors give more after wins
  beyond expectations and less after losses.
- **Your pool.** Revenue share plus the collective's money is your roster budget, and you decide who gets
  it (`sign_contract`: dollars a year, seasons up to his eligibility; 0 ends his deal). A deal is paid
  from revenue share first, then the collective; the collective's part is a yearly NIL deal. The
  **fair-market-value review** (like the College Sports Commission's NIL Go) only stops egregious ones:
  an NIL part above four times his value plus $500K. Real reviews almost never stop a deal. Your collective never makes deals on its own.
- **AI schools.** Each AD signs its roster at the start (`aiContracts`: every player the same share of
  his value, never more than his value), and each collective fills gaps to value (starters first), then
  pays its top 20 players with what's left, holding 15% back for monthly deals in the season.
- **How much.** All 68 power-conference and Notre Dame roster budgets come from The Athletic's 2026
  estimates (`importer/roster_budgets_2026.csv`: 21 published ranges, the rest read from its chart),
  scaled 0.8 for 2025 and +4% a year after 2026. The collective is that budget less football's revenue
  share. Group of Five collectives are estimated (a million or two).

## Protect College Sports Act (setting)

The Senate passed the Act (S. 4668) 77-22 on September 28, 2026; it is waiting on the House. Turn it on in
Settings (`pcsa`) before the season's first game; switching re-signs every roster.

- **Retention fund:** each school may pay up to $22.5M a year above the cap to players who have completed a
  season there (football gets 75%, as of the cap). A school funds it with booster money that used to go
  through its collective (up to 60% of it), so the total roster budget barely moves but more of it is
  the school's, and only returning players can get it: players who have completed a season at the school
  (not transfers who just arrived).
- **Tighter fair-market value:** NIL deals must pay what a business would pay him, so the review's
  ceiling drops to two and a half times his value plus $250K.
- **Transfers and eligibility:** one free transfer (a second costs a season) and five seasons in five
  years; see [portal.md](portal.md). The ban on head coaches leaving mid-season comes with career moves
  (M4); the 20-team conference cap and 5% agent fee cap don't affect play.

A player's **value** (`playerValue` in `money.ts`) is what the national market pays a player like him in a
year, revenue share and NIL together. It depends on position and overall rating, with a soft ceiling (a
75-overall starting QB is worth $900K, an elite one up to $6.5M). Young players are worth at least their
recruiting hype, which fades over two years.

## Morale

Each Monday every player weighs his pay against what his school pays for value across its roster, and his
playing time against his worth (`morale.ts`). Three things hurt: a starter paid well below that, a player
whose value says he should start sitting on the bench, and a backup paid more than the starters at his
position. Morale moves 30% of the way toward how he feels each week, and it weighs on whether he enters
the transfer portal (portal.md). A unit's starters' morale moves its chemistry, measured against the rest of the country so the
scouted view stays unbiased. An entirely unpaid starting lineup costs about 0.8 points a game.

## Budget, game day and facilities

`finance.ts` builds each school's football budget for the fiscal year (July to June).

- **Revenue:** media and conference money, tickets, donors, school support and student fees, licensing,
  and postseason shares.
- **Expenses:** revenue share, coaches and staff, operations, and facilities and debt service.

Real Knight-Newhouse football lines replace the estimates when an export is in
`importer/.cache/knight_newhouse.csv` (`python3 importer/build_finances.py`). Until then every line is
estimated from conference and prestige.

**Game day.** Last season's average home crowd comes from CFBD. A home game's crowd responds to its ticket
price (about 1% fewer fans per 1% higher), winning, rankings and the opponent. A sellout school has fans it
turns away, so it can charge more. You set prices per home game with `set_ticket_price`.

**Facilities.** Five areas are graded 1 to 5. Today's facilities are already part of every team's ratings, so
only upgrades change anything. Your AD approves an upgrade (`request_project`) when football's surplus covers
its first year's payment, and builds it over one to three years. AI schools start their own projects once
seasons chain together (M3).

## Checks

- `npm run check:m2` scores the M2 gates.
- Speed is in `npm run check:m1`: money adds about 7% to a headless season.

## Results move money (front office)

A season's results reach next year's budget through each program's **fortune** (`fortunes.ts`), three
multipliers around 1 that carry most of last year's value forward:

- **Fans** (the usual home crowd) follow the record and a playoff berth.
- **Donors** (booster giving and the collective) follow winning beyond expectations (each game's pregame
  chance is the expectation), a playoff berth (worth much more at a Group of Five school than at a power
  program, whose boosters expect it), playoff wins and a title. A losing season costs giving.
- **The athletic department** gives football more revenue share, up to the cap, when football's revenue
  beats what it was budgeted at when the season opened (tickets, postseason money, giving). Power schools
  already paying the full cap feel it only through their boosters.

Next season's budget (renewal talks, the portal, the Front office) projects the season so far, with the
games still to play at their chances.

**Postseason money** is keyed by bowl and conference so custom conferences can set their own: each bowl
pays its reported 2025-26 amount (`BOWL_PAYOUT`, $750K for any other), and the playoff pays $4M for a first
round or quarterfinal game, $6M for a semifinal or the title game, plus $2M travel. Each conference pools
part of a member's payout (`CONFERENCE_POOL`: 70% in the power conferences, half elsewhere, none for
independents) and splits the pool among all its members. Conference TV money is a per-member payout by
conference (`conferenceMedia`); one-time charges such as exit fees are their own budget line (`charges`).

**Budget classes** come from the roster budget in 2026 dollars: Elite ($30M+), Power ($20M+), Lower power
($12M+), Upper Group of Five ($6M+), Group of Five ($3M+) and Lower Group of Five. In a test dynasty
(`scripts/fortune-check.ts 2 7`) Memphis's roster budget went from $8.4M to $10.3M (+23%) after a 12-2 playoff
season and Wyoming's from $4.4M to $5.6M (+26%) the next year; two runs in a row compound (the unit tests check
it). 16-0 champion Georgia's grew 27%, and losing power programs gave back a few percent (the cap holds their
revenue share; growth of 4% a year is in every number).

## Multi-year deals

A deal for more than one season locks a player in: no renegotiating in December until it ends, and he's much
less likely to enter the portal (walking out on it is a bigger step than leaving a one-year deal). Players
would rather sign for a year and test the market again, so for each season beyond one he wants more a year
(`lengthPremium`: about 8% for most, much more for money-first players, little or nothing for loyal and
homebody players), and players who want much more won't sign one at all (`maxYears`: mercenaries sign one-year
deals only). You can offer one in renewal talks (he answers in a day or two) or on the Payroll page during the
season (he answers at once). Your standing rule signs one-year deals; AI schools' deals still run a season or
two without the lock.

## Front office

**Money > Front office** shows your budget class now and next season, how this season is moving fans,
donors and your AD, and three tabs:

- **Salaries:** every player's pay this season and the next three: paid, signed, locked (🔒), or an estimate
  of what keeping him would cost at what you pay for value now; who's out of eligibility or may leave for the
  NFL; and each season's roster budget against what's committed, with the room left.
- **Projections:** football's budget this year and projected for the next two.
- **History:** each past season's record, postseason, revenue, surplus, crowds, roster budget and class.
