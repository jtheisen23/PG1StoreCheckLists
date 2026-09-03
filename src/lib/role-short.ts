import type { Role } from "@prisma/client";

/** Compact role names for dense lists and dropdowns. */
export const ROLE_SHORT: Record<Role, string> = {
  ADMIN: "Admin",
  REGIONAL: "RD",
  DISTRICT: "DM",
  GM: "GM",
  MANAGER: "Manager",
  STAFF: "Team",
};
