import type { Role } from "@prisma/client";

/** Client-safe role names. `permissions.ts` is server-only, so it re-exports these. */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  REGIONAL: "Regional Director",
  DISTRICT: "District Manager",
  GM: "General Manager",
  MANAGER: "Shift Manager",
  STAFF: "Team Member",
};
