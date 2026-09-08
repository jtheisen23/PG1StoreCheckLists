import type { Role } from "@prisma/client";

/** Compact role names for dense lists and dropdowns. */
export const ROLE_SHORT: Record<Role, string> = {
  ADMIN: "Admin",
  PRESIDENT: "President",
  VICE_PRESIDENT: "VP",
  DIRECTOR_OF_OPS: "DO",
  REGIONAL: "RD",
  DISTRICT: "DM",
  OPERATOR: "Operator",
  GM: "GM",
  MANAGER: "Manager",
  STAFF: "Team",
};
