# Conferences

A league starts with the real 2026 conferences or with your own (New league > Conferences > Custom).
`core/src/conferences.ts` holds the model; the league keeps it in `state.conferences` and
`state.tie_ins`, and `Season` places every team from it (`placeTeams`), so a team's `conference`,
`division` and `power` always match the league's conferences.

## What a conference sets

| field | meaning |
|---|---|
| `tier` | `power` plays like the P4 (money, recruiting reach, neutral-site title game), `group` like the Group of Five, `independent` has no conference play |
| `members` | FBS team ids; every FBS school is in exactly one conference (independents included) |
| `divisions` | two divisions whose winners meet in the title game, or null for the top two |
| `title_game` | plays a title game (with the league's title-game setting on); otherwise the standings leader is champion |
| `conf_games` | conference games per member |
| `cfp_bids` | playoff spots kept for the conference's best teams in the committee's ranking, before the champions' automatic bids and the at-large picks |

Tie-ins map each bowl to two sides, each a list of conference names (empty = at-large). Bowls the
setup leaves out keep their real tie-ins, minus conferences the league doesn't have. Finance code can
read a bowl's conferences from `Season.bowlSlate()` and a school's conference and tier from its team.

## Schedules

A conference whose members or number of conference games differ from the real one gets a new
conference schedule (`conferenceSchedule`); the rest keep their real 2026 games. Its real conference
games in the busy weeks are dropped (late games such as Army-Navy stay), schools without room drop
non-conference games (mid-season first, their last game last), and a randomized greedy fills each
week, tightest schools first, division mates first, no repeat opponents, home and away kept even.
Schools that lost games then play each other in shared open weeks, up to their old count (at most 12).

## Rules

Not every setup can start a league: every conference needs 4+ schools, conference games at most
members - 1, guaranteed playoff spots no more than the field, and with the Protect College Sports Act
on, at most 20 schools (`PCSA_CAP`).

## Realignment between seasons

Chosen when a league starts (`settings.realignment`, fixed after that); `core/src/realign.ts`, run in
`Season.nextSeason` before the schedule is built, so any conference that changed gets a new
conference schedule.

- **market** (default). Each school has a media score: 1.6 x brand + 0.8 x log10(crowd / 20k) +
  three-season winning percentage + 0.25 per playoff trip (up to three). Each conference has a TV deal
  (`state.realign.deals`) that pays every member the same: the real 2025-26 payouts at the start,
  ending on the real deals' approximate dates. When a deal runs out it renews for 6-8 seasons at
  `old payout x exp(b x (average score now - average score at signing))`, with `b` fit across the real
  conferences at the start (about 2.6). A conference paying $15M+ a school plays as a power conference,
  and one paying under $10M drops to Group of Six.
  A conference whose deal ends within two seasons, or that just lost schools, invites up to two schools
  that would lift its average score (by 0.05, plus 0.05 per member past 16, plus 0.15 per 1,000 miles
  from its centroid), up to 20 schools with the Act and 24 without. A school accepts when the raise beats its
  exit fee (two years' payout leaving mid-deal, half a year at the end) and is at least 15% (Group of Six),
  30% (power) or 50% (independents). Moves are announced after a season and take effect a season
  later; a school that moved stays put for four seasons. A conference that loses schools and falls below 8
  folds, and its schools join the nearest conference with room.
- **promotion**. After every season, the last-place school over two seasons in each power conference
  swaps with the best Group of Six school (power conferences pick in name order).
- **fixed**. Conferences never change on their own.

**Commissioner mode** (`settings.commissioner`, off by default, can be turned on in Settings) lets you
rewrite the conferences on League > Conferences before a season's first game (`set_conferences` action).

Schools get their conference's payout as TV money in the budget (`Team.media`); independents keep their
own deals.
