import Link from "next/link";
import type { Metadata } from "next";

import { requireUser } from "@/lib/auth";
import { canManageLocations, canManageUsers, getAccessibleLocationIds } from "@/lib/permissions";
import { getDirectoryOptions } from "@/server/directory";
import { AddUserDialog } from "@/components/add-user-dialog";
import { getDashboardData } from "@/server/dashboard";
import { getExecutionData, type ExecutionData } from "@/server/execution";
import { Card, CardHeader, EmptyState } from "@/components/ui";
import { ScoreDotPlot, ScoreTrend } from "@/components/charts";
import { LastNightThumbs } from "@/components/close-verdict";
import { TIERS, tierOf, type Tier } from "@/lib/execution";
import { RANGE_KEYS, RANGE_LABELS, type RangeKey } from "@/lib/periods";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const SHOWN = 10;

/**
 * The leadership view, after the PG1 walkthrough: one login, every store the
 * person actually oversees — across legal entities — worst first. Execution
 * leads (what was owed against what was done); audit scores follow.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string; all?: string }>;
}) {
  const { range: asked, all } = await searchParams;
  const rangeKey: RangeKey = RANGE_KEYS.includes(asked as RangeKey) ? (asked as RangeKey) : "today";
  const user = await requireUser();
  const locationIds = await getAccessibleLocationIds(user);

  if (!locationIds.length) {
    return (
      <Card>
        <EmptyState
          title="No stores in your scope"
          description="Ask an administrator to assign you to a region, district or location."
        />
      </Card>
    );
  }

  const [data, scores, directory] = await Promise.all([
    getExecutionData(user.orgId, locationIds, rangeKey),
    getDashboardData(user.orgId, locationIds, 30),
    canManageUsers(user) ? getDirectoryOptions(user.orgId) : null,
  ]);

  const owed = data.stores.filter((store) => store.rate !== null);
  const shown = all ? data.stores : data.stores.slice(0, SHOWN);
  const rangeWord = RANGE_LABELS[rangeKey].toLowerCase();

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow mb-1">Ops Execution</p>
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em]">
            Period {data.period.number} · Week {data.period.week}
          </h1>
          <p className="text-muted mt-1 text-[14px]">
            {formatDay(data.period.start)} – {formatDay(data.period.end)} · day {data.period.day} of 28 ·{" "}
            {data.stores.length} store{data.stores.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {directory ? <AddUserDialog directory={directory} /> : null}
          <nav
            className="flex rounded-lg p-0.5"
            style={{ background: "var(--surface-sunken)" }}
            aria-label="Range"
          >
            {RANGE_KEYS.map((key) => (
              <Link
                key={key}
                href={`/dashboard?range=${key}`}
                aria-current={key === rangeKey ? "page" : undefined}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[12px] font-medium whitespace-nowrap",
                  key === rangeKey ? "shadow-sm" : "text-muted",
                )}
                style={key === rangeKey ? { background: "var(--surface-raised)", color: "var(--text)" } : undefined}
              >
                {RANGE_LABELS[key]}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <p className="eyebrow mb-2">
        {RANGE_LABELS[rangeKey]}
        {rangeKey !== "today" ? (
          <span className="font-medium tracking-normal normal-case">
            {" "}
            · {formatDay(data.range.from)} – {formatDay(data.range.to)}
          </span>
        ) : null}
      </p>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ExecutionCard data={data} />
        <Kpi
          label="Stores not complete"
          value={
            <>
              {owed.filter((store) => (store.rate ?? 0) < 100).length}
              <small> / {owed.length}</small>
            </>
          }
          hint={`${owed.filter((store) => (store.rate ?? 0) < 70).length} under 70% · ${
            owed.filter((store) => store.rate === 100).length
          } fully complete`}
        >
          <Strip
            cells={[...owed]
              .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0))
              .map((store) => ({ key: store.id, tone: TIERS[tierOf(store.rate)!].tone, title: `#${store.code} ${store.rate}%` }))}
          />
        </Kpi>
        <CloseCard data={data} canSetUp={canManageLocations(user)} />
        <Kpi
          label="Corrective actions open"
          value={
            <>
              {data.actions.open}
              <small> open</small>
            </>
          }
          hint={
            data.actions.open
              ? `${data.actions.olderThan14} open longer than 14 days · oldest ${data.actions.oldestDays} days`
              : "Nothing open"
          }
        >
          <Bars bars={data.actions.buckets.map((b) => ({ key: b.label, value: b.count, tone: b.tone, title: `${b.label}: ${b.count}` }))} />
        </Kpi>
      </div>

      <p className="eyebrow mb-2">Where to look first</p>
      <div className="mb-6 grid items-start gap-4 lg:grid-cols-[1.65fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title="Stores behind"
            subtitle={`Worst first, ${rangeWord}. Completion counts every checklist scheduled for the day — weight logs included; the close rating is not a score and stays out.`}
            action={
              data.stores.length > SHOWN ? (
                <Link
                  href={all ? `/dashboard?range=${rangeKey}` : `/dashboard?range=${rangeKey}&all=1`}
                  className="text-[12px] font-medium whitespace-nowrap underline underline-offset-2"
                  style={{ color: "var(--pass)" }}
                >
                  {all ? `Show worst ${SHOWN}` : `Show all ${data.stores.length}`}
                </Link>
              ) : null
            }
          />
          <div className="eyebrow hidden grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_3.5rem_5rem_4.75rem] gap-3 border-b px-5 py-2 md:grid">
            <span>Store</span>
            <span>DO</span>
            <span>Completion</span>
            <span className="text-right">Missing</span>
            <span>Last entry</span>
            <span>Last night</span>
          </div>
          <ul>
            {shown.map((store) => (
              <li key={store.id} className="border-b last:border-b-0">
                <Link
                  href={`/locations/${store.id}`}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-5 py-3 hover:bg-[var(--surface-sunken)] md:grid-cols-[minmax(0,1.6fr)_minmax(0,0.9fr)_minmax(0,1.3fr)_3.5rem_5rem_4.75rem]"
                >
                  <span className="col-start-1 row-start-1 min-w-0 md:col-start-auto md:row-start-auto">
                    <span className="block truncate text-[14px] font-semibold">{store.name}</span>
                    <span className="text-muted block truncate text-[12px]">
                      {[store.code, store.state, store.gm].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="text-muted hidden truncate text-[13px] md:block">{store.director ?? "—"}</span>
                  <span className="col-span-2 flex items-center gap-2.5 md:col-span-1">
                    <Completion rate={store.rate} />
                  </span>
                  <span className="tabular hidden text-right text-[14px] font-semibold md:block">{store.missing}</span>
                  <span className="hidden md:block">
                    <LastEntry at={store.lastEntry} />
                  </span>
                  <span className="col-start-2 row-start-1 md:col-start-auto md:row-start-auto">
                    {store.lastNight ? <LastNightThumbs areas={store.lastNight.areas} /> : <span className="text-faint text-[12px]">—</span>}
                  </span>
                  <span className="text-muted col-span-2 text-[12px] md:hidden">
                    {store.missing} missing · {store.director ?? "No DO"} · last entry{" "}
                    {store.lastEntry ? shortAgo(store.lastEntry) : "never"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <TierLegend />
        </Card>

        <Card className="h-fit overflow-hidden">
          <CardHeader
            title="What keeps failing"
            subtitle={`Checklist lines most often failed or not done, ${rangeWord}, across every store in view.`}
          />
          {data.failing.length ? (
            <ul>
              {data.failing.map((item) => (
                <li key={item.itemId} className="border-b px-5 py-2.5 last:border-b-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-medium">{item.label}</span>
                      <span className="text-muted block truncate text-[12px]">{item.templateName}</span>
                    </span>
                    <span className="tabular text-[13px] font-bold">{item.failures}</span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full" style={{ background: "var(--surface-sunken)" }}>
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(item.failures / data.failing[0].failures) * 100}%`,
                        background: "var(--chart-series-1)",
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="Nothing failed" description={`No checklist line failed ${rangeWord}.`} />
          )}
        </Card>
      </div>

      <div className="mb-6 grid items-start gap-4 lg:grid-cols-[1.65fr_1fr]">
        <Card className="overflow-hidden">
          <CardHeader
            title={`Execution rate — ${rangeKey === "lp" ? "last period" : `Period ${data.period.number}`}`}
            subtitle={`Daily rate across every store in view, ${formatDay(data.chartRange.from)} onward. Lines at 70% and 90% mark the bands.`}
          />
          <div className="px-5 py-4">
            <DailyBars days={data.daily} today={rangeKey === "lp" ? null : data.chartRange.to} />
          </div>
        </Card>
        <Card className="h-fit overflow-hidden">
          <CardHeader
            title={data.groupedByDistrict ? "By district" : "By Director of Operations"}
            subtitle={`Average store completion, ${rangeWord}.`}
          />
          <ul>
            {data.directors.map((director) => (
              <li key={director.name} className="border-b px-5 py-2.5 last:border-b-0">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-semibold">{director.name}</span>
                    <span className="text-muted text-[12px]">
                      {director.stores} store{director.stores === 1 ? "" : "s"}
                    </span>
                  </span>
                  <Completion rate={director.rate} compact />
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <p className="eyebrow mb-2">Audit scores · last 30 days</p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Average checklist score" subtitle="Daily average across your stores" />
          <div className="px-2 py-4">
            <ScoreTrend data={scores.trend} passingScore={90} />
          </div>
        </Card>
        <Card>
          <CardHeader
            title={scores.districts.filter((d) => d.avgScore !== null).length > 1 ? "District average score" : "Store average score"}
            subtitle="Values sit close together, so the scale is zoomed to the spread"
          />
          <div className="px-5 py-4">
            {(() => {
              const districts = scores.districts.filter((d) => d.avgScore !== null);
              const rows =
                districts.length > 1
                  ? districts.map((d) => ({ name: d.name, value: d.avgScore ?? 0 }))
                  : scores.locations
                      .filter((l) => l.avgScore !== null)
                      .sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))
                      .slice(0, 12)
                      .map((l) => ({ name: `#${l.code} ${l.name}`, value: l.avgScore ?? 0 }));
              return rows.length ? (
                <ScoreDotPlot average={scores.period.avgScore} data={rows} />
              ) : (
                <EmptyState title="No scored walks yet" />
              );
            })()}
          </div>
        </Card>
      </div>
    </>
  );
}

function Kpi({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: React.ReactNode;
  hint: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <Card className="flex flex-col p-4">
      <p className="eyebrow">{label}</p>
      <p className="tabular mt-1.5 text-[28px] leading-none font-bold tracking-[-0.02em] [&_small]:text-muted [&_small]:text-[14px] [&_small]:font-medium [&_small]:tracking-normal">
        {value}
      </p>
      <p className="text-muted mt-1.5 text-[12px]">{hint}</p>
      {children ? <div className="mt-auto pt-3">{children}</div> : null}
    </Card>
  );
}

function ExecutionCard({ data }: { data: ExecutionData }) {
  const delta =
    data.rate !== null && data.previousRate !== null ? Math.round((data.rate - data.previousRate) * 10) / 10 : null;
  return (
    <Kpi
      label="Execution rate"
      value={
        data.rate === null ? (
          "—"
        ) : (
          <>
            {data.rate.toFixed(1)}
            <small> %</small>
          </>
        )
      }
      hint={
        delta === null ? (
          "Nothing was due yet"
        ) : (
          <>
            <span className="font-semibold" style={{ color: delta < 0 ? "var(--fail)" : "var(--pass)" }}>
              {delta < 0 ? "▼" : delta > 0 ? "▲" : "="} {Math.abs(delta).toFixed(1)} pts
            </span>{" "}
            {data.versus}
          </>
        )
      }
    >
      <Sparkline points={data.spark.map((point) => point.rate)} />
    </Kpi>
  );
}

function CloseCard({ data, canSetUp }: { data: ExecutionData; canSetUp: boolean }) {
  if (!data.close.configured) {
    return (
      <Kpi label="Last night's close" value={<small>Not set up</small>} hint="No areas are rated yet.">
        {canSetUp ? (
          <Link href="/admin/close-rating" className="text-[12px] font-medium underline" style={{ color: "var(--pass)" }}>
            Set up the close rating
          </Link>
        ) : null}
      </Kpi>
    );
  }
  return (
    <Kpi
      label="Last night's close"
      value={
        <>
          {data.close.needsBetter}
          <small> needs better</small>
        </>
      }
      hint={`${data.close.storesDown} store${data.close.storesDown === 1 ? "" : "s"} marked down · ${data.close.notRated} not rated`}
    >
      <Strip
        cells={data.stores
          .filter((store) => store.lastNight)
          .map((store) => {
            const areas = store.lastNight!.areas;
            const tone = areas.some((a) => a.acceptable === false)
              ? "fail"
              : areas.every((a) => a.acceptable === true)
                ? "pass"
                : "neutral";
            return { key: store.id, tone, title: `#${store.code}` };
          })
          .sort((a, b) => ["fail", "neutral", "pass"].indexOf(a.tone) - ["fail", "neutral", "pass"].indexOf(b.tone))}
      />
    </Kpi>
  );
}

/** One cell per store, coloured by band — the fleet at a glance. */
function Strip({ cells }: { cells: { key: string; tone: string; title: string }[] }) {
  if (!cells.length) return null;
  return (
    <div className="flex h-5 gap-[2px] overflow-hidden rounded-sm" aria-hidden="true">
      {cells.map((cell) => (
        <span
          key={cell.key}
          title={cell.title}
          className="min-w-[2px] flex-1"
          style={{ background: cell.tone === "neutral" ? "var(--border-strong)" : `var(--${cell.tone === "warn" ? "accent" : cell.tone})` }}
        />
      ))}
    </div>
  );
}

function Bars({ bars }: { bars: { key: string; value: number; tone: string; title: string }[] }) {
  const max = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <div className="flex h-8 items-end gap-1" aria-hidden="true">
      {bars.map((bar) => (
        <span
          key={bar.key}
          title={bar.title}
          className="flex-1 rounded-t-sm"
          style={{
            height: `${Math.max(bar.value ? 8 : 0, (bar.value / max) * 100)}%`,
            background: bar.tone === "warn" ? "var(--accent)" : `var(--${bar.tone})`,
          }}
        />
      ))}
    </div>
  );
}

function Sparkline({ points }: { points: (number | null)[] }) {
  const values = points.map((p, i) => ({ i, p })).filter((v): v is { i: number; p: number } => v.p !== null);
  if (values.length < 2) return null;
  const x = (i: number) => (i / (points.length - 1)) * 100;
  const y = (p: number) => 28 - (p / 100) * 26;
  const line = values.map((v) => `${x(v.i)},${y(v.p)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg viewBox="0 0 100 30" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      <polygon points={`${x(values[0].i)},30 ${line} ${x(last.i)},30`} style={{ fill: "color-mix(in srgb, var(--pass) 12%, transparent)" }} />
      <polyline points={line} fill="none" strokeWidth="1.5" vectorEffect="non-scaling-stroke" style={{ stroke: "var(--pass)" }} />
    </svg>
  );
}

/** Zero-based daily bars, banded by colour and by the reference lines. */
function DailyBars({ days, today }: { days: { day: string; rate: number | null }[]; today: string | null }) {
  return (
    <div>
      <div className="relative h-40">
        {[90, 70].map((line) => (
          <div
            key={line}
            className="absolute inset-x-0 border-t border-dashed"
            style={{ bottom: `${line}%`, borderColor: "var(--border-strong)" }}
          >
            <span className="text-faint absolute -top-2 right-0 px-1 text-[10px]" style={{ background: "var(--surface-raised)" }}>
              {line}%
            </span>
          </div>
        ))}
        <div className="absolute inset-0 flex items-end gap-[3px]">
          {days.map((d) => {
            const tier = tierOf(d.rate);
            return (
              <span
                key={d.day}
                title={`${formatDay(d.day)}: ${d.rate === null ? "nothing due" : `${d.rate}%`}${d.day === today ? " so far" : ""}`}
                className="flex-1 rounded-t-sm"
                style={{
                  height: d.rate === null ? 0 : `${Math.max(1, d.rate)}%`,
                  background: tier ? toneColour(TIERS[tier].tone) : undefined,
                  opacity: d.day === today ? 0.45 : 1,
                }}
              />
            );
          })}
        </div>
      </div>
      <div className="text-faint mt-1.5 flex justify-between text-[11px]">
        <span>{days.length ? formatDay(days[0].day) : ""}</span>
        <span>
          {days.length ? formatDay(days[days.length - 1].day) : ""}
          {today && days.at(-1)?.day === today ? " · so far" : ""}
        </span>
      </div>
    </div>
  );
}

const toneColour = (tone: string) => (tone === "warn" ? "var(--accent)" : `var(--${tone})`);

/** A completion figure: bar, shape and number — never colour alone. */
function Completion({ rate, compact }: { rate: number | null; compact?: boolean }) {
  if (rate === null) return <span className="text-faint text-[12px]">Nothing due</span>;
  const tier = tierOf(rate) as Tier;
  const { shape, tone } = TIERS[tier];
  return (
    <>
      {compact ? null : (
        <span className="h-1.5 min-w-12 flex-1 rounded-full" style={{ background: "var(--surface-sunken)" }} aria-hidden="true">
          <span className="block h-full rounded-full" style={{ width: `${rate}%`, background: toneColour(tone) }} />
        </span>
      )}
      <span className="tabular w-14 shrink-0 text-right text-[13px] font-semibold" style={{ color: `var(--${tone})` }}>
        <span aria-hidden="true" className="mr-1 text-[10px]">
          {shape}
        </span>
        {Math.round(rate)}%
      </span>
    </>
  );
}

function LastEntry({ at }: { at: string | null }) {
  if (!at) return <span className="text-faint text-[12px]">Never</span>;
  const hours = (Date.now() - new Date(at).getTime()) / 3_600_000;
  const tone = hours < 3 ? "pass" : hours < 8 ? "warn" : "fail";
  return (
    <span className="text-[12px] whitespace-nowrap" style={{ color: `var(--${tone})` }}>
      <span aria-hidden="true">● </span>
      {shortAgo(at)}
    </span>
  );
}

function TierLegend() {
  return (
    <p className="flex flex-wrap gap-x-4 gap-y-1 border-t px-5 py-2.5 text-[12px]">
      {(Object.keys(TIERS) as Tier[]).map((tier) => (
        <span key={tier} style={{ color: `var(--${TIERS[tier].tone})` }}>
          <span aria-hidden="true">{TIERS[tier].shape}</span> {TIERS[tier].label}
        </span>
      ))}
    </p>
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

/** "48 m ago", "4 h ago", "yesterday", "3 d ago" — short enough for a column. */
function shortAgo(iso: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? "yesterday" : `${days} d ago`;
}
