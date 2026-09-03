"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { TooltipProps } from "recharts";

/**
 * Chart palette. Slot 1 (blue) carries neutral magnitude; the status red is
 * reserved for failure counts and always sits next to a label naming it, so
 * colour never carries the meaning alone.
 */
const SERIES = "var(--chart-series-1)";
const CRITICAL = "var(--chart-critical)";

function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: TooltipProps<number, string> & {
  formatter?: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div
      className="rounded-lg border px-2.5 py-1.5 text-[12px] shadow-sm"
      style={{ background: "var(--surface-raised)", color: "var(--text)" }}
    >
      <p className="text-muted">{label}</p>
      <p className="tabular font-semibold">
        {value === null || value === undefined
          ? "No data"
          : formatter
            ? formatter(Number(value))
            : value}
      </p>
    </div>
  );
}

const AXIS = { tickLine: false, axisLine: false } as const;

/** Average checklist score over the period. One series, so no legend. */
export function ScoreTrend({
  data,
  passingScore,
}: {
  data: { date: string; avgScore: number | null }[];
  passingScore: number;
}) {
  // Scores cluster high, so a fixed 0–100 (or a fixed 25-point band) leaves the
  // line pinned to the top. Fit the axis to the data and the passing line.
  const scores = data
    .map((d) => d.avgScore)
    .filter((v): v is number => v !== null);
  const lowest = scores.length ? Math.min(...scores) : passingScore;
  const floor = Math.max(0, Math.floor(Math.min(lowest, passingScore) / 5) * 5 - 2);

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <defs>
            <linearGradient id="scoreFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={SERIES} stopOpacity={0.22} />
              <stop offset="100%" stopColor={SERIES} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" {...AXIS} tickFormatter={shortDate} minTickGap={28} />
          <YAxis
            {...AXIS}
            domain={[floor, 100]}
            width={44}
            tickFormatter={(v) => `${v}%`}
          />
          <Tooltip
            content={<ChartTooltip formatter={(v) => `${v}% average score`} />}
            cursor={{ stroke: "var(--border-strong)", strokeWidth: 1 }}
          />
          <ReferenceLine
            y={passingScore}
            stroke="var(--border-strong)"
            strokeDasharray="4 4"
            label={{
              value: `Passing ${passingScore}%`,
              position: "insideBottomRight",
              fill: "var(--text-faint)",
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="avgScore"
            stroke={SERIES}
            strokeWidth={2}
            fill="url(#scoreFill)"
            connectNulls
            isAnimationActive={false}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface-raised)" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Daily count of failed checklist items. */
export function FailedItemsTrend({
  data,
}: {
  data: { date: string; failedItems: number }[];
}) {
  return (
    <div className="h-44 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" {...AXIS} tickFormatter={shortDate} minTickGap={28} />
          <YAxis {...AXIS} width={40} allowDecimals={false} />
          <Tooltip
            content={<ChartTooltip formatter={(v) => `${v} failed items`} />}
            cursor={{ fill: "var(--surface-sunken)" }}
          />
          <Bar
            dataKey="failedItems"
            fill={CRITICAL}
            radius={[4, 4, 0, 0]}
            maxBarSize={18}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Horizontal ranking of counts. Length encodes magnitude from a zero baseline,
 * and each bar carries its own value so the number never depends on a hover.
 */
export function RankedBars({
  data,
  unit,
  tone = "series",
}: {
  data: { name: string; value: number }[];
  unit: string;
  tone?: "series" | "critical";
}) {
  const fill = tone === "critical" ? CRITICAL : SERIES;
  return (
    <div style={{ height: Math.max(120, data.length * 34 + 24) }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 4, right: 40, left: 4, bottom: 4 }}
          barCategoryGap={6}
        >
          <CartesianGrid horizontal={false} />
          <XAxis type="number" {...AXIS} hide />
          <YAxis
            type="category"
            dataKey="name"
            {...AXIS}
            width={148}
            tickFormatter={(value: string) =>
              value.length > 18 ? `${value.slice(0, 17)}…` : value
            }
          />
          <Tooltip
            content={<ChartTooltip formatter={(v) => `${v}${unit}`} />}
            cursor={{ fill: "var(--surface-sunken)" }}
          />
          <Bar
            dataKey="value"
            radius={[0, 4, 4, 0]}
            maxBarSize={18}
            fill={fill}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="value"
              position="right"
              offset={8}
              fill="var(--text-muted)"
              fontSize={11}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Scores that cluster in a narrow band (most districts sit in the high 90s).
 * A zero-baseline bar would render them all as the same full-width block, so
 * position on a zoomed scale carries the comparison instead of bar length —
 * legitimate for a dot plot, which encodes with position rather than area.
 */
export function ScoreDotPlot({
  data,
  average,
}: {
  data: { name: string; value: number }[];
  average: number | null;
}) {
  if (!data.length) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values, average ?? Infinity);
  const max = Math.max(...values, average ?? -Infinity);
  // Pad the band so the extremes never sit on the frame.
  const pad = Math.max(0.6, (max - min) * 0.25);
  const lo = Math.max(0, Math.floor((min - pad) * 10) / 10);
  const hi = Math.min(100, Math.ceil((max + pad) * 10) / 10);
  const span = hi - lo || 1;
  const position = (value: number) => ((value - lo) / span) * 100;

  return (
    <div>
      <ul className="flex flex-col gap-2.5">
        {data.map((row) => (
          <li key={row.name} className="flex items-center gap-3">
            <span className="text-muted w-32 shrink-0 truncate text-[12px] sm:w-44">
              {row.name}
            </span>
            <span className="relative h-4 flex-1">
              <span
                className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2"
                style={{ background: "var(--border)" }}
              />
              {average !== null ? (
                <span
                  className="absolute top-0 h-4 w-px"
                  style={{
                    left: `${position(average)}%`,
                    background: "var(--border-strong)",
                  }}
                />
              ) : null}
              <span
                className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                style={{
                  left: `${position(row.value)}%`,
                  background: SERIES,
                  boxShadow: "0 0 0 2px var(--surface-raised)",
                }}
              />
            </span>
            <span className="tabular w-12 shrink-0 text-right text-[12px] font-semibold">
              {row.value}%
            </span>
          </li>
        ))}
      </ul>
      <p className="text-faint mt-3 text-[11px]">
        Scale {lo}%–{hi}%
        {average !== null ? ` · vertical line marks the fleet average (${average}%)` : ""}
      </p>
    </div>
  );
}

function shortDate(value: string) {
  const [, month, day] = value.split("-");
  return `${Number(month)}/${Number(day)}`;
}
