import { test } from "node:test";
import assert from "node:assert/strict";

import {
  dayOfWeekOf,
  describeWeekdays,
  formatWeekdays,
  normaliseDays,
  parseWeekdays,
  runsOn,
} from "../src/lib/weekdays";

test("a section with no days runs every day; otherwise only on its days", () => {
  assert.equal(runsOn([], 3), true);
  assert.equal(runsOn(null, 0), true);
  assert.equal(runsOn([5], 5), true, "Friday's focus on a Friday");
  assert.equal(runsOn([5], 1), false, "but not on a Monday");
});

test("the business date decides the day, not the server's clock", () => {
  assert.equal(dayOfWeekOf("2026-11-20"), 5, "Fri Nov 20, 2026");
  assert.equal(dayOfWeekOf("2026-11-23"), 1, "Mon Nov 23, 2026");
});

test("days are read the way people write them on a sheet", () => {
  assert.deepEqual(parseWeekdays("Monday").days, [1]);
  assert.deepEqual(parseWeekdays("Mondays").days, [1]);
  assert.deepEqual(parseWeekdays("mon, wed & fri").days, [1, 3, 5]);
  assert.deepEqual(parseWeekdays("Tue/Thu").days, [2, 4]);
  assert.deepEqual(parseWeekdays("Mon - Fri").days, [1, 2, 3, 4, 5]);
  assert.deepEqual(parseWeekdays("Fri to Mon").days, [0, 1, 5, 6], "a range wraps through the weekend");
  assert.deepEqual(parseWeekdays("weekdays").days, [1, 2, 3, 4, 5]);
  assert.deepEqual(parseWeekdays("Weekends").days, [0, 6]);
  assert.deepEqual(parseWeekdays("Sat and Sun").days, [0, 6]);
  assert.deepEqual(parseWeekdays("Thurs.").days, [4]);
});

test("blank, daily and all seven all mean every day", () => {
  assert.deepEqual(parseWeekdays("").days, []);
  assert.deepEqual(parseWeekdays("Daily").days, []);
  assert.deepEqual(parseWeekdays("every day").days, []);
  assert.deepEqual(parseWeekdays("Mon-Sun").days, []);
  assert.deepEqual(normaliseDays([6, 1, 1, 9]), [1, 6]);
});

test("anything that is not a day is said so, not guessed", () => {
  assert.match(parseWeekdays("Funday").error ?? "", /not a day/);
  assert.match(parseWeekdays("Mon-Someday").error ?? "", /not a day/);
});

test("described for people, and written so the importer reads it back", () => {
  assert.equal(describeWeekdays([]), "Every day");
  assert.equal(describeWeekdays([5]), "Fridays");
  assert.equal(describeWeekdays([1, 2, 3, 4, 5]), "Weekdays");
  assert.equal(describeWeekdays([0, 6]), "Weekends");
  assert.equal(describeWeekdays([0, 1, 3]), "Mon, Wed, Sun");
  for (const days of [[], [1], [0, 6], [1, 3, 5], [2, 4, 6, 0]]) {
    assert.deepEqual(parseWeekdays(formatWeekdays(days)).days, normaliseDays(days));
  }
});
