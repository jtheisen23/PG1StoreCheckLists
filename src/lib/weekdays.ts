/**
 * Which days a checklist section runs on.
 *
 * The daily sheet is one checklist whose cleaning focus changes with the day —
 * grills on Tuesday, bathrooms on Friday — while the opener's evaluation is the
 * same every morning. Rather than seven copies of a checklist, each section
 * carries the days it runs: none listed means every day. Days are numbered as
 * JavaScript numbers them, Sunday 0 to Saturday 6, and are always the store's
 * own day — `localDayOfWeek` / the business date — never the server's.
 *
 * Pure, so the walk, the server's check of a submitted walk, the Today counts
 * and the import all apply the same rule.
 */

export const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** The order a week is shown in here: Monday first, as PG1's sheets run. */
export const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Does a section with these days run on this day? */
export function runsOn(days: readonly number[] | null | undefined, dayOfWeek: number): boolean {
  return !days || days.length === 0 || days.includes(dayOfWeek);
}

/** The day of the week of a "YYYY-MM-DD" business date. */
export function dayOfWeekOf(dateKey: string): number {
  return new Date(`${dateKey}T00:00:00Z`).getUTCDay();
}

/** Sorted, unique, in range; all seven collapse to "every day" ([]). */
export function normaliseDays(days: readonly number[]): number[] {
  const unique = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort((a, b) => a - b);
  return unique.length === 7 ? [] : unique;
}

const NAMES: Record<string, number> = {
  sun: 0, sunday: 0, su: 0,
  mon: 1, monday: 1, mo: 1,
  tue: 2, tues: 2, tuesday: 2, tu: 2,
  wed: 3, weds: 3, wednesday: 3, we: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4, th: 4,
  fri: 5, friday: 5, fr: 5,
  sat: 6, saturday: 6, sa: 6,
};

const dayName = (token: string): number | undefined => NAMES[token.replace(/\.$/, "").replace(/s$/, "")] ?? NAMES[token.replace(/\.$/, "")];

/**
 * "Monday", "Mon, Wed, Fri", "Mon-Fri", "weekdays", "weekends", "daily" or
 * blank. Forgiving about case, plurals ("Mondays") and separators.
 */
export function parseWeekdays(text: string | null | undefined): { days: number[]; error?: string } {
  const value = (text ?? "").trim().toLowerCase();
  if (!value || /^(daily|every ?day|all( days)?|any|always|7 days)$/.test(value)) return { days: [] };
  if (/^week ?days$/.test(value)) return { days: [1, 2, 3, 4, 5] };
  if (/^week ?ends?$/.test(value)) return { days: [0, 6] };

  // "Mon - Fri", "Mon to Fri" and "Mon–Fri" are all one range token.
  const tokens = value
    .replace(/\s*(?:-|–|—|\bto\b|\bthrough\b|\bthru\b)\s*/g, "-")
    .split(/(?:[\s,;/&+]|\band\b)+/)
    .filter(Boolean);

  const days: number[] = [];
  for (const token of tokens) {
    const range = /^([a-z.]+)-([a-z.]+)$/.exec(token);
    if (range) {
      const from = dayName(range[1]);
      const to = dayName(range[2]);
      if (from === undefined || to === undefined) return { days: [], error: `"${text}" is not a day or range of days.` };
      // Monday first, so "Fri-Mon" wraps through the weekend.
      let i = WEEK_ORDER.indexOf(from as (typeof WEEK_ORDER)[number]);
      for (let guard = 0; guard < 7; guard += 1) {
        days.push(WEEK_ORDER[i]);
        if (WEEK_ORDER[i] === to) break;
        i = (i + 1) % 7;
      }
      continue;
    }
    const day = dayName(token);
    if (day === undefined) return { days: [], error: `"${text}" is not a day of the week.` };
    days.push(day);
  }
  return { days: normaliseDays(days) };
}

/** "Every day", "Weekdays", "Weekends", "Fridays", "Mon, Wed, Fri". */
export function describeWeekdays(days: readonly number[] | null | undefined): string {
  const list = normaliseDays(days ?? []);
  if (list.length === 0) return "Every day";
  const key = list.join(",");
  if (key === "1,2,3,4,5") return "Weekdays";
  if (key === "0,6") return "Weekends";
  if (list.length === 1) return `${WEEKDAY_NAMES[list[0]]}s`;
  return WEEK_ORDER.filter((d) => list.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(", ");
}

/** For the CSV export: a value parseWeekdays reads back to the same days. */
export function formatWeekdays(days: readonly number[] | null | undefined): string {
  const list = normaliseDays(days ?? []);
  if (list.length === 0) return "";
  return WEEK_ORDER.filter((d) => list.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(", ");
}
