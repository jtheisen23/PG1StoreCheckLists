import { getBranding } from "@/server/branding";

/** The organization's name on its own, for headings. */
export async function OrgName() {
  const { orgName } = await getBranding();
  return <>{orgName}</>;
}
