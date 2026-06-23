"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Users, UserPlus, Ban, TrendingUp, HeartPulse,
  LineChart as LineChartIcon, ChevronDown, Calendar,
  Download, ArrowUpDown, Bot,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Card, CardContent, EmptyState, StatCardSkeleton } from "@/components/ui";
import { analyticsApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import type { UserAnalyticsSeriesItem } from "@/types";

// ─── Jalali Helpers ────────────────────────────────────────
function toJalaliDate(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00Z");
    const parts = new Intl.DateTimeFormat("fa-IR", {
      year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value ?? "";
    const m = parts.find((p) => p.type === "month")?.value ?? "";
    const dd = parts.find((p) => p.type === "day")?.value ?? "";
    return `${y}/${m}/${dd}`;
  } catch {
    return iso;
  }
}

function toJalaliShort(iso: string): string {
  try {
    const d = new Date(iso + "T00:00:00Z");
    return d.toLocaleDateString("fa-IR", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// ─── Helpers ────────────────────────────────────────────────
const now = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
};

function percentChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

// ─── Time Range Presets ─────────────────────────────────────
interface TimePreset {
  label: string;
  shortLabel: string;
  startDate: string;
  endDate: string;
}

function getTimePresets(): TimePreset[] {
  return [
    { label: "۲۴ ساعت", shortLabel: "۲۴س", startDate: daysAgo(1), endDate: now() },
    { label: "۷ روز", shortLabel: "۷ر", startDate: daysAgo(7), endDate: now() },
    { label: "۲۸ روز", shortLabel: "۲۸ر", startDate: daysAgo(28), endDate: now() },
    { label: "۳ ماه", shortLabel: "۳م", startDate: daysAgo(90), endDate: now() },
  ];
}

// ─── Metrics Config ─────────────────────────────────────────
const METRICS_CONFIG: Record<string, { label: string; color: string; icon: ReactNode }> = {
  realUsers: { label: "کاربران واقعی", color: "#3b82f6", icon: <Users className="h-4 w-4" /> },
  mau: { label: "ماهانه", color: "#22c55e", icon: <Users className="h-4 w-4" /> },
  wau: { label: "هفتگی", color: "#a855f7", icon: <Users className="h-4 w-4" /> },
  dau: { label: "روزانه", color: "#f59e0b", icon: <Users className="h-4 w-4" /> },
  newUsers: { label: "کاربران جدید", color: "#06b6d4", icon: <UserPlus className="h-4 w-4" /> },
  blocked: { label: "مسدود شده", color: "#ef4444", icon: <Ban className="h-4 w-4" /> },
  bots: { label: "ربات‌ها", color: "#6b7280", icon: <Bot className="h-4 w-4" /> },
  growthRate: { label: "نرخ رشد", color: "#ec4899", icon: <TrendingUp className="h-4 w-4" /> },
  healthScore: { label: "سلامت", color: "#14b8a6", icon: <HeartPulse className="h-4 w-4" /> },
};

// ─── Export ──────────────────────────────────────────────────
function downloadCSV(series: UserAnalyticsSeriesItem[], metrics: string[]) {
  const header = ["تاریخ", ...metrics.map((m) => METRICS_CONFIG[m]?.label ?? m)];
  const rows = series.map((row) => [
    toJalaliDate(row.date),
    ...metrics.map((m) => String((row as any)[m] ?? "")),
  ]);
  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `user-analytics-${now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(series: UserAnalyticsSeriesItem[]) {
  const blob = new Blob([JSON.stringify(series, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `user-analytics-${now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Time Range Bar ─────────────────────────────────────────
function TimeRangeBar({
  activePreset,
  onSelect,
  startDate,
  endDate,
  onCustomDateChange,
}: {
  activePreset: number | null;
  onSelect: (index: number) => void;
  startDate: string;
  endDate: string;
  onCustomDateChange: (start: string, end: string) => void;
}) {
  const [showMore, setShowMore] = useState(false);
  const presets = getTimePresets();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
        {presets.map((p, i) => (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
              activePreset === i
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            {p.shortLabel}
          </button>
        ))}
        <button
          onClick={() => setShowMore(!showMore)}
          className={`flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-medium transition-all ${
            activePreset === null
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          بیشتر
          <ChevronDown className={`h-3 w-3 transition-transform ${showMore ? "rotate-180" : ""}`} />
        </button>
      </div>
      {showMore && (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-background p-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            value={startDate}
            onChange={(e) => onCustomDateChange(e.target.value, endDate)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          />
          <span className="text-xs text-muted-foreground">تا</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onCustomDateChange(startDate, e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1 text-xs"
          />
        </div>
      )}
    </div>
  );
}

// ─── Metric Card ────────────────────────────────────────────
function MetricCard({
  title,
  value,
  icon,
  color,
  enabled,
  onToggle,
  trend,
  delay = 0,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  enabled: boolean;
  onToggle: () => void;
  trend?: number | null;
  delay?: number;
}) {
  return (
    <div
      className={`group relative rounded-xl border p-4 transition-all cursor-pointer ${
        enabled
          ? "border-border bg-card shadow-sm hover:shadow-md"
          : "border-border/50 bg-muted/30 opacity-60 hover:opacity-80"
      }`}
      style={{ animationDelay: `${delay}ms` }}
      onClick={onToggle}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex h-8 w-8 items-center justify-center rounded-lg transition-all"
            style={{
              backgroundColor: enabled ? `${color}15` : "#6b728015",
              color: enabled ? color : "#6b7280",
            }}
          >
            {icon}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-lg font-bold tabular-nums text-foreground">
              {typeof value === "number" ? formatNumber(value) : value}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {trend !== null && trend !== undefined && (
            <span className={`text-xs font-medium ${trend >= 0 ? "text-green-500" : "text-red-500"}`}>
              {trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%
            </span>
          )}
          <div
            className={`h-4 w-4 rounded border-2 transition-all flex items-center justify-center ${
              enabled ? "border-primary bg-primary" : "border-muted-foreground/30"
            }`}
          >
            {enabled && (
              <svg className="h-2.5 w-2.5 text-primary-foreground" viewBox="0 0 12 12" fill="none">
                <path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function AnalyticsPage() {
  const [activePreset, setActivePreset] = useState<number | null>(2); // default: 28 days
  const [startDate, setStartDate] = useState(daysAgo(28));
  const [endDate, setEndDate] = useState(now());
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    new Set(["realUsers", "mau", "dau", "newUsers"])
  );
  const [sortKey, setSortKey] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tablePage, setTablePage] = useState(1);
  const rowsPerPage = 10;

  const presets = getTimePresets();

  const handlePresetSelect = useCallback((index: number) => {
    setActivePreset(index);
    setStartDate(presets[index].startDate);
    setEndDate(presets[index].endDate);
  }, [presets]);

  const handleCustomDateChange = useCallback((start: string, end: string) => {
    setActivePreset(null);
    setStartDate(start);
    setEndDate(end);
  }, []);

  // Sync URL params
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const s = params.get("start");
    const e = params.get("end");
    if (s && e) {
      setStartDate(s);
      setEndDate(e);
      const matchIdx = presets.findIndex((p) => p.startDate === s && p.endDate === e);
      setActivePreset(matchIdx >= 0 ? matchIdx : null);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("start", startDate);
    url.searchParams.set("end", endDate);
    window.history.replaceState({}, "", url.toString());
  }, [startDate, endDate]);

  const queryParams = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);

  const query = useQuery({
    queryKey: ["analytics-users", queryParams],
    queryFn: () => analyticsApi.users(queryParams),
    placeholderData: (prev: any) => prev,
  });

  const d = query.data?.data;

  const toggleMetric = (key: string) => {
    setSelectedMetrics((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sortedSeries = useMemo(() => {
    if (!d?.series) return [];
    return [...d.series].sort((a, b) => {
      const va = (a as any)[sortKey] ?? 0;
      const vb = (b as any)[sortKey] ?? 0;
      if (typeof va === "string") {
        return sortDir === "asc" ? va.localeCompare(vb as string) : (vb as string).localeCompare(va);
      }
      return sortDir === "asc" ? va - vb : vb - va;
    });
  }, [d?.series, sortKey, sortDir]);

  const paginatedSeries = useMemo(() => {
    const start = (tablePage - 1) * rowsPerPage;
    return sortedSeries.slice(start, start + rowsPerPage);
  }, [sortedSeries, tablePage]);

  const totalPages = Math.ceil(sortedSeries.length / rowsPerPage);

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir((p) => (p === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="section-title">تحلیل کاربران</h1>
            <p className="text-sm text-muted-foreground">داشبورد پیشرفته عملکرد کاربران</p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 9 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }
  if (!d) return <EmptyState />;

  const { kpis, compareSummary, series } = d;

  const kpiCards = [
    { key: "realUsers", title: "کاربران واقعی", value: kpis.realUsers, icon: <Users className="h-4 w-4" />, color: "#3b82f6" },
    { key: "totalUsers", title: "کل کاربران", value: kpis.totalUsers, icon: <Users className="h-4 w-4" />, color: "#6366f1" },
    { key: "newUsers", title: "کاربران جدید", value: kpis.newUsers, icon: <UserPlus className="h-4 w-4" />, color: "#06b6d4" },
    { key: "dau", title: "روزانه", value: kpis.dau, icon: <Users className="h-4 w-4" />, color: "#f59e0b" },
    { key: "wau", title: "هفتگی", value: kpis.wau, icon: <Users className="h-4 w-4" />, color: "#a855f7" },
    { key: "mau", title: "ماهانه", value: kpis.mau, icon: <Users className="h-4 w-4" />, color: "#22c55e" },
    { key: "blocked", title: "مسدود شده", value: kpis.blocked, icon: <Ban className="h-4 w-4" />, color: "#ef4444" },
    { key: "bots", title: "ربات‌ها", value: kpis.bots, icon: <Bot className="h-4 w-4" />, color: "#6b7280" },
    { key: "growthRate", title: "نرخ رشد", value: `${kpis.growthRate}%`, icon: <TrendingUp className="h-4 w-4" />, color: "#ec4899" },
    { key: "healthScore", title: "سلامت", value: `${kpis.healthScore}`, icon: <HeartPulse className="h-4 w-4" />, color: "#14b8a6" },
  ];

  const tableColumns = [
    { key: "date", label: "تاریخ" },
    { key: "realUsers", label: "واقعی" },
    { key: "dau", label: "روزانه" },
    { key: "wau", label: "هفتگی" },
    { key: "mau", label: "ماهانه" },
    { key: "newUsers", label: "جدید" },
    { key: "blocked", label: "مسدود" },
    { key: "bots", label: "ربات‌ها" },
    { key: "growthRate", label: "رشد" },
    { key: "healthScore", label: "سلامت" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title">تحلیل کاربران</h1>
          <p className="text-sm text-muted-foreground">
            داشبورد پیشرفته عملکرد کاربران با قابلیت مقایسه و خروجی
          </p>
        </div>
      </div>

      {/* Time Range Bar */}
      <TimeRangeBar
        activePreset={activePreset}
        onSelect={handlePresetSelect}
        startDate={startDate}
        endDate={endDate}
        onCustomDateChange={handleCustomDateChange}
      />

      {/* Metric Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpiCards.map((k, i) => (
          <MetricCard
            key={k.key}
            title={k.title}
            value={k.value}
            icon={k.icon}
            color={k.color}
            enabled={selectedMetrics.has(k.key)}
            onToggle={() => toggleMetric(k.key)}
            delay={i * 30}
          />
        ))}
      </div>

      {/* Compare Summary */}
      {compareSummary && (
        <Card>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">کاربران جدید دوره قبل</p>
              <p className="text-xl font-bold">{formatNumber(compareSummary.totalNewUsers)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">مجموع روزانه دوره قبل</p>
              <p className="text-xl font-bold">{formatNumber(compareSummary.totalDAU)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inactive Users */}
      <Card>
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">کاربران غیرفعال</h2>
        </div>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">۳۰ روز</p>
            <p className="text-xl font-bold">{formatNumber(kpis.inactive30)}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">۶۰ روز</p>
            <p className="text-xl font-bold">{formatNumber(kpis.inactive60)}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-4">
            <p className="text-sm text-muted-foreground">۹۰ روز</p>
            <p className="text-xl font-bold">{formatNumber(kpis.inactive90)}</p>
          </div>
        </CardContent>
      </Card>

      {/* Line Chart */}
      <Card>
        <div className="p-5 border-b border-border">
          <h2 className="flex items-center gap-2 font-semibold text-foreground">
            <LineChartIcon className="h-4 w-4" /> نمودار روند زمانی
          </h2>
        </div>
        <CardContent className="h-80">
          {selectedMetrics.size === 0 ? (
            <EmptyState title="هیچ شاخصی انتخاب نشده" description="روی کارت‌های بالا کلیک کنید تا نمودار نمایش داده شود" />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <defs>
                  {Array.from(selectedMetrics).map((metric) => (
                    <linearGradient key={metric} id={`grad-${metric}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={METRICS_CONFIG[metric]?.color ?? "#888"} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={METRICS_CONFIG[metric]?.color ?? "#888"} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "#888" }}
                  tickFormatter={(v: string) => toJalaliShort(v)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} width={50} />
                <Tooltip
                  labelFormatter={(label: ReactNode) => `تاریخ: ${toJalaliDate(String(label ?? ""))}`}
                  formatter={(value: any, name: any) => [
                    formatNumber(Number(value ?? 0)),
                    METRICS_CONFIG[name as string]?.label ?? String(name),
                  ]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                  }}
                />
                {Array.from(selectedMetrics).map((metric) => (
                  <Area
                    key={metric}
                    type="monotone"
                    dataKey={metric}
                    name={metric}
                    stroke={METRICS_CONFIG[metric]?.color ?? "#888"}
                    fill={`url(#grad-${metric})`}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Export */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">خروجی:</span>
        <button
          onClick={() => downloadCSV(series, Array.from(selectedMetrics))}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Download className="h-4 w-4" /> CSV
        </button>
        <button
          onClick={() => downloadJSON(series)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Download className="h-4 w-4" /> JSON
        </button>
      </div>

      {/* Data Table */}
      <Card>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">جدول داده‌ها</h2>
          <span className="text-sm text-muted-foreground">{formatNumber(series.length)} ردیف</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {tableColumns.map((col) => (
                  <th
                    key={col.key}
                    className="cursor-pointer px-4 py-3 text-right font-medium text-muted-foreground hover:text-foreground transition-colors"
                    onClick={() => handleSort(col.key)}
                  >
                    <span className="flex items-center gap-1">
                      {col.label}
                      <ArrowUpDown className={`h-3 w-3 ${sortKey === col.key ? "text-primary" : ""}`} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paginatedSeries.map((row) => (
                <tr key={row.date} className="border-b border-border/50 transition-colors hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{toJalaliDate(row.date)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(row.realUsers)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(row.dau)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(row.wau)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(row.mau)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(row.newUsers)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(row.blocked)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(row.bots)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {row.growthRate !== null ? (
                      <span className={row.growthRate >= 0 ? "text-green-500" : "text-red-500"}>
                        {row.growthRate >= 0 ? "+" : ""}{row.growthRate}%
                      </span>
                    ) : "-"}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.healthScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-sm text-muted-foreground">
              صفحه {formatNumber(tablePage)} از {formatNumber(totalPages)}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setTablePage((p) => Math.max(1, p - 1))}
                disabled={tablePage === 1}
                className="px-3 py-1.5 rounded-lg text-sm hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                قبلی
              </button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const start = Math.max(1, Math.min(tablePage - 2, totalPages - 4));
                return start + i;
              }).filter((p) => p <= totalPages).map((p) => (
                <button
                  key={p}
                  onClick={() => setTablePage(p)}
                  className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                    p === tablePage
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted text-muted-foreground"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setTablePage((p) => Math.min(totalPages, p + 1))}
                disabled={tablePage === totalPages}
                className="px-3 py-1.5 rounded-lg text-sm hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
              >
                بعدی
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
