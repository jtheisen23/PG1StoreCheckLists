import { NextResponse } from "next/server";

import { getCurrentUser } from "@/lib/auth";
import { storePhoto } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  try {
    const stored = await storePhoto(file, `${user.orgId}/${new Date().getFullYear()}`);
    return NextResponse.json(stored, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to store the photo.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
