import "server-only";

import { after } from "next/server";

import { appUrl, emailDriver, sendEmail } from "@/lib/email";
import {
  buildSubmissionEmail,
  parseRecipients,
  type FailedItem,
} from "@/lib/email-content";
import { getBranding } from "./branding";

export interface SubmissionNotice {
  recipients: string[];
  checklistName: string;
  storeCode: string;
  storeName: string;
  /** UTC-midnight date for the store's own business day. */
  businessDate: Date;
  submittedBy: string;
  submissionId: string;
  score: number | null;
  passed: boolean;
  criticalFailure: boolean;
  itemsFailed: number;
  itemsTotal: number;
  failures: FailedItem[];
}

/**
 * The business date is already the store's own day, held at UTC midnight, so it
 * is formatted in UTC. Reading it in the server's zone would slide it a day.
 */
function readableDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Emails a completed submission to whoever the checklist nominates.
 *
 * Queued with `after` so it runs once the response has been sent: a store on
 * a weak connection should not wait on an SMTP handshake, and a mail server
 * having a bad day must not turn a finished audit into an error.
 */
export function notifySubmission(notice: SubmissionNotice): void {
  if (!notice.recipients.length) return;
  if (emailDriver() === "off") return;

  const run = async () => {
    try {
      const { orgName } = await getBranding();
      const origin = appUrl();
      const message = buildSubmissionEmail({
        orgName,
        checklistName: notice.checklistName,
        storeCode: notice.storeCode,
        storeName: notice.storeName,
        localDate: readableDate(notice.businessDate),
        submittedBy: notice.submittedBy,
        score: notice.score,
        passed: notice.passed,
        criticalFailure: notice.criticalFailure,
        itemsFailed: notice.itemsFailed,
        itemsTotal: notice.itemsTotal,
        failures: notice.failures,
        url: origin ? `${origin}/submissions/${notice.submissionId}` : null,
      });

      const { emails } = parseRecipients(notice.recipients.join(","));
      const result = await sendEmail({ to: emails, ...message });
      if (!result.sent) {
        console.error(`[notify] "${message.subject}" not sent: ${result.reason}`);
      }
    } catch (error) {
      // A notification is never worth failing a submission over.
      console.error("[notify] submission email failed:", error);
    }
  };

  try {
    after(run);
  } catch {
    // Outside a request (a script, a test), just run it.
    void run();
  }
}
