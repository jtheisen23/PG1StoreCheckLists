import { cn } from "@/lib/cn";
import { verdictLabel } from "@/lib/close-rating";

/*
 * How a close rating looks wherever it appears. A verdict always carries a
 * word or a distinct shape — a thumb up and a thumb down are told apart
 * without colour — because a manager glancing at a screen in a dim kitchen is
 * the actual use case.
 */

const THUMB_UP =
  "M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3";
const THUMB_DOWN =
  "M10 15v4a3 3 0 003 3l4-9V2H5.72a2 2 0 00-2 1.7l-1.38 9a2 2 0 002 2.3zm7-13h2.67A2.31 2.31 0 0122 4v7a2.31 2.31 0 01-2.33 2H17";

export function ThumbIcon({ up, className }: { up: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={up ? THUMB_UP : THUMB_DOWN} />
    </svg>
  );
}

export function VerdictChip({ acceptable, compact }: { acceptable: boolean; compact?: boolean }) {
  const tone = acceptable ? "pass" : "fail";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md font-medium whitespace-nowrap",
        compact ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-[12px]",
      )}
      style={{ color: `var(--${tone})`, background: `var(--${tone}-bg)` }}
    >
      <ThumbIcon up={acceptable} className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {verdictLabel(acceptable)}
    </span>
  );
}

/** One store's last night at a glance: a thumb per area, a dash where unrated. */
export function LastNightThumbs({
  areas,
}: {
  areas: { name: string; acceptable: boolean | null }[];
}) {
  const down = areas.filter((area) => area.acceptable === false).length;
  const rated = areas.filter((area) => area.acceptable !== null).length;
  const summary =
    rated === 0
      ? "Not rated"
      : down > 0
        ? `${down} needs better`
        : rated < areas.length
          ? `${rated} of ${areas.length} rated`
          : "All good handoffs";

  return (
    <span className="flex flex-col items-start gap-0.5">
      <span className="flex items-center gap-1" aria-hidden="true">
        {areas.map((area) =>
          area.acceptable === null ? (
            <span
              key={area.name}
              className="text-faint flex h-4 w-4 items-center justify-center text-[12px] leading-none"
            >
              –
            </span>
          ) : (
            <span
              key={area.name}
              style={{ color: area.acceptable ? "var(--pass)" : "var(--fail)" }}
            >
              <ThumbIcon up={area.acceptable} className="h-4 w-4" />
            </span>
          ),
        )}
      </span>
      <span className="sr-only">
        {areas
          .map(
            (area) =>
              `${area.name}: ${area.acceptable === null ? "not rated" : verdictLabel(area.acceptable).toLowerCase()}`,
          )
          .join(", ")}
      </span>
      <span
        className="text-[11px] font-medium"
        style={{
          color: down > 0 ? "var(--fail)" : rated === 0 ? "var(--text-faint)" : "var(--text-muted)",
        }}
        aria-hidden="true"
      >
        {summary}
      </span>
    </span>
  );
}
