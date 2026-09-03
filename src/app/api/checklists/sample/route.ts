import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { SAMPLE_CSV } from "@/lib/checklist-import";

export const runtime = "nodejs";

/** The example file the import panel links to. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  return new NextResponse(SAMPLE_CSV, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="checklist-template.csv"',
      "Cache-Control": "no-store",
    },
  });
}
