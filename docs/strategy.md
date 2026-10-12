# Strategy

The Strategy menu gathers every call about where your staff's time and money go. Each line has its own
screen to fine-tune it.

## The staff's week (Overview)

About 160 staff hours a week split five ways (`StaffTime`, core `staff.ts`). The usual in-season week:

| Share | Usual | What it buys | Screen |
| --- | --- | --- | --- |
| Recruiting | 30% | Contact hours with prospects (more at power programs) | Big board |
| Scouting prospects | 10% | Evaluation trips and regional hours | Scouting |
| Player development | 10% | The pace of individual development plans (`labPace`: none at 0%, about 1.4x at 20%, 1.6x at most) | Development |
| Practice and game plan | 35% | What a week of preparation is worth (`prepFactor`) | Game plan |
| Opponent film | 15% | Film hours on the next opponent | Game plan (film room) |

Out of season there is no game to prepare for and plans run at their usual pace, so the same split is
recruiting and scouting only. A split saved before development had its own share gives development its
usual 10% out of practice, so old leagues play exactly as before. Plans keep a running tally of their work
(`LabPlan.work`, updated each morning), so a change to the week only changes the pace from that day on.

## The staff room

Recruiting > Staff room lays the same week out coach by coach (core `room.ts`). Each coach (head coach,
coordinators, special teams) holds his 40 flexible hours (24 at FCS schools), and your recruiting staffers
share one desk at 16 hours each. Every hour is a line on someone's card:

| Line | Who | Hours |
| --- | --- | --- |
| Recruit a prospect | anyone | you set them (6 to start); 10 a week on one prospect at most, all lines together |
| Upkeep on a group | anyone | spread evenly over the group: your commits, one class of commits, or the rest of your big board (prospects without their own line). New commits join on their own |
| Official visit | a coach hosts | 6 on the host and 2 on the head coach (8 if he hosts), that week only |
| Home visit | head coach | 6 near, 10 far, that week only |
| Scout a player | coaches | the trip's hours while trips are left |
| Work a region / General scouting | anyone | you set them |
| Practice, Opponent film, Development | coaches | in season only |

Each line runs all year, in season, out of season, or this week only (the chip on the line cycles through
them). A coach can't take a line past his hours; one over his week (a job left open) gives what he has in
proportion, and an open job gives nothing. The split on the Overview is the sum of the lines, and each
area's hours are worth the skill of the coaches giving them (recruiting with your recruiting coaches'
recruiting skill, and so on).

A prospect's lead recruiter is the coach with the most contact hours on him. When that coach leaves
(fired, or hired away in the carousel) the prospect keeps three quarters of his interest in you
(`LEAD_KEEP`) and you get a mail. Prospects and regions sent from the big board, a prospect's page or the
map wait in Unassigned until you drag or assign them to a coach; "Fill open hours" gives each coach's free
hours to the best prospects on your board, his own side of the ball first.

Opening the room is one-way for a league: it starts from the week you had (the same split and the same
contact and region hours), the staff no longer runs the board for you, and the Overview's share sliders
become a read-out. Pitch-page hours, scouting trips and region hours keep working and go through the
room. Action: `staff_room` (`open`, `add`, `set`, `when`, `move`, `remove`, `tray`, `fill`); API
`GET /api/leagues/:id/recruiting/room`.

## Scouting

Your scouting hours each week (the scouting share of the week) go first to trips, in list order, then to
the regions you put hours into, which share what's left.

- **Players.** Send scouts to see a prospect for a number of trips (1 to 10; "every week" keeps going). Each
  trip is a look that narrows your read (recruiting.md), costs 6 hours and $2.5K near home or 9 hours and
  $7.5K farther away. When the last trip is done they file a report: how your read moved since the assignment
  started, how it compares with the service, and his latest high school line.
- **Regions.** Your own staff's weekly hours in a region. At 8 a week they look there as hard as a paid
  regional scout (`regionArea`), more up to 12. Every 24 hours they file a report: the best prospects they
  saw there (sophomores and up, not committed elsewhere, not on an earlier report from that region), then up
  to three nobody rates or the service underrates. They turn up prospects your staff didn't know, the best
  most often (`reportSees`); those join the prospects you know.
- **Regional scouts** ($95K a year) still work a region all year, as before.

Reports stay with your recruiting state (the last 60), not the league news, which every coach in an online
league can read.
