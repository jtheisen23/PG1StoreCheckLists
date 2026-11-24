/**
 * A reading drawn against its band: how a temperature, or any number with
 * limits, is shown on the walk. Pure, so the picture and the words are tested.
 * Whether a reading passes is still decided in `scoring.ts`; this only says
 * where it sits and how far out it is.
 */

export interface ReadingScale {
  /** The left end of the drawn bar, below the band. */
  lo: number;
  /** The right end of the drawn bar, above the band. */
  hi: number;
}

/**
 * The bar runs half the band's width past each end (at least one unit), so a
 * 33–41 °F fridge draws from 29 to 45: room to show a reading that is out,
 * without the band shrinking to a sliver.
 */
export function readingScale(min: number | null, max: number | null): ReadingScale | null {
  if (min === null || max === null || !(max > min)) return null;
  const pad = Math.max(1, Math.floor((max - min) / 2));
  return { lo: min - pad, hi: max + pad };
}

/** Where a value sits on the scale, as a percentage, pinned to the ends. */
export function positionOn(scale: ReadingScale, value: number): number {
  const at = ((value - scale.lo) / (scale.hi - scale.lo)) * 100;
  return Math.min(100, Math.max(0, at));
}

/** "°F" reads as "7°" in a difference; any other unit is spelled after it. */
function amount(value: number, unit: string | null): string {
  const n = formatNumber(value);
  if (!unit) return n;
  return unit.trim().startsWith("°") ? `${n}°` : `${n} ${unit.trim()}`;
}

export function formatNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}

/** The short form for the ends of the bar: "29°", "6.5 ppm". */
export function tickLabel(value: number, unit: string | null): string {
  return amount(value, unit);
}

/** "33 – 41 °F", "at least 160 °F", or null when there are no limits. */
export function rangeLabel(min: number | null, max: number | null, unit: string | null): string | null {
  const u = unit?.trim() ? ` ${unit.trim()}` : "";
  if (min !== null && max !== null) return `${formatNumber(min)} – ${formatNumber(max)}${u}`;
  if (min !== null) return `at least ${formatNumber(min)}${u}`;
  if (max !== null) return `at most ${formatNumber(max)}${u}`;
  return null;
}

export interface ReadingVerdict {
  inRange: boolean;
  /** "In range", "7° above the band", "3° under the minimum". */
  text: string;
}

export function describeReading(
  value: number | null | undefined,
  min: number | null,
  max: number | null,
  unit: string | null,
): ReadingVerdict | null {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  const both = min !== null && max !== null;
  if (min !== null && value < min) {
    return { inRange: false, text: `${amount(min - value, unit)} below ${both ? "the band" : "the minimum"}` };
  }
  if (max !== null && value > max) {
    return { inRange: false, text: `${amount(value - max, unit)} above ${both ? "the band" : "the maximum"}` };
  }
  if (min === null && max === null) return { inRange: true, text: "Logged" };
  return { inRange: true, text: "In range" };
}

export interface ReadingEntry {
  /** What the box shows, kept as typed so "-" and "4." survive a keystroke. */
  text: string;
  /** The number it means, or null until it means one. */
  value: number | null;
}

/**
 * What someone typed into a reading box. A minus counts only at the start;
 * the minus sign (−) and a decimal comma, which some keypads send, are read
 * as "-" and "."; anything else is dropped. "-" on its own is a reading on its
 * way, not a reading, so it means nothing yet rather than zero.
 */
export function readingEntry(raw: string): ReadingEntry {
  const cleaned = raw.replace(/−/g, "-").replace(/,/g, ".").replace(/[^\d.-]/g, "");
  const negative = cleaned.startsWith("-");
  const [whole, ...fraction] = cleaned.replace(/-/g, "").split(".");
  const digits = fraction.length ? `${whole}.${fraction.join("")}` : whole;
  const text = `${negative ? "-" : ""}${digits}`;
  const value = /\d/.test(text) ? Number(text) : null;
  return { text, value: value !== null && Number.isFinite(value) ? value : null };
}

/**
 * The +/− key. A phone's number keypad has no minus, and a freezer reads below
 * zero, so the sign is a key of its own: it flips what is typed, or starts a
 * negative reading in an empty box.
 */
export function flipSign(text: string): ReadingEntry {
  return readingEntry(text.startsWith("-") ? text.slice(1) : `-${text}`);
}

/**
 * Whether a reading gets the +/− key: when its band reaches zero or below (a
 * freezer, "0°F or below", "-10 – 0 °F"), or it has no band to say. A cooler,
 * a grill or a steam table never reads below zero, and on a phone the key is
 * room taken from the line's name.
 */
export function readsBelowZero(min: number | null, max: number | null): boolean {
  if (min === null && max === null) return true;
  if (min !== null) return min <= 0;
  return max! <= 0;
}

/** How a saved reading shows in the box. */
export function readingText(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value) ? "" : String(value);
}
