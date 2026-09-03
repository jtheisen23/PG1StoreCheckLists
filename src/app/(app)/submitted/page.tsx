import type { Metadata } from "next";
import { Card } from "@/components/ui";
import { LinkButton } from "@/components/buttons";

export const metadata: Metadata = { title: "Submitted" };

export default async function SubmittedPage({
  searchParams,
}: {
  searchParams: Promise<{ score?: string; passed?: string }>;
}) {
  const { score, passed } = await searchParams;
  const numeric = score ? Number(score) : null;
  const didPass = passed !== "false";

  return (
    <div className="mx-auto max-w-md pt-8">
      <Card className="p-7 text-center">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
          style={{ background: didPass ? "var(--pass-bg)" : "var(--warn-bg)" }}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-7 w-7"
            fill="none"
            stroke={didPass ? "var(--pass)" : "var(--warn)"}
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {didPass ? <path d="M5 13l4 4 10-10" /> : <path d="M12 8v5M12 17h.01" />}
          </svg>
        </div>

        <h1 className="text-lg font-semibold tracking-tight">Checklist submitted</h1>
        <p className="text-muted mt-1.5 text-[13px]">
          {numeric !== null && !Number.isNaN(numeric)
            ? `Scored ${numeric}%.`
            : "Saved."}{" "}
          {didPass
            ? "Nice work."
            : "Failed items have been turned into corrective actions."}
        </p>
        <p className="text-faint mt-3 text-[12px]">
          If this device is offline the checklist is stored here and uploads
          automatically once you are back on wifi.
        </p>

        <div className="mt-5 flex justify-center gap-2">
          <LinkButton href="/" variant="primary">
            Back to today
          </LinkButton>
          <LinkButton href="/actions">View actions</LinkButton>
        </div>
      </Card>
    </div>
  );
}
