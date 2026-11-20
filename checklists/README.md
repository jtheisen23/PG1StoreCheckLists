# Checklists

Ready-to-import master checklists, in the format Admin → Checklists accepts.

To load one: **Admin → Checklists → Upload or paste**, choose the file, name it,
then **Publish** and give it a schedule.

| File | Items | Scored |
| --- | --- | --- |
| `dir-of-ops-snapshot.csv` | 46 across 8 sections | 34 |
| `food-safety-audit.csv` | 61 across 16 sections | 55 |
| `facilities-audit.csv` | 229 across 36 sections | 228 |
| `afternoon-checklist.csv` | 50 across 7 sections | 45 |
| `closing-checklist.csv` | 140 across 21 sections | 136 |
| `sub-weight-log.csv` | 3 across 1 section | 3 |

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

## The daily checklists

`afternoon-checklist.csv` and `closing-checklist.csv` were converted from the
previous platform's Afternoon and Closing forms, item for item and in the same
order. The two-level headings there ("Clean up & restock 5:00–8:45 PM" → "Front
line" → "Meat case") become one section each here — "Front line · Meat case",
"Shutdown · Back line" — and the time windows are in each checklist's
description. Every Yes / No item is a Done / Not done check.

They are task lists rather than audits, so a "Not done" asks the person why
but neither demands a photo nor raises a corrective action: a missed closing
task is what the next morning's close rating is for, and an action for each of
140 lines would bury the ones that matter. Change any item in the checklist
builder if it deserves more. Link the closing checklist to the areas under
Admin → Close rating so the opener sees who closed and when.

## The sub weight log

`sub-weight-log.csv` is three sub weighings. Schedule it twice a day — at
Lunch and at Dinner — for the six daily weighings; each run counts towards the
store's completion like any other checklist. A weighing picks the sub and size
from Admin → Sub specs and is judged on the spot: under spec, acceptable (spec
to spec + 0.5 oz) or over. A sub with no spec weight is logged but not judged.
Missing spec raises no corrective action — the weekly Sub weights page is
where light and heavy stores show up.
