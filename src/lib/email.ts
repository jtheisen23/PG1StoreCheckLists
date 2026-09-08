import "server-only";

/**
 * Sending email.
 *
 * Delivery is deliberately dull and defensive. A checklist submission is the
 * record of a store visit; if the mail server is down, refuses the password, or
 * simply is not configured yet, that must never cost someone the audit they
 * just spent forty minutes completing. Nothing in here throws.
 */

export type EmailDriver = "smtp" | "console" | "off";

export interface OutgoingEmail {
  to: string[];
  subject: string;
  text: string;
  html: string;
}

export interface SendResult {
  driver: EmailDriver;
  sent: boolean;
  /** Set when nothing was sent, saying why in plain words. */
  reason?: string;
}

interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  from: string;
}

/**
 * Gmail and Google Workspace need an App Password rather than the account
 * password, so the two variables are named for what someone actually pastes.
 * Setting them is the whole configuration; everything else is Google's fixed
 * server details.
 */
function gmailSettings(): SmtpSettings | null {
  const user = process.env.GMAIL_USER?.trim();
  const password = process.env.GMAIL_APP_PASSWORD?.trim();
  if (!user || !password) return null;
  return {
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    user,
    // Google prints App Passwords in groups of four; the spaces are display
    // only and the server rejects them.
    password: password.replace(/\s+/g, ""),
    from: process.env.EMAIL_FROM?.trim() || user,
  };
}

function smtpSettings(): SmtpSettings | null {
  const gmail = gmailSettings();
  if (gmail) return gmail;

  const host = process.env.SMTP_HOST?.trim();
  const user = process.env.SMTP_USER?.trim();
  const password = process.env.SMTP_PASSWORD?.trim();
  if (!host || !user || !password) return null;

  const port = Number(process.env.SMTP_PORT ?? 587);
  return {
    host,
    port: Number.isFinite(port) ? port : 587,
    // Port 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE === "true"
      : port === 465,
    user,
    password,
    from: process.env.EMAIL_FROM?.trim() || user,
  };
}

export function emailDriver(): EmailDriver {
  const configured = process.env.EMAIL_DRIVER?.toLowerCase();
  if (configured === "off") return "off";
  if (configured === "console") return "console";
  if (smtpSettings()) return "smtp";
  // In development, showing the mail on the console beats sending nothing and
  // saying nothing.
  return process.env.NODE_ENV === "production" ? "off" : "console";
}

/** True when mail would actually leave the building. */
export function emailConfigured(): boolean {
  return emailDriver() === "smtp";
}

export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const driver = emailDriver();
  const to = message.to.filter(Boolean);

  if (!to.length) return { driver, sent: false, reason: "No recipients." };

  if (driver === "off") {
    return {
      driver,
      sent: false,
      reason: "Email is not configured, so nothing was sent.",
    };
  }

  if (driver === "console") {
    console.info(
      `[email:console] to=${to.join(", ")}\n  subject: ${message.subject}\n${message.text
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")}`,
    );
    return { driver, sent: true };
  }

  const settings = smtpSettings();
  if (!settings) {
    return { driver, sent: false, reason: "SMTP is not configured." };
  }

  try {
    const { createTransport } = await import("nodemailer");
    const transport = createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.secure,
      auth: { user: settings.user, pass: settings.password },
    });
    await transport.sendMail({
      from: settings.from,
      to: to.join(", "),
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    return { driver, sent: true };
  } catch (error) {
    // Logged rather than raised: the caller is finishing a submission.
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[email] could not send "${message.subject}": ${reason}`);
    return { driver, sent: false, reason };
  }
}

/**
 * The public origin, for links inside an email. Vercel supplies its own; a
 * custom domain should be set explicitly so links do not point at a
 * deployment URL that changes with every push.
 */
export function appUrl(): string | null {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel =
    process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  return vercel ? `https://${vercel.replace(/\/+$/, "")}` : null;
}
