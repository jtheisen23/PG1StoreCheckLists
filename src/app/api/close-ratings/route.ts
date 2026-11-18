import { NextResponse } from "next/server";
import { z, ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { CLOSE_NOTE_MAX } from "@/lib/close-rating";
import { CloseRatingError, submitCloseRating } from "@/server/close-ratings";

export const runtime = "nodejs";

// No time is accepted from the device: the server stamps when a rating
// arrives, and decides from its own clock which nights can still be rated.
const closeRatingSchema = z.object({
  locationId: z.string().min(1),
  closeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  ratings: z
    .array(
      z.object({
        areaId: z.string().min(1),
        acceptable: z.boolean(),
        note: z.string().max(CLOSE_NOTE_MAX * 2).nullish(),
      }),
    )
    .min(1)
    .max(50),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let payload;
  try {
    payload = closeRatingSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "The rating could not be read.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const allowed = await getAccessibleLocationIds(user);
    const result = await submitCloseRating(user, payload, allowed);
    return NextResponse.json(result, { status: result.saved > 0 ? 201 : 200 });
  } catch (error) {
    if (error instanceof CloseRatingError) {
      // Well-formed but not acceptable: stop retrying and show a person.
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("[api/close-ratings] failed", error);
    return NextResponse.json(
      { error: "Something went wrong saving the rating." },
      { status: 500 },
    );
  }
}
