/**
 * Builds the emails the app sends.
 *
 * Pure and separate from delivery: what an email says is worth testing, and a
 * test should not need an SMTP server to check it.
 */

export interface FailedItem {
  section: string;
  label: string;
  /** What the person wrote when they marked it failed. */
  note: string | null;
  /** The reading, for a temperature or number. */
  reading: string | null;
  critical: boolean;
}

export interface SubmissionEmailInput {
  orgName: string;
  checklistName: string;
  storeCode: string;
  storeName: string;
  /** The store's own date, already formatted — never the server's. */
  localDate: string;
  submittedBy: string;
  score: number | null;
  passed: boolean;
  criticalFailure: boolean;
  itemsFailed: number;
  itemsTotal: number;
  failures: FailedItem[];
  /** Absolute link to the submission, or null when no public URL is set. */
  url: string | null;
}

export interface BuiltEmail {
  subject: string;
  text: string;
  html: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PALETTE = {
  ink: "#12161f",
  muted: "#5b6472",
  line: "#e3e6ec",
  fail: "#c02b2b",
  pass: "#1c7a4a",
  surface: "#f6f7f9",
};

/** "94.12%" / "no score" */
export function formatScore(score: number | null): string {
  return score === null ? "no score" : `${score}%`;
}

/**
 * The subject line carries the verdict, because most of these are read in a
 * notification preview and never opened. A critical failure says so first.
 */
export function submissionSubject(input: SubmissionEmailInput): string {
  const where = `#${input.storeCode} ${input.storeName}`;
  const prefix = input.criticalFailure
    ? "CRITICAL"
    : input.passed
      ? null
      : "FAILED";
  const head = prefix ? `[${prefix}] ` : "";
  return `${head}${input.checklistName} — ${where} — ${formatScore(input.score)}`;
}

export function buildSubmissionEmail(input: SubmissionEmailInput): BuiltEmail {
  const subject = submissionSubject(input);
  const verdict = input.criticalFailure
    ? "Critical failure"
    : input.passed
      ? "Passed"
      : "Did not pass";

  const lines: string[] = [
    `${input.checklistName}`,
    `${input.storeName} (#${input.storeCode})`,
    `${input.localDate} · completed by ${input.submittedBy}`,
    "",
    `${verdict} — ${formatScore(input.score)} (${input.itemsFailed} of ${input.itemsTotal} checks failed)`,
  ];

  if (input.criticalFailure) {
    lines.push("", "A critical item failed. This needs attention now.");
  }

  if (input.failures.length) {
    lines.push("", "What failed:");
    for (const failure of input.failures) {
      const mark = failure.critical ? " [CRITICAL]" : "";
      const reading = failure.reading ? ` — recorded ${failure.reading}` : "";
      lines.push(`  · ${failure.section} — ${failure.label}${mark}${reading}`);
      if (failure.note) lines.push(`      "${failure.note}"`);
    }
    lines.push(
      "",
      `Each of these has been raised as a corrective action to be closed out.`,
    );
  } else {
    lines.push("", "Nothing failed.");
  }

  if (input.url) lines.push("", `See the full submission: ${input.url}`);
  lines.push("", `Sent by ${input.orgName} Checklists.`);
  const text = lines.join("\n");

  const verdictColour = input.criticalFailure || !input.passed ? PALETTE.fail : PALETTE.pass;

  const failureRows = input.failures
    .map((failure) => {
      const reading = failure.reading
        ? `<div style="color:${PALETTE.fail};font-size:13px;margin-top:2px">Recorded ${escapeHtml(failure.reading)}</div>`
        : "";
      const note = failure.note
        ? `<div style="color:${PALETTE.muted};font-size:13px;margin-top:2px">“${escapeHtml(failure.note)}”</div>`
        : "";
      const flag = failure.critical
        ? `<span style="background:${PALETTE.fail};color:#fff;font-size:11px;font-weight:700;padding:2px 6px;border-radius:4px;margin-left:6px">CRITICAL</span>`
        : "";
      return `<tr><td style="padding:10px 0;border-bottom:1px solid ${PALETTE.line}">
        <div style="color:${PALETTE.muted};font-size:12px">${escapeHtml(failure.section)}</div>
        <div style="font-size:14px;font-weight:600;color:${PALETTE.ink}">${escapeHtml(failure.label)}${flag}</div>
        ${reading}${note}
      </td></tr>`;
    })
    .join("");

  const failureBlock = input.failures.length
    ? `<p style="font-size:13px;font-weight:700;color:${PALETTE.ink};margin:22px 0 4px">What failed</p>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${failureRows}</table>
       <p style="font-size:13px;color:${PALETTE.muted};margin:14px 0 0">
         Each of these has been raised as a corrective action to be closed out.
       </p>`
    : `<p style="font-size:14px;color:${PALETTE.pass};margin:22px 0 0">Nothing failed.</p>`;

  const criticalBanner = input.criticalFailure
    ? `<p style="background:#fdecec;color:${PALETTE.fail};font-size:13px;font-weight:600;padding:10px 12px;border-radius:8px;margin:0 0 18px">
         A critical item failed. This needs attention now.
       </p>`
    : "";

  const link = input.url
    ? `<p style="margin:24px 0 0">
         <a href="${escapeHtml(input.url)}" style="background:#2a3ad6;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 16px;border-radius:8px;display:inline-block">See the full submission</a>
       </p>`
    : "";

  const html = `<!doctype html>
<html><body style="margin:0;background:${PALETTE.surface};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${PALETTE.ink}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.surface};padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid ${PALETTE.line};border-radius:12px;padding:24px">
        <tr><td>
          ${criticalBanner}
          <p style="font-size:12px;color:${PALETTE.muted};margin:0 0 2px">${escapeHtml(input.orgName)}</p>
          <h1 style="font-size:19px;margin:0 0 4px;color:${PALETTE.ink}">${escapeHtml(input.checklistName)}</h1>
          <p style="font-size:14px;margin:0;color:${PALETTE.ink}">${escapeHtml(input.storeName)} <span style="color:${PALETTE.muted}">(#${escapeHtml(input.storeCode)})</span></p>
          <p style="font-size:13px;color:${PALETTE.muted};margin:2px 0 0">${escapeHtml(input.localDate)} · completed by ${escapeHtml(input.submittedBy)}</p>

          <p style="margin:20px 0 0;font-size:24px;font-weight:700;color:${verdictColour}">
            ${escapeHtml(formatScore(input.score))}
            <span style="font-size:14px;font-weight:600">· ${escapeHtml(verdict)}</span>
          </p>
          <p style="font-size:13px;color:${PALETTE.muted};margin:2px 0 0">
            ${input.itemsFailed} of ${input.itemsTotal} checks failed
          </p>

          ${failureBlock}
          ${link}

          <p style="font-size:12px;color:${PALETTE.muted};margin:24px 0 0;padding-top:16px;border-top:1px solid ${PALETTE.line}">
            Sent by ${escapeHtml(input.orgName)} Checklists.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, text, html };
}

/** Splits and validates a pasted list of addresses. Never throws. */
export function parseRecipients(raw: string): { emails: string[]; invalid: string[] } {
  const emails: string[] = [];
  const invalid: string[] = [];
  for (const part of raw.split(/[\s,;]+/)) {
    const value = part.trim();
    if (!value) continue;
    if (isEmail(value)) {
      const lower = value.toLowerCase();
      if (!emails.includes(lower)) emails.push(lower);
    } else {
      invalid.push(value);
    }
  }
  return { emails, invalid };
}

/**
 * Deliberately simple: enough to catch a typo, not an attempt to implement
 * RFC 5322. Anything that gets past this fails at the mail server instead.
 */
export function isEmail(value: string): boolean {
  return /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/.test(value) && value.length <= 254;
}
