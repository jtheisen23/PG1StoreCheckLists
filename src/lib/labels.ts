import type {
  ActionPriority,
  ActionStatus,
  Daypart,
  ItemType,
} from "@prisma/client";

export const DAYPART_LABELS: Record<Daypart, string> = {
  OPENING: "Opening",
  MORNING: "Morning",
  LUNCH: "Lunch",
  AFTERNOON: "Afternoon",
  DINNER: "Dinner",
  CLOSING: "Closing",
  OVERNIGHT: "Overnight",
  ANYTIME: "Anytime",
};

export const ACTION_STATUS_LABELS: Record<ActionStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  VERIFIED: "Verified",
  CANCELLED: "Cancelled",
};

export const ACTION_PRIORITY_LABELS: Record<ActionPriority, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  CHECKBOX: "Checkbox",
  PASS_FAIL: "Pass / Fail",
  NUMBER: "Number",
  TEMPERATURE: "Temperature",
  TEXT: "Text",
  SELECT: "Single choice",
  MULTISELECT: "Multiple choice",
  PHOTO: "Photo",
  SIGNATURE: "Signature",
  RATING: "Rating",
};

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
