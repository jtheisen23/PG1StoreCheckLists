import { Badge } from "@/components/ui";
import { describeNet, formatOz, type WeightSummary } from "@/lib/sub-weight";

/** Under, over and the net, each in words; quiet when there is nothing to say. */
export function StoreWeek({ summary }: { summary: WeightSummary }) {
  if (!summary.logged) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Badge tone={summary.under ? "fail" : "neutral"}>
        {summary.under ? `${summary.under} under · ${formatOz(summary.ozShort)} short` : "None under"}
      </Badge>
      <Badge tone={summary.over ? "warn" : "neutral"}>
        {summary.over ? `${summary.over} over · ${formatOz(summary.ozOver)}` : "None over"}
      </Badge>
      {summary.judged ? (
        <span className="tabular text-muted text-[12px]">Ran {describeNet(summary.netVsSpecOz)}</span>
      ) : null}
    </div>
  );
}
