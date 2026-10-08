# Opponent scouting

Every week in season, the staff spends part of its hours on film of the next opponent. The split is under
Recruiting > Staff and scouting. The usual week is 30% recruiting, 10% scouting prospects, 45% practice and
the game plan, and 15% opponent film. Film builds in the six days before your game. Each hour is worth more
with a better scouting staff (`filmEff`: 0.6 to 1.4). Every staff also knows a little about any team before the
week starts (`BASE_FILM`, 6 hours).

Knowledge runs from 0 to 1: `1 - exp(-hours / 35)`. An average staff in a usual week (6 + 24 hours) reaches
about 0.58. Spending the whole week on film reaches about 0.98. AI staffs always scout at the usual split with
their own skill.

## What the staff finds

`scouting.ts tendencies` lists everything there is to find on a team, and `insights` decides how much of it a
given knowledge level shows:

- **Down and distance.** The three situations where the offense runs or throws most unlike other teams, from
  its real play-calling (the engine's pass tendencies). For example: "Runs on 76% of 3rd and short (most teams
  48%). Stacking the box is the counter."
- **The offense's scheme.** Calls it leans on (the option's quarterback keeps), the defensive call that
  answers it best, and the call it punishes ("Option gashes man press").
- **The front.** What its coordinator calls more than most (a 3-3-5 blitzes) and the offensive answer
  ("Screens punish it").
- **Who gets the ball.** A feature back or a go-to receiver.

The plainest tendencies are found first, and subtle ones need more film. Below 0.8 knowledge the opponent's
numbers are blurred ("about 70%"). Counters come from the game's own matchup model (`calls.ts COUNTERS`),
so the advice is what actually works in the sim. The game plan screen shows the report under Film room.

## On game day

In your games, each side's coordinators use what their staff knows:

- A defense that knows the offense loads the box where it runs and drops into coverage where it throws, and
  leans toward the calls that counter the offense's scheme.
- An offense that knows the front leans toward what beats it.
- Knowing the other team better than it knows you is also worth a small edge on every snap.

Full knowledge against none is worth about 0.9 points of margin a game (`calls-check.ts scout`: +0.25
scored, -0.63 allowed). There is no real data on what scouting is worth, so this is sized a little under a
full week of practice on both sides of the ball. At the usual split you and an average opponent know each
other about equally well, and the edge is near zero. You gain from out-scouting them, or from a better
scouting staff, and the extra film hours come out of recruiting, prospect scouting and practice.

AI-against-AI games have no play calls, so scouting affects only your games (where both staffs scout).
