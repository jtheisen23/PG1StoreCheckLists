import { Card } from "@/components/ui";
import { OVER_TOLERANCE_OZ, type WeightSummary } from "@/lib/sub-weight";

/**
 * The store's week at the scale, under the weight log — "a number we have
 * never had". Underweight leads, because a light sub is the guest problem;
 * over and under are always counted apart.
 */
export function WeightWeekPanel({
  from,
  to,
  summary,
}: {
  from: string;
  to: string;
  summary: WeightSummary;
}) {
  const judged = summary.judged;
  const share = (n: number) => (judged ? (n / judged) * 100 : 0);
  const net = summary.netVsSpecOz;
  const signed = `${net > 0 ? "+" : net < 0 ? "−" : "±"}${Math.abs(net).toFixed(2)}`;

  return (
    <>
      <Card className="mt-4 overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
          <p className="text-[15px] font-semibold tracking-tight">This week</p>
          <p className="eyebrow">
            {formatDay(from)} – {formatDay(to)}
          </p>
        </div>
        <div className="px-4 py-4">
          {judged ? (
            <>
              <p className="flex items-baseline gap-2">
                <span
                  className="tabular text-[34px] leading-none font-extrabold"
                  style={{ color: summary.under ? "var(--fail)" : "var(--pass)" }}
                >
                  {summary.under}
                </span>
                <span className="text-[15px] font-medium">underweight of {judged} weighed</span>
              </p>
              <p className="tabular text-muted mt-1.5 text-[13px]">
                {Math.round(share(summary.acceptable))}% in range · net {signed} oz against spec ·{" "}
                {summary.logged} logged
              </p>
              <div
                className="mt-3 flex h-2 overflow-hidden rounded-full"
                style={{ background: "var(--surface-sunken)" }}
                aria-hidden="true"
              >
                <span style={{ width: `${share(summary.acceptable)}%`, background: "var(--pass)" }} />
                <span style={{ width: `${share(summary.over)}%`, background: "var(--accent)" }} />
                <span style={{ width: `${share(summary.under)}%`, background: "var(--fail)" }} />
              </div>
              <p className="tabular mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
                <span>
                  <span style={{ color: "var(--pass)" }}>●</span> In range <b>{summary.acceptable}</b>
                </span>
                <span>
                  <span style={{ color: "var(--warn)" }}>▲</span> Over <b>{summary.over}</b>
                </span>
                <span>
                  <span style={{ color: "var(--fail)" }}>▼</span> Under <b>{summary.under}</b>
                </span>
              </p>
            </>
          ) : (
            <p className="text-muted text-[13px]">
              Nothing weighed against a spec yet this week — these three are the first.
            </p>
          )}
        </div>
      </Card>
      <p className="text-muted mx-auto mt-3 max-w-md text-center text-[13px]">
        The listed weight is the minimum — a sub is never acceptable under it. Anything from there up
        to <b>{OVER_TOLERANCE_OZ.toFixed(2)}</b> oz over is fine. The spec is held by the server.
      </p>
    </>
  );
}

function formatDay(key: string) {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${key}T00:00:00Z`));
}
