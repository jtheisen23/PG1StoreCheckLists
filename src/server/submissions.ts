import "server-only";

import {
  ActionPriority,
  ActionStatus,
  Prisma,
  SubmissionStatus,
} from "@prisma/client";

import { prisma } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";
import { logActivity } from "@/lib/activity";
import { businessDate, scheduleDueAt } from "@/lib/time";
import { evaluateAnswer, scoreSubmission, type ScorableItem } from "@/lib/scoring";
import type { SubmissionPayload } from "./validation";

export class SubmissionError extends Error {}

/**
 * Persists a completed checklist walk.
 *
 * Offline devices replay queued submissions, so `clientKey` makes this
 * idempotent: a replay of an already-stored walk returns the original record
 * instead of creating a duplicate.
 */
export async function submitChecklist(
  user: SessionUser,
  payload: SubmissionPayload,
  allowedLocationIds: string[],
) {
  if (!allowedLocationIds.includes(payload.locationId)) {
    throw new SubmissionError("You do not have access to this location.");
  }

  const existing = await prisma.submission.findUnique({
    where: { clientKey: payload.clientKey },
    select: { id: true, score: true, passed: true, submittedAt: true },
  });
  if (existing) return { ...existing, duplicate: true as const };

  const [location, template] = await Promise.all([
    prisma.location.findFirst({
      where: { id: payload.locationId, orgId: user.orgId },
      select: { id: true, timezone: true, name: true, code: true },
    }),
    prisma.checklistTemplate.findFirst({
      where: { id: payload.templateId, orgId: user.orgId },
      select: {
        id: true,
        name: true,
        passingScore: true,
        sections: {
          select: {
            items: {
              select: {
                id: true,
                label: true,
                type: true,
                required: true,
                critical: true,
                weight: true,
                minValue: true,
                maxValue: true,
                unit: true,
                failingOptions: true,
                actionOnFail: true,
                noteOnFail: true,
                photoOnFail: true,
                requirePhoto: true,
              },
            },
          },
        },
      },
    }),
  ]);

  if (!location) throw new SubmissionError("Unknown location.");
  if (!template) throw new SubmissionError("Unknown checklist template.");

  const items = template.sections.flatMap((s) => s.items);
  const itemsById = new Map(items.map((i) => [i.id, i]));

  // Ignore answers for items that no longer exist on the template.
  const answers = payload.answers.filter((a) => itemsById.has(a.itemId));

  for (const answer of answers) {
    const item = itemsById.get(answer.itemId)!;
    if (answer.naFlag) continue;
    const passed = evaluateAnswer(item as ScorableItem, answer);
    if (passed === false) {
      if (item.noteOnFail && !answer.note?.trim()) {
        throw new SubmissionError(`"${item.label}" needs a note explaining the failure.`);
      }
      if (item.photoOnFail && !(answer.photos?.length ?? 0)) {
        throw new SubmissionError(`"${item.label}" needs a photo of the issue.`);
      }
    }
    if (item.requirePhoto && !(answer.photos?.length ?? 0)) {
      throw new SubmissionError(`"${item.label}" requires a photo.`);
    }
  }

  const missingRequired = items.filter((item) => {
    if (!item.required) return false;
    const answer = answers.find((a) => a.itemId === item.id);
    return !answer || !hasAnswer(answer);
  });

  if (missingRequired.length) {
    throw new SubmissionError(
      `${missingRequired.length} required item(s) still need an answer: ${missingRequired
        .slice(0, 3)
        .map((i) => i.label)
        .join(", ")}${missingRequired.length > 3 ? "…" : ""}`,
    );
  }

  const submittedAt = payload.submittedAt ? new Date(payload.submittedAt) : new Date();
  const startedAt = payload.startedAt ? new Date(payload.startedAt) : submittedAt;
  const localDate = businessDate(location.timezone, submittedAt);

  const result = scoreSubmission(items as ScorableItem[], answers, template.passingScore);

  let dueAt: Date | null = null;
  if (payload.scheduleId) {
    const schedule = await prisma.schedule.findFirst({
      where: { id: payload.scheduleId, orgId: user.orgId },
      select: { dueTime: true },
    });
    if (schedule) dueAt = scheduleDueAt(location.timezone, localDate, schedule.dueTime);
  }

  const submission = await prisma.$transaction(async (tx) => {
    const created = await tx.submission.create({
      data: {
        orgId: user.orgId,
        locationId: location.id,
        templateId: template.id,
        scheduleId: payload.scheduleId ?? null,
        userId: user.id,
        status: SubmissionStatus.SUBMITTED,
        daypart: payload.daypart,
        businessDate: localDate,
        startedAt,
        submittedAt,
        dueAt,
        score: result.score,
        passed: result.passed,
        itemsTotal: result.itemsTotal,
        itemsPassed: result.itemsPassed,
        itemsFailed: result.itemsFailed,
        notes: payload.notes ?? null,
        clientKey: payload.clientKey,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
      },
    });

    for (const answer of answers) {
      const item = itemsById.get(answer.itemId)!;
      const passed = answer.naFlag
        ? null
        : evaluateAnswer(item as ScorableItem, answer);

      const response = await tx.itemResponse.create({
        data: {
          submissionId: created.id,
          itemId: item.id,
          value: answer.value ?? null,
          numericValue: answer.numericValue ?? null,
          boolValue: answer.boolValue ?? null,
          selected: answer.selected ?? [],
          passed,
          naFlag: answer.naFlag ?? false,
          note: answer.note ?? null,
          answeredAt: submittedAt,
        },
      });

      if (answer.photos?.length) {
        await tx.attachment.createMany({
          data: answer.photos.map((p) => ({
            responseId: response.id,
            url: p.url,
            pathname: p.pathname,
            mimeType: p.mimeType,
            size: p.size,
          })),
        });
      }

      if (passed === false && item.actionOnFail) {
        const hoursToFix = item.critical ? 4 : 24;
        await tx.correctiveAction.create({
          data: {
            orgId: user.orgId,
            locationId: location.id,
            submissionId: created.id,
            responseId: response.id,
            title: item.label,
            description: answer.note?.trim()
              ? answer.note
              : `Failed during "${template.name}" on ${localDate.toISOString().slice(0, 10)}.`,
            status: ActionStatus.OPEN,
            priority: item.critical ? ActionPriority.CRITICAL : ActionPriority.MEDIUM,
            raisedById: user.id,
            dueAt: new Date(submittedAt.getTime() + hoursToFix * 60 * 60 * 1000),
          },
        });
      }
    }

    return created;
  });

  await logActivity({
    orgId: user.orgId,
    userId: user.id,
    action: "submission.submitted",
    entityType: "Submission",
    entityId: submission.id,
    locationId: location.id,
    summary: `${user.name} submitted "${template.name}" at ${location.name} (#${location.code}) — ${
      result.score === null ? "no score" : `${result.score}%`
    }, ${result.itemsFailed} failed`,
    metadata: {
      score: result.score,
      passed: result.passed,
      itemsFailed: result.itemsFailed,
      criticalFailure: result.criticalFailure,
    } satisfies Prisma.InputJsonValue,
  });

  return {
    id: submission.id,
    score: submission.score,
    passed: submission.passed,
    submittedAt: submission.submittedAt,
    duplicate: false as const,
  };
}

/** True when the responder actually supplied something for this item. */
function hasAnswer(answer: {
  boolValue?: boolean | null;
  numericValue?: number | null;
  value?: string | null;
  selected?: string[];
  naFlag?: boolean;
  photos?: unknown[];
}): boolean {
  if (answer.naFlag) return true;
  if (answer.boolValue !== null && answer.boolValue !== undefined) return true;
  if (answer.numericValue !== null && answer.numericValue !== undefined) return true;
  if (answer.value?.trim()) return true;
  if (answer.selected?.length) return true;
  if (answer.photos?.length) return true;
  return false;
}
