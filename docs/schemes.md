# Coordinators' schemes

Every coordinator runs one system. The offensive coordinator picks one of five offenses and the defensive
coordinator one of four fronts. When a school has no coordinator on record, the head coach's system stands in.

| Offense | How it plays |
| --- | --- |
| Air Raid | Four wide receivers and quick rhythm throws. The back has to catch and pass block. |
| Spread RPO | Tempo from the gun with run-pass options. The quarterback's running keeps the box honest. |
| Pro-style | Tight ends and play-action. The quarterback wins from the pocket. |
| Power run | Two tight ends, gap runs and play-action off them. |
| Option | Flexbone or spread option. The quarterback reads the defense on every run. |

| Front | How it plays |
| --- | --- |
| 4-2-5 nickel | Four linemen, two linebackers and a nickel back. Built against the spread. |
| 4-3 | Three linebackers, with a SAM in the nickel slot. Strong against the run. |
| 3-4 | Three two-gap linemen. The outside linebackers rush from the end slots. |
| 3-3-5 odd stack | Three linemen, three stacked linebackers and a hybrid safety (spur). |

`packages/core/src/schemes.ts` holds the definitions.

## What a scheme says

- **Layout.** The compiler has the same eleven slots per side in every scheme. A scheme renames them and says
  which positions can play each one. In a 3-4 the end slots are outside linebackers, so a linebacker can play
  there. In a 3-3-5 one tackle slot is a stack linebacker and the nickel is a spur safety. In a 4-3 the nickel
  slot is the SAM linebacker. A player out of his position plays the slot with stand-in attributes
  (`STAND_IN`: a rushing linebacker uses his blitz rating for pass rush).
- **What it values.** Each scheme sets attribute weights by position, and some slots set their own. A player's
  **scheme rating** is his overall computed with those weights. His **fit** is the scheme rating minus his
  overall. An option quarterback who can run rates higher there than his overall says, and an Air Raid
  tackle is judged mostly on pass blocking.
- **Tendencies.** Each scheme leans off the coordinators' usual mix of calls. The option runs the quarterback
  far more, the Air Raid throws quick and the 3-3-5 blitzes. Opponents scout these leanings.

## Where schemes come from

Nobody publishes coordinators' schemes, so the seed infers them.

- **Offense** comes from how the real offense played in `team_ratings.json`. A pass rate under 27% is the
  option. A pass rate of 47% or more (or 44% at 69.5+ plays a game) is the Air Raid. A run-heavy, slow offense
  is power run. Tempo or a running quarterback makes it spread RPO, and everything else is pro-style. Army,
  Navy, Air Force and Rice come out as the option.
- **Front** comes from the roster's shape: linebacker, safety and tackle shares against the country. Teams fill
  roughly the real FBS mix (45% 4-2-5, 22% 3-4, 18% 4-3, 15% 3-3-5), with seeded noise. A few well-known fronts
  are set by hand in `KNOWN_FRONTS`. These are inferences, not researched facts.
- FCS staffs, and the staff of a school with a new head coach at a rollover, draw from that mix. The academies
  keep the option whoever coaches them. Otherwise schemes carry over from season to season with the staff
  (`SeasonState.schemes`).

## API

- `Season.schemes(teamId)` returns `{ off, def, off_coach, def_coach }`, and `Season.allSchemes()` returns
  every team's.
- `schemeLayout(scheme)` lists each slot with its label and positions. `schemeRating(player, scheme, slot?)`
  returns `{ rating, fit, eligible }`.
- `GET /api/leagues/:id/schemes` returns every scheme definition. The team page includes `schemes`. The depth
  chart route includes `schemes` with each side's layout and each player's rating and fit at every slot he can
  play (`ratings[pid][slot]`).

Schemes have no effect on games yet. The next step wires fit into the hidden layer, lets the compiler read
stand-ins and turns tendencies into the coordinators' call mix.
