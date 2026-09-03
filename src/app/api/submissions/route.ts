import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getCurrentUser } from "@/lib/auth";
import { getAccessibleLocationIds } from "@/lib/permissions";
import { submissionSchema } from "@/server/validation";
import { SubmissionError, submitChecklist } from "@/server/submissions";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let payload;
  try {
    payload = submissionSchema.parse(await request.json());
  } catch (error) {
    const message =
      error instanceof ZodError
        ? error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "The submission could not be read.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    const allowed = await getAccessibleLocationIds(user);
    const result = await submitChecklist(user, payload, allowed);
    return NextResponse.json(result, { status: result.duplicate ? 200 : 201 });
  } catch (error) {
    if (error instanceof SubmissionError) {
      // 422: the payload is well-formed but the walk itself is not acceptable,
      // so the client should stop retrying and surface it to a person.
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error("[api/submissions] failed", error);
    return NextResponse.json(
      { error: "Something went wrong saving the submission." },
      { status: 500 },
    );
  }
}
