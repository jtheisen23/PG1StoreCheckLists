import { z } from "zod";
import { Daypart } from "@prisma/client";

export const photoDescriptor = z.object({
  url: z.string().min(1),
  pathname: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
});

export const answerSchema = z.object({
  itemId: z.string().min(1),
  boolValue: z.boolean().nullish(),
  numericValue: z.number().finite().nullish(),
  value: z.string().max(5000).nullish(),
  selected: z.array(z.string().max(200)).max(50).optional(),
  naFlag: z.boolean().optional(),
  note: z.string().max(2000).nullish(),
  photos: z.array(photoDescriptor).max(10).optional(),
});

export const submissionSchema = z.object({
  clientKey: z.string().min(8).max(100),
  locationId: z.string().min(1),
  templateId: z.string().min(1),
  scheduleId: z.string().min(1).nullish(),
  daypart: z.nativeEnum(Daypart).default(Daypart.ANYTIME),
  startedAt: z.string().datetime().optional(),
  submittedAt: z.string().datetime().optional(),
  notes: z.string().max(4000).nullish(),
  latitude: z.number().min(-90).max(90).nullish(),
  longitude: z.number().min(-180).max(180).nullish(),
  answers: z.array(answerSchema).max(500),
});

export type SubmissionPayload = z.infer<typeof submissionSchema>;
export type AnswerPayload = z.infer<typeof answerSchema>;
