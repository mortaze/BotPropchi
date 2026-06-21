"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity, Users, BarChart3, Download, ArrowUpDown, UsersRound,
  UserPlus, Ban, TrendingUp, HeartPulse, Calendar,
  LineChart as LineChartIcon,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, EmptyState, StatCardSkeleton } from "@/components/ui";
import { analyticsApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import type { UserAnalyticsSeriesItem } from "@/types";

// ─── Helpers ────────────────────────────────────────────────
const now = () => {
  const d = new Date();
  return d.toISOString().slice(0, 10);
};
const daysAgo = (n: number) => {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
};
const defaultStart = daysAgo(29);
const defaultEnd = now();

function percentChange(current: number, previous: number | undefined): number | null {
  if (previous === undefined || previous === null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 10000) / 100;
}

const METRICS_CONFIG: Record<string, { label: string; color: string }> = {
  realUsers: { label: "کاربران واقعی", color: "#3b82f6" },
  mau: { label: "MAU", color: "#22c55e" },
  wau: { label: "WAU", color: "#a855f7" },
  dau: { label: "DAU", color: "#f59e0b" },
  newUsers: { label: "کاربران جدید", color: "#06b6d4" },
  blocked: { label: "مسدود شده", color: "#ef4444" },
  growthRate: { label: "نرخ رشد %", color: "#ec4899" },
  healthScore: { label: "سلامت", color: "#14b8a6" },
};

function toJalali(iso: string) {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("fa-IR", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// ─── Export ──────────────────────────────────────────────────
function downloadCSV(series: UserAnalyticsSeriesItem[], metrics: string[]) {
  const header = ["تاریخ", ...metrics.map((m) => METRICS_CONFIG[m]?.label ?? m)];
  const rows = series.map((row) => [row.date, ...metrics.map((m) => String((row as any)[m] ?? ""))]);
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

// ─── KPI Card ────────────────────────────────────────────────
function KpiCard({
  title, value, icon, trend, trendLabel, colorClass,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: number | null;
  trendLabel?: string;
  colorClass: string;
}) {
  const positive = (trend ?? 0) >= 0;
  return (
    <div className="stat-card animate-fade-in">
      <div className="mb-3 flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorClass}`}>
          {icon}
        </div>
        {trend !== null && trend !== undefined && (
          <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
            positive ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
          }`}>
            {positive ? "▲" : "▼"} {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">{title}</p>
      {trendLabel && <p className="mt-0.5 text-xs text-muted-foreground">{trendLabel}</p>}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function AnalyticsPage() {
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [compareMode, setCompareMode] = useState(false);
  const [compareStart, setCompareStart] = useState(daysAgo(59));
  const [compareEnd, setCompareEnd] = useState(daysAgo(30));
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(new Set(["realUsers", "mau", "dau", "newUsers"]));
  const [sortKey, setSortKey] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const queryParams = useMemo(() => ({
    startDate, endDate,
    ...(compareMode ? { compareStart, compareEnd } : {}),
  }), [startDate, endDate, compareMode, compareStart, compareEnd]);

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

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir((p) => (p === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header"><div><h1 className="section-title">آمار کاربران</h1></div></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 9 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }
  if (!d) return <EmptyState />;

  const { kpis, compareSummary, series } = d;

  const kpiCards = [
    { key: "totalUsers", title: "کل کاربران", value: kpis.totalUsers, icon: <Users className="h-5 w-5" />, colorClass: "bg-primary/10 text-primary", trend: null },
    { key: "realUsers", title: "کاربران واقعی", value: kpis.realUsers, icon: <UsersRound className="h-5 w-5" />, colorClass: "bg-blue-500/10 text-blue-500", trend: null },
    { key: "mau", title: "MAU", value: kpis.mau, icon: <Activity className="h-5 w-5" />, colorClass: "bg-green-500/10 text-green-500", trend: null },
    { key: "wau", title: "WAU", value: kpis.wau, icon: <Activity className="h-5 w-5" />, colorClass: "bg-purple-500/10 text-purple-500", trend: null },
    { key: "dau", title: "DAU", value: kpis.dau, icon: <Activity className="h-5 w-5" />, colorClass: "bg-amber-500/10 text-amber-500", trend: null },
    { key: "newUsers", title: "کاربران جدید", value: kpis.newUsers, icon: <UserPlus className="h-5 w-5" />, colorClass: "bg-cyan-500/10 text-cyan-500", trend: compareSummary ? percentChange(kpis.newUsers, compareSummary.totalNewUsers) : null },
    { key: "blocked", title: "مسدود شده", value: kpis.blocked, icon: <Ban className="h-5 w-5" />, colorClass: "bg-red-500/10 text-red-500", trend: null },
    { key: "growthRate", title: "نرخ رشد %", value: `${kpis.growthRate}%`, icon: <TrendingUp className="h-5 w-5" />, colorClass: "bg-pink-500/10 text-pink-500", trend: null },
    { key: "healthScore", title: "سلامت", value: `${kpis.healthScore}`, icon: <HeartPulse className="h-5 w-5" />, colorClass: "bg-teal-500/10 text-teal-500", trend: null },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title">آمار کاربران</h1>
          <p className="text-sm text-muted-foreground">
            داشبورد پیشرفته عملکرد کاربران با قابلیت مقایسه و خروجی
          </p>
        </div>
      </div>

      {/* Date Range & Compare */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-6">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">از تاریخ</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">تا تاریخ</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="rounded-md border bg-background px-3 py-2 text-sm" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={compareMode} onChange={(e) => setCompareMode(e.target.checked)}
              className="rounded" />
            حالت مقایسه
          </label>
          {compareMode && (
            <>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">مقایسه از</label>
                <input type="date" value={compareStart} onChange={(e) => setCompareStart(e.target.value)}
                  className="rounded-md border bg-background px-3 py-2 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">مقایسه تا</label>
                <input type="date" value={compareEnd} onChange={(e) => setCompareEnd(e.target.value)}
                  className="rounded-md border bg-background px-3 py-2 text-sm" />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {kpiCards.map((k, i) => (
          <KpiCard key={k.key} {...k} trendLabel={compareMode ? "نسبت به دوره قبل" : undefined} delay={i * 50} />
        ))}
      </div>

      {/* Compare Summary */}
      {compareMode && compareSummary && (
        <Card>
          <CardHeader><h2 className="font-semibold">مقایسه با دوره قبل</h2></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-lg bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">کاربران جدید دوره قبل</p>
              <p className="text-xl font-bold">{formatNumber(compareSummary.totalNewUsers)}</p>
            </div>
            <div className="rounded-lg bg-muted/40 p-4">
              <p className="text-sm text-muted-foreground">مجموع DAU دوره قبل</p>
              <p className="text-xl font-bold">{formatNumber(compareSummary.totalDAU)}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inactive Users */}
      <Card>
        <CardHeader><h2 className="font-semibold">کاربران غیرفعال</h2></CardHeader>
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

      {/* Metric Selector */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">نمودار:</span>
        {Object.entries(METRICS_CONFIG).map(([key, cfg]) => (
          <label key={key} className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={selectedMetrics.has(key)}
              onChange={() => toggleMetric(key)} className="rounded" />
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: cfg.color }} />
              {cfg.label}
            </span>
          </label>
        ))}
      </div>

      {/* Line Chart */}
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 font-semibold">
            <LineChartIcon className="h-4 w-4" /> روند زمانی
          </h2>
        </CardHeader>
        <CardContent className="h-80">
          {selectedMetrics.size === 0 ? (
            <EmptyState />
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={series}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => toJalali(v)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  labelFormatter={(label: string) => toJalali(label)}
                  formatter={(value: number, name: string) => [formatNumber(value), METRICS_CONFIG[name]?.label ?? name]}
                />
                {Array.from(selectedMetrics).map((metric) => (
                  <Area
                    key={metric}
                    type="monotone"
                    dataKey={metric}
                    name={metric}
                    stroke={METRICS_CONFIG[metric]?.color ?? "#888"}
                    fill={METRICS_CONFIG[metric]?.color ?? "#888"}
                    fillOpacity={0.1}
                    strokeWidth={2}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Export */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">خروجی:</span>
        <button onClick={() => downloadCSV(series, Array.from(selectedMetrics))}
          className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
          <Download className="h-4 w-4" /> CSV
        </button>
        <button onClick={() => downloadJSON(series)}
          className="flex items-center gap-2 rounded-lg border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted">
          <Download className="h-4 w-4" /> JSON
        </button>
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <h2 className="flex items-center gap-2 font-semibold">
            <BarChart3 className="h-4 w-4" /> جدول داده‌ها
          </h2>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-muted-foreground">
                {["date", "realUsers", "dau", "wau", "mau", "newUsers", "blocked", "growthRate", "healthScore"].map((key) => (
                  <th key={key} className="cursor-pointer px-3 py-2 text-right font-medium" onClick={() => handleSort(key)}>
                    <span className="flex items-center gap-1">
                      {METRICS_CONFIG[key]?.label ?? {
                        date: "تاریخ",
                      }[key] ?? key}
                      <ArrowUpDown className="h-3 w-3" />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedSeries.map((row) => (
                <tr key={row.date} className="border-b transition-colors hover:bg-muted/40">
                  <td className="px-3 py-2">{toJalali(row.date)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatNumber(row.realUsers)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatNumber(row.dau)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatNumber(row.wau)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatNumber(row.mau)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatNumber(row.newUsers)}</td>
                  <td className="px-3 py-2 tabular-nums">{formatNumber(row.blocked)}</td>
                  <td className="px-3 py-2 tabular-nums">{row.growthRate !== null ? `${row.growthRate}%` : "-"}</td>
                  <td className="px-3 py-2 tabular-nums">{row.healthScore}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
