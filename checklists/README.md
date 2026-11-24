# Checklists

Ready-to-import master checklists, in the format Admin → Checklists accepts.

To load one: **Admin → Checklists → Upload or paste**, choose the file, name it,
then **Publish** and give it a schedule.

| File | Items | Scored |
| --- | --- | --- |
| `opening-checklist.csv` | 47 across 3 sections | 46 |
| `daily-sheet.csv` | 119 across 9 sections — 22 to 36 on any one day | 105 |
| `midday-checklist.csv` | 43 across 8 sections | 42 |
| `closing-manager-checklist.csv` | 34 across 4 sections | 33 |
| `closing-grill-checklist.csv` | 28 across 6 sections | 27 |
| `closing-lobby-checklist.csv` | 29 across 4 sections | 28 |
| `dir-of-ops-snapshot.csv` | 46 across 8 sections | 34 |
| `food-safety-audit.csv` | 61 across 16 sections | 55 |
| `facilities-audit.csv` | 229 across 36 sections | 228 |
| `sub-weight-log.csv` | 3 across 1 section | 3 |
| `opening-temp-log.csv` | 14 across 1 section | 13 |
| `midday-temp-log.csv` | 14 across 1 section | 13 |

The three audits were each rebuilt from a completed report exported from the previous platform,
and each reproduces that report's own final score exactly when walked with the
same answers — 94.12, 98.18 and 98.25 respectively. That is the check to repeat
if one of these is ever edited: the score a real past visit produced should not
move.

## Things worth knowing

**Scoring.** Every scored item carries equal weight, matching the old platform.
Photos, free text and dates are recorded but never scored.

**Critical items.** In the food safety audit, the four TCS cold-holding
readings and items 17 and 18 are marked critical: holding food above 41°F fails
the audit outright, whatever the percentage says. Nothing else is marked
critical, because the exported reports do not say which items the old platform
counted as highest risk.

**Failures raise work.** A failed item asks for a reason and opens a corrective
action naming the section it came from, so "Walls" arrives as
"Mop Sink/Bucket — Walls". A photo is offered on any failure but is not
required; add `yes` in the `photo on fail` column to make it compulsory.

**Not carried over**, because the app records them itself: store number, final
score, who conducted the audit, and the date. The facilities audit also ended
by emailing the submission to a named address; add that address to the
checklist's email recipients in Admin → Checklists.

## PG1's daily set

`opening-checklist.csv`, `daily-sheet.csv`, `midday-checklist.csv` and the three
closing checklists (manager, grill, lobby) are PG1's own paper sheets, line for
line and in the same order. The wording is lightly tidied — sentence case, the
obvious typos fixed — and the sheet's sub-headings become a prefix on the lines
under them ("Bathroom — wipe walls & baseboards"). Section titles carry their
times the way the walkthrough writes them ("Meat Case 8:15–8:30p"), and the
"starting at" notes sit on the section's first line. Each sheet's "manager
sign-off required" line is a signature at the end; the store, date and the
person walking it are recorded by the app.

**The Daily Sheet is one checklist, not seven.** Its last-night's-close note and
the opener evaluation are the same every morning; its cleaning and maintenance
focus is a section per weekday, with the `days` column saying which. A walk asks
only today's focus on the store's own clock, and the server holds the walk to
the same day. Edit the opener evaluation once and every day has it.

Every line on the task lists is a Done / Not done check, and the opener
evaluation is Pass / Fail with a note asked for on a Fail. None of them raises a
corrective action — a missed task is what the next morning's close rating and
the opener evaluation are for. Change any line in the checklist builder.

Link the closing checklists to the areas under Admin → Close rating — the
manager's, grill and lobby closes to the frontline, grill and backroom areas
they cover — so the opener sees who closed each one and when.

## The sub weight log

`sub-weight-log.csv` is three sub weighings. Schedule it twice a day — at
Lunch and at Dinner — for the six daily weighings; each run counts towards the
store's completion like any other checklist. A weighing picks the sub and size
from Admin → Sub specs and is judged on the spot: under spec, acceptable (spec
to spec + 0.5 oz) or over. A sub with no spec weight is logged but not judged.
Missing spec raises no corrective action — the weekly Sub weights page is
where light and heavy stores show up.

## Temp logs

`opening-temp-log.csv` and `midday-temp-log.csv` are two checklists, not one,
so each can be scheduled at its own daypart and shows on Today as its own
line. Both are the Dunkirk Afternoon Temperature Log from the previous
platform, line for line and in the same order: walk-in, freezer, grill top,
three sandwich units, steam table, meat case, drop-in, soda case, the digital
line's meat cooler and drop-in, and the manager's initials as a signature at
the end. The location line is dropped — the app records the store. The
opening sheet is the same as the afternoon one, so the two logs are identical
apart from when they are taken; change a line in one and change it in the
other.

Ranges are the sheet's own, which are tighter than the food safety audit's in
two places: the freezer is 0°F to -10°F and the grill top 350°F ± 5°. The
sheet's single steam table line gave two targets — water 195°F, product
135°F — so it is two readings here, each judged against its own.

Every reading must be in range (passing score 100). Cold holding at 41°F or
below and steam-table product at 135°F or above are critical: missing either
fails the log outright. The freezer, grill top, steam-table water and soda
case are judged but not critical. An out-of-range reading asks for a note and
opens a corrective action; a photo is offered but not required.

The checklist is shared by every store, so equipment one store lacks is
answered N/A rather than left out: the third sandwich unit is optional, as on
the sheet, and a store without a digital line marks those two lines N/A.
