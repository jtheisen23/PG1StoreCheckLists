import type { Daypart, ItemType } from "@prisma/client";

import type { SubSize } from "./sub-weight";

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
