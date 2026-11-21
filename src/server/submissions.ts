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
import { runsOn } from "@/lib/weekdays";
import { evaluateAnswer, scoreSubmission, type ScorableItem } from "@/lib/scoring";
import { MAX_SUB_OZ, describeWeighing, weighingComplete } from "@/lib/sub-weight";
import { afterVoidPrefix, reportedStart, resolveWalkKey } from "@/lib/walk-key";
import type { SubmissionPayload } from "./validation";
import type { FailedItem } from "@/lib/email-content";
import { notifySubmission } from "./notifications";

export class SubmissionError extends Error {}

/**
 * Persists a completed checklist walk.
 *
 * Offline devices replay queued submissions, so `clientKey` makes this
 * idempotent: a replay of an already-stored walk returns the original record
 * instead of creating a duplicate. That holds for a voided walk too — a late
 * replay of it comes back voided rather than counting again — while a new walk
 * on a key a void has released is stored beside it (see `src/lib/walk-key.ts`).
 */
export async function submitChecklist(
  user: SessionUser,
  payload: SubmissionPayload,
  allowedLocationIds: string[],
) {
  if (!allowedLocationIds.includes(payload.locationId)) {
    throw new SubmissionError("You do not have access to this location.");
  }

  const startedAtReported = reportedStart(payload);
  const decision = resolveWalkKey(
    payload.clientKey,
    startedAtReported,
    await storedWalksFor(payload.clientKey),
  );
  if (decision.action === "existing") {
    const { id, score, passed, submittedAt, status } = decision.walk;
    return {
      id,
      score,
      passed,
      submittedAt,
      duplicate: true as const,
      voided: status === SubmissionStatus.VOIDED,
    };
  }
  const afterVoid = decision.clientKey !== payload.clientKey;

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
        notifyEmails: true,
        sections: {
          select: {
            title: true,
            daysOfWeek: true,
            items: {
              select: {
                id: true,
                archivedAt: true,
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

  // The section travels with the item, so a corrective action can say where in
  // the store it was raised. An audit repeats labels like "Walls" and "Basin"
  // across a dozen areas, and "Walls" on its own is not something anyone can
  // be sent to go and fix.
  const items = template.sections.flatMap((s) =>
    s.items.map((item) => ({ ...item, sectionTitle: s.title, sectionDays: s.daysOfWeek })),
  );
  const itemsById = new Map(items.map((i) => [i.id, i]));

  // Ignore answers for items that no longer exist on the template.
  const received = payload.answers.filter((a) => itemsById.has(a.itemId));

  // A weighing is judged against the spec on record, never one the device
  // sends. The spec in force is written beside the weight, so a later change
  // to the menu does not rewrite what this walk found.
  const weighed = received.filter(
    (a) => itemsById.get(a.itemId)!.type === "SUB_WEIGHT" && !a.naFlag && a.subSpecId,
  );
  const specs = new Map(
    (
      await prisma.subSpec.findMany({
        where: { orgId: user.orgId, id: { in: weighed.map((a) => a.subSpecId!) } },
        select: { id: true, number: true, name: true, size: true, specOz: true },
      })
    ).map((spec) => [spec.id, spec]),
  );
  const weighings = new Map<string, { subSpecId: string; weightOz: number; specOz: number | null }>();
  const answers = received.map((answer) => {
    const item = itemsById.get(answer.itemId)!;
    if (item.type !== "SUB_WEIGHT" || answer.naFlag) return answer;
    if (!weighingComplete(answer)) return { ...answer, specOz: null };
    const spec = specs.get(answer.subSpecId!);
    if (!spec) {
      throw new SubmissionError(`"${item.label}" names a sub that is not on the menu. Pick it again.`);
    }
    const weightOz = answer.numericValue!;
    if (!(weightOz > 0 && weightOz <= MAX_SUB_OZ)) {
      throw new SubmissionError(`"${item.label}" weighs ${weightOz} oz — check the number.`);
    }
    weighings.set(answer.itemId, { subSpecId: spec.id, weightOz, specOz: spec.specOz });
    return {
      ...answer,
      specOz: spec.specOz,
      value: describeWeighing(spec, weightOz, spec.specOz),
    };
  });

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

  const submittedAt = payload.submittedAt ? new Date(payload.submittedAt) : new Date();
  // What this walk was asked is what the walk screen showed: lines still in
  // use, in sections that run on the day the walk started on the store's own
  // clock. A line archived since, or Tuesday's grill focus on a walk started
  // Monday, is not owed — and a walk finished just past midnight is still
  // judged by the day it began.
  const walkDay = businessDate(location.timezone, startedAtReported ?? submittedAt).getUTCDay();
  const missingRequired = items.filter((item) => {
    if (!item.required || item.archivedAt || !runsOn(item.sectionDays, walkDay)) return false;
    const answer = answers.find((a) => a.itemId === item.id);
    return !answer || !hasAnswer(answer, item.type);
  });

  if (missingRequired.length) {
    throw new SubmissionError(
      `${missingRequired.length} required item(s) still need an answer: ${missingRequired
        .slice(0, 3)
        .map((i) => i.label)
        .join(", ")}${missingRequired.length > 3 ? "…" : ""}`,
    );
  }

  // Stored exactly as reported: it is how a later replay of this walk is
  // recognised once its key is shared with a walk that replaced a voided one.
  const startedAt = startedAtReported ?? submittedAt;
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

  // Gathered as the answers are written, so the email can say what went wrong
  // without reading the submission back out again.
  const failures: FailedItem[] = [];

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
        clientKey: decision.clientKey,
        latitude: payload.latitude ?? null,
        longitude: payload.longitude ?? null,
      },
    });

    for (const answer of answers) {
      const item = itemsById.get(answer.itemId)!;
      const passed = answer.naFlag
        ? null
        : evaluateAnswer(item as ScorableItem, answer);

      if (passed === false) {
        failures.push({
          section: item.sectionTitle ?? "",
          label: item.label,
          note: answer.note?.trim() || null,
          reading:
            item.type === "SUB_WEIGHT"
              ? (answer.value ?? null)
              : answer.numericValue === null || answer.numericValue === undefined
                ? null
                : `${answer.numericValue}${item.unit ? ` ${item.unit}` : ""}`,
          critical: item.critical,
        });
      }

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

      const weighing = weighings.get(answer.itemId);
      if (weighing) {
        await tx.subWeighing.create({ data: { responseId: response.id, ...weighing } });
      }

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
            title: item.sectionTitle
              ? `${item.sectionTitle} — ${item.label}`
              : item.label,
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
      afterVoid,
    } satisfies Prisma.InputJsonValue,
  });

  notifySubmission({
    recipients: template.notifyEmails,
    checklistName: template.name,
    storeCode: location.code,
    storeName: location.name,
    businessDate: localDate,
    submittedBy: user.name,
    submissionId: submission.id,
    score: result.score,
    passed: result.passed,
    criticalFailure: result.criticalFailure,
    itemsFailed: result.itemsFailed,
    itemsTotal: result.itemsTotal,
    failures,
  });

  return {
    id: submission.id,
    score: submission.score,
    passed: submission.passed,
    submittedAt: submission.submittedAt,
    duplicate: false as const,
    voided: false,
  };
}

/**
 * Every stored walk under `clientKey` or a key derived from it after a void.
 * The derived keys are only looked for once the key itself is taken, so a
 * first submission costs one indexed lookup, as it always has.
 */
async function storedWalksFor(clientKey: string) {
  const select = {
    id: true,
    clientKey: true,
    status: true,
    startedAt: true,
    score: true,
    passed: true,
    submittedAt: true,
    locationId: true,
  } as const;

  const held = await prisma.submission.findUnique({ where: { clientKey }, select });
  if (!held) return [];

  const later = await prisma.submission.findMany({
    where: {
      locationId: held.locationId,
      clientKey: { startsWith: afterVoidPrefix(clientKey) },
    },
    select,
  });
  return [held, ...later];
}

/** True when the responder actually supplied something for this item. */
function hasAnswer(
  answer: {
    boolValue?: boolean | null;
    numericValue?: number | null;
    value?: string | null;
    selected?: string[];
    naFlag?: boolean;
    photos?: unknown[];
    subSpecId?: string | null;
  },
  type?: string,
): boolean {
  if (answer.naFlag) return true;
  // A weight without the sub it belongs to is half an answer.
  if (type === "SUB_WEIGHT") return weighingComplete(answer);
  if (answer.boolValue !== null && answer.boolValue !== undefined) return true;
  if (answer.numericValue !== null && answer.numericValue !== undefined) return true;
  if (answer.value?.trim()) return true;
  if (answer.selected?.length) return true;
  if (answer.photos?.length) return true;
  return false;
}
