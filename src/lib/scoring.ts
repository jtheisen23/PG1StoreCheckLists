import type { ItemType } from "@prisma/client";

export interface ScorableItem {
  id: string;
  type: ItemType;
  required: boolean;
  critical: boolean;
  weight: number;
  minValue: number | null;
  maxValue: number | null;
  failingOptions: string[];
}

export interface ScorableAnswer {
  itemId: string;
  boolValue?: boolean | null;
  numericValue?: number | null;
  value?: string | null;
  selected?: string[];
  naFlag?: boolean;
}

/**
 * Decides pass/fail for a single answer.
 * `null` means the item is not scored (N/A, or a free-text/photo prompt).
 */
export function evaluateAnswer(
  item: ScorableItem,
  answer: ScorableAnswer | undefined,
): boolean | null {
  if (!answer || answer.naFlag) return null;

  switch (item.type) {
    case "CHECKBOX":
    case "PASS_FAIL":
      return answer.boolValue ?? null;

    case "NUMBER":
    case "TEMPERATURE": {
      const n = answer.numericValue;
      if (n === null || n === undefined || Number.isNaN(n)) return null;
      if (item.minValue !== null && n < item.minValue) return false;
      if (item.maxValue !== null && n > item.maxValue) return false;
      return true;
    }

    case "RATING": {
      const n = answer.numericValue;
      if (n === null || n === undefined) return null;
      // A rating passes at or above the configured floor, defaulting to 3/5.
      const floor = item.minValue ?? 3;
      return n >= floor;
    }

    case "SELECT":
    case "MULTISELECT": {
      const chosen = answer.selected ?? [];
      if (!chosen.length) return null;
      if (!item.failingOptions.length) return true;
      return !chosen.some((c) => item.failingOptions.includes(c));
    }

    case "TEXT":
    case "PHOTO":
    case "SIGNATURE":
      // Informational: answered is enough, never scored.
      return null;

    default:
      return null;
  }
}

export interface ScoreResult {
  score: number | null;
  passed: boolean;
  itemsTotal: number;
  itemsPassed: number;
  itemsFailed: number;
  criticalFailure: boolean;
}

/**
 * Weighted score across every scored item. A failed critical item drops the
 * whole submission regardless of the numeric score.
 */
export function scoreSubmission(
  items: ScorableItem[],
  answers: ScorableAnswer[],
  passingScore: number | null,
): ScoreResult {
  const byItem = new Map(answers.map((a) => [a.itemId, a]));

  let weightTotal = 0;
  let weightEarned = 0;
  let itemsTotal = 0;
  let itemsPassed = 0;
  let itemsFailed = 0;
  let criticalFailure = false;

  for (const item of items) {
    const result = evaluateAnswer(item, byItem.get(item.id));
    if (result === null) continue;

    const weight = Math.max(1, item.weight);
    weightTotal += weight;
    itemsTotal += 1;

    if (result) {
      weightEarned += weight;
      itemsPassed += 1;
    } else {
      itemsFailed += 1;
      if (item.critical) criticalFailure = true;
    }
  }

  const score =
    weightTotal > 0 ? Math.round((weightEarned / weightTotal) * 1000) / 10 : null;

  const threshold = passingScore ?? 0;
  const passed =
    !criticalFailure && (score === null || score >= threshold);

  return { score, passed, itemsTotal, itemsPassed, itemsFailed, criticalFailure };
}

/** Human-readable answer for exports, logs and list views. */
export function formatAnswer(
  item: Pick<ScorableItem, "type" | "id"> & { unit?: string | null },
  answer: ScorableAnswer | undefined,
): string {
  if (!answer) return "—";
  if (answer.naFlag) return "N/A";

  switch (item.type) {
    case "CHECKBOX":
      return answer.boolValue ? "Done" : "Not done";
    case "PASS_FAIL":
      return answer.boolValue ? "Pass" : "Fail";
    case "NUMBER":
    case "TEMPERATURE":
      return answer.numericValue === null || answer.numericValue === undefined
        ? "—"
        : `${answer.numericValue}${item.unit ? ` ${item.unit}` : ""}`;
    case "RATING":
      return answer.numericValue ? `${answer.numericValue} / 5` : "—";
    case "SELECT":
    case "MULTISELECT":
      return answer.selected?.length ? answer.selected.join(", ") : "—";
    default:
      return answer.value?.trim() || "—";
  }
}
