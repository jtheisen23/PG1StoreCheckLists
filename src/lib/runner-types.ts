import type { Daypart, ItemType } from "@prisma/client";

import type { SubSize, WeightSummary } from "./sub-weight";

export interface RunnerItem {
  id: string;
  label: string;
  helpText: string | null;
  type: ItemType;
  required: boolean;
  critical: boolean;
  weight: number;
  requirePhoto: boolean;
  photoOnFail: boolean;
  noteOnFail: boolean;
  /** A failure raises a corrective action — said on screen when it happens. */
  actionOnFail: boolean;
  minValue: number | null;
  maxValue: number | null;
  unit: string | null;
  options: string[];
  failingOptions: string[];
}

export interface RunnerSection {
  id: string;
  title: string;
  helpText: string | null;
  items: RunnerItem[];
}

/** A sub the scale can be told about. Sent with the walk so it works offline. */
export interface RunnerSubSpec {
  id: string;
  number: string;
  name: string;
  size: SubSize;
  specOz: number | null;
}

export interface RunnerTemplate {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  passingScore: number | null;
  sections: RunnerSection[];
  /** Present when the checklist has sub weighings. */
  subSpecs?: RunnerSubSpec[];
  /** This store's week at the scale so far, shown under a weight log. */
  subWeightWeek?: { from: string; to: string; summary: WeightSummary };
}

export interface RunnerContext {
  locationId: string;
  locationName: string;
  locationCode: string;
  timezone: string;
  scheduleId: string | null;
  scheduleName: string;
  daypart: Daypart;
  dueTime: string;
}

/** One of the store's checklists today, for moving between them mid-shift. */
export interface RunnerNavEntry {
  href: string;
  name: string;
  /** "Due by 10:00", "Done · Ava Reyes", "Overdue · due by 10:00". */
  detail: string;
  done: boolean;
  overdue: boolean;
  current: boolean;
}

/**
 * Where the walk sits in the store's day. Built on the server and passed in,
 * so the runner never fetches it — and links simply go nowhere new offline.
 */
export interface RunnerNav {
  backHref: string;
  /** "Fri Nov 13", on the store's own clock. */
  dateLabel: string;
  /** Everything due at the store today, this walk included. */
  today: RunnerNavEntry[];
  /** The same checklist at its other times today: Opening, Midday, Close. */
  tabs: { href: string; label: string; done: boolean; current: boolean }[] | null;
}
