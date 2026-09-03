import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { getDueChecklists } from "@/server/schedules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Today's due list for a store — used to warm the offline cache. */
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const locationId = new URL(request.url).searchParams.get("locationId");
  if (!locationId) {
    return NextResponse.json({ error: "locationId is required." }, { status: 400 });
  }

  const allowed = await getAccessibleLocationIds(user);
  if (!allowed.includes(locationId)) {
    return NextResponse.json({ error: "No access to this location." }, { status: 403 });
  }

  return NextResponse.json({ checklists: await getDueChecklists(user.orgId, locationId) });
}
