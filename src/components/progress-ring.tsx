import { cn } from "@/lib/cn";

/**
 * The PG1 progress ring: amber while there is work left, green with a tick
 * when it is done (three digits do not fit the ring). Shared by the walk's
 * header and the Today screen so the two read as one system.
 */
export function ProgressRing({ percent, label, className }: { percent: number; label?: string; className?: string }) {
  const radius = 19;
  const circumference = 2 * Math.PI * radius;
  const complete = percent >= 100;
  return (
    <div className={cn("relative h-12 w-12 shrink-0", className)} role="img" aria-label={label ?? `${percent}% done`}>
      <svg viewBox="0 0 48 48" className="h-12 w-12 -rotate-90">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="var(--surface-sunken)" strokeWidth="4" />
        <circle
          cx="24"
          cy="24"
          r={radius}
          fill="none"
          stroke={complete ? "var(--pass)" : "var(--accent)"}
          strokeWidth="4"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(100, Math.max(0, percent)) / 100)}
          className="transition-[stroke-dashoffset] duration-300"
        />
      </svg>
      <span
        className="tabular absolute inset-0 flex items-center justify-center text-[12px] font-semibold"
        style={complete ? { color: "var(--pass)" } : undefined}
      >
        {complete ? (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          `${percent}%`
        )}
      </span>
    </div>
  );
}
