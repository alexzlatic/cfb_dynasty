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
