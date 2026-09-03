import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article";
}) {
  return (
    <Tag className={cn("surface rounded-xl", className)}>{children}</Tag>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
      <div className="min-w-0">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        {subtitle ? (
          <p className="text-muted mt-0.5 text-[13px]">{subtitle}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

type Tone = "neutral" | "pass" | "warn" | "fail" | "info";

const TONE_STYLE: Record<Tone, { color: string; background: string }> = {
  neutral: { color: "var(--text-muted)", background: "var(--surface-sunken)" },
  pass: { color: "var(--pass)", background: "var(--pass-bg)" },
  warn: { color: "var(--warn)", background: "var(--warn-bg)" },
  fail: { color: "var(--fail)", background: "var(--fail-bg)" },
  info: { color: "var(--info)", background: "var(--info-bg)" },
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12px] font-medium whitespace-nowrap",
        className,
      )}
      style={TONE_STYLE[tone]}
    >
      {children}
    </span>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Card className="p-4">
      <p className="text-faint text-[12px] font-medium tracking-wide uppercase">
        {label}
      </p>
      <p
        className="tabular mt-1.5 text-2xl font-semibold"
        style={{ color: tone === "neutral" ? undefined : TONE_STYLE[tone].color }}
      >
        {value}
      </p>
      {hint ? <p className="text-muted mt-1 text-[12px]">{hint}</p> : null}
    </Card>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <p className="text-[15px] font-medium">{title}</p>
      {description ? (
        <p className="text-muted max-w-sm text-[13px]">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="text-muted mt-1 text-[13px]">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge>No score</Badge>;
  const tone: Tone = score >= 95 ? "pass" : score >= 85 ? "warn" : "fail";
  return (
    <Badge tone={tone} className="tabular">
      {score}%
    </Badge>
  );
}

/** Horizontal meter, used for completion and pass rates. */
export function Meter({
  value,
  tone = "info",
}: {
  value: number;
  tone?: Tone;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div
      className="h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: "var(--surface-sunken)" }}
      role="meter"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width]"
        style={{ width: `${pct}%`, background: TONE_STYLE[tone].color }}
      />
    </div>
  );
}
