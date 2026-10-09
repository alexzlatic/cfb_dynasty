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
only change from the day the league started counts (development speed has always followed today's weight
room, practice fields and medical grades). See [Facility projects](#facility-projects).

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

## Facility projects

**Money > Budget > Facilities** shows each area against the conference and the country. Pick one to see every
project you could take to your AD before you commit (`facilities.ts`):

- **Scope.** A renovation adds a grade in a year (two for a top grade) and the space stays open. A new building
  adds two grades for less than two renovations, takes two years (three for a top grade), and the old space is
  closed while it goes up, so the area plays a grade lower until it opens.
- **Cost.** A top-grade facility at a power program costs about what recent ones did (`TOP_COST`): practice
  fields and an indoor facility $60M (Mississippi State's, opening 2028), weight room $22M (Michigan's $21M
  performance center), academic support $20M, medical $18M (Michigan's $14.8M performance and medicine
  center), locker room $15M (Michigan's $14M expansion). Lower grades cost less (grade^1.6) and Group of Five
  schools build smaller for about 45% (Troy's 2025 indoor facility cost $11.6M, Coastal Carolina's $20M).
  The estimate has a range: the real cost is set when the AD approves it, usually a little over (median +4%
  for a renovation, +7% for a new building, a wider spread for the building).
- **Financing.** Pay cash (football pays it while it's built), borrow (bonds: football pays 8% of the cost a
  year for 20 years at 5%, about 1.6 times the cost in all), or run a donor campaign: boosters give about 45% at
  a power program and 30% elsewhere, more at a big name and when they're happy, and football pays the rest in
  cash. 30% of the gift is money boosters would have given the collective, taken from its base over the build.
- **What it does** (judgment calls; studies find facilities move development and winning only a little and
  recruits more): development speed +8% per grade of the weight room, practice and medical average (about
  +0.06 overall a player a year per grade in one area); injured players back 6% sooner per medical grade gained;
  +0.1 hidden chemistry a unit per locker-room grade gained (about 0.3 points a game); recruits rate the school
  0.1 higher per grade gained in the locker room or academic support (about 8% likelier to pick you over an
  equal school), on top of what development speed already adds.
- **Your AD's answer** comes in one to three days (a news item; the inbox can show it). The AD approves when
  football's surplus covers this year's payment, facility payments in any year stay under 15% of football's
  revenue, fewer than two projects are underway, and for a campaign, boosters are no more than 15% below normal.
  The screen shows the AD's view before you propose.

The Budget tab's charts: football's revenue, expenses and surplus by season (history and four projected
years), where the money comes from and goes, ticket money and crowd against price for each home game, grades
against the conference, football's surplus with and without a project, and scheduled payments by year.
AI schools don't start projects yet.
