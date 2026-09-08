import type { Role } from "@prisma/client";

/**
 * Client-safe role names, in seniority order — the order the dropdown when
 * adding somebody offers them. `permissions.ts` is server-only, so it
 * re-exports these.
 */
export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  PRESIDENT: "President",
  VICE_PRESIDENT: "Vice President",
  DIRECTOR_OF_OPS: "Director of Operations",
  REGIONAL: "Regional Director",
  DISTRICT: "District Manager",
  OPERATOR: "Operator",
  GM: "General Manager",
  MANAGER: "Shift Manager",
  STAFF: "Team Member",
};
