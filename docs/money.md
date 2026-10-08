# Money (M2)

Every FBS program has a budget, and you pay your roster. Money reaches the field only through the hidden
scores from M1 (chemistry now; development and injuries once facility upgrades open), never as a direct
ratings boost.

## Paying players

Two kinds of money reach players, kept apart as the House settlement does.

- **Revenue share (yours).** The school pays players directly under a cap of $20.5M in 2025-26 for all
  sports, growing 4% a year ($21.32M in 2026-27). Football gets 75% of it. Every power-conference school and
  Notre Dame pays the full amount, and other schools pay a share that grows with prestige. Each AD signs its
  roster at the start (`aiContracts`): every player gets the same share of his value, never more than his
  value. You sign, change or end your players' deals with `sign_contract` (dollars a year, seasons up to his
  eligibility), and your payroll can't go over football's budget.
- **Collective NIL (the boosters').** Each collective has a normal year sized by conference and prestige: the
  biggest spend $20M or more, a typical power school under $10M, most Group of Five schools $1-2M. It fills
  each player's gap to his value (starters first, your focus positions first), then buys stars with what's
  left. It holds 15% back, donors add to it or take from it after wins or losses beyond expectations, and it
  spends on the first of each month in the season. You steer it toward up to three positions
  (`set_collective_focus`).
- **Fair-market-value review.** Every deal goes through a review like the College Sports Commission's NIL Go:
  anything above 1.6 times a player's value plus $25K is cut back to that. About 1% of AI deals are cut, all at
  the top of the market.

A player's **value** (`playerValue` in `money.ts`) is what the national market pays a player like him in a
year, revenue share and NIL together. It depends on position and overall rating, with a soft ceiling (a
75-overall starting QB is worth $900K, an elite one up to $6.5M). Young players are worth at least their
recruiting hype, which fades over two years.

## Morale

Each Monday every player weighs his pay against what his school pays for value across its roster, and his
playing time against his worth (`morale.ts`). Three things hurt: a starter paid well below that, a player
whose value says he should start sitting on the bench, and a backup paid more than the starters at his
position. Morale moves 30% of the way toward how he feels each week, and it is saved for the transfer
portal in M3. A unit's starters' morale moves its chemistry, measured against the rest of the country so the
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
