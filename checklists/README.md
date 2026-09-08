# Checklists

Ready-to-import master checklists, in the format Admin → Checklists accepts.

To load one: **Admin → Checklists → Upload or paste**, choose the file, name it,
then **Publish** and give it a schedule.

| File | Items | Scored |
| --- | --- | --- |
| `dir-of-ops-snapshot.csv` | 46 across 8 sections | 34 |
| `food-safety-audit.csv` | 61 across 16 sections | 55 |
| `facilities-audit.csv` | 229 across 36 sections | 228 |

Each was rebuilt from a completed report exported from the previous platform,
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
by emailing the submission to a named address; this app has no email
notifications.
