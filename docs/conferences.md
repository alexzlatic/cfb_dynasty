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

## Next

Realignment over seasons (Alex, 2026-10-08): a market model by default (media value, TV-deal cycles,
invites, collapses), promotion and relegation as an option at league start, and a commissioner mode
that is off unless turned on.
