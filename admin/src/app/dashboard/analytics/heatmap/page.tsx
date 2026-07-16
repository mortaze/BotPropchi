"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, EmptyState, StatCardSkeleton } from "@/components/ui";
import { TimeRangeSelector } from "@/components/shared/TimeRangeSelector";
import { analyticsApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Tooltip,
  AreaChart, Area,
} from "recharts";
import { Clock, Activity } from "lucide-react";

// ─── Persian Date Helpers ───────────────────────────────────
function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gy;
  if (gm > 2) gy2 += 1;
  let days = 355666 + 365 * gy2 + Math.floor(gy2 / 4) - Math.floor(gy2 / 100) + Math.floor(gy2 / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let jm: number, jd: number;
  if (days < 186) { jm = 1 + Math.floor(days / 31); jd = 1 + (days % 31); }
  else { jm = 7 + Math.floor((days - 186) / 30); jd = 1 + ((days - 186) % 30); }
  return [jy, jm, jd];
}

function isoToJalaliFull(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00.000Z");
    const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
  } catch { return iso; }
}

const nowIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// ─── Heatmap Color ──────────────────────────────────────────
function getHeatColor(value: number, max: number): string {
  if (max === 0) return "rgb(239 246 255)";
  const ratio = value / max;
  if (ratio === 0) return "rgb(239 246 255)";
  if (ratio < 0.25) return "rgb(191 219 254)";
  if (ratio < 0.5) return "rgb(147 197 253)";
  if (ratio < 0.75) return "rgb(96 165 250)";
  return "rgb(59 130 246)";
}

// ─── Main Page ───────────────────────────────────────────────
export default function HeatmapPage() {
  const [startDate, setStartDate] = useState(daysAgoIso(28));
  const [endDate, setEndDate] = useState(nowIso());
  const [activePreset, setActivePreset] = useState<number | null>(2);

  const presets = useMemo(() => [
    { start: daysAgoIso(1), end: nowIso(), label: "۲۴ ساعت" },
    { start: daysAgoIso(7), end: nowIso(), label: "۷ روز" },
    { start: daysAgoIso(28), end: nowIso(), label: "۲۸ روز" },
    { start: daysAgoIso(90), end: nowIso(), label: "۳ ماه" },
  ], []);

  const queryParams = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);

  const query = useQuery({
    queryKey: ["analytics-heatmap", queryParams],
    queryFn: () => analyticsApi.heatmap(queryParams),
    placeholderData: (prev: any) => prev,
  });

  const d = query.data?.data;

  const heatmapMax = useMemo(() => {
    if (!d?.heatmap) return 0;
    return Math.max(...d.heatmap.flat(), 1);
  }, [d?.heatmap]);

  const hourlyChartData = useMemo(() => {
    if (!d?.hourlyTotals) return [];
    return d.hourlyTotals.map((h) => ({
      hour: `${String(h.hour).padStart(2, "0")}:۰۰`,
      count: h.count,
    }));
  }, [d?.hourlyTotals]);

  const dailyChartData = useMemo(() => {
    if (!d?.dailyData) return [];
    return d.dailyData.map((item) => ({
      date: isoToJalaliFull(item.date),
      count: item.count,
    }));
  }, [d?.dailyData]);

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header"><div><h1 className="section-title">نقشه حرارتی فعالیت</h1></div></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }
  if (!d) return <EmptyState />;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title">نقشه حرارتی فعالیت</h1>
          <p className="text-sm text-muted-foreground">
            بازه: {isoToJalaliFull(startDate)} تا {isoToJalaliFull(endDate)}
          </p>
        </div>
      </div>

      {/* Time Range */}
      <TimeRangeSelector
        presets={presets}
        startDate={startDate}
        endDate={endDate}
        activePreset={activePreset}
        onStartChange={(v) => { setStartDate(v); setActivePreset(null); }}
        onEndChange={(v) => { setEndDate(v); setActivePreset(null); }}
        onPresetSelect={(i, p) => { setActivePreset(i); setStartDate(p.start); setEndDate(p.end); }}
      />

      {/* Heatmap Grid */}
      <Card>
        <div className="p-5 border-b border-border">
          <h2 className="flex items-center gap-2 font-semibold text-foreground">
            <Activity className="h-4 w-4" /> نقشه حرارتی فعالیت کاربران
          </h2>
          <p className="text-xs text-muted-foreground mt-1">ساعات به وقت تهران (Asia/Tehran)</p>
        </div>
        <CardContent className="overflow-x-auto">
          <div className="min-w-[700px]">
            {/* Hour labels */}
            <div className="flex items-center mb-2">
              <div className="w-20" />
              {Array.from({ length: 24 }, (_, i) => (
                <div key={i} className="flex-1 text-center text-[9px] text-muted-foreground">
                  {String(i).padStart(2, "0")}
                </div>
              ))}
            </div>
            {/* Heatmap rows */}
            {d.dayLabels.map((dayLabel, dow) => (
              <div key={dow} className="flex items-center mb-1">
                <div className="w-20 text-xs font-medium text-muted-foreground text-right pr-2">{dayLabel}</div>
                {Array.from({ length: 24 }, (_, hour) => {
                  const value = d.heatmap[dow]?.[hour] ?? 0;
                  return (
                    <div key={hour} className="flex-1 aspect-square mx-0.5 rounded-sm transition-colors group relative"
                      style={{ backgroundColor: getHeatColor(value, heatmapMax) }}>
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-10">
                        <div className="rounded-lg bg-card border border-border px-2 py-1 text-[10px] shadow-lg whitespace-nowrap" dir="rtl">
                          {dayLabel} {String(hour).padStart(2, "0")}:۰۰<br />
                          کاربران فعال: {formatNumber(value)} نفر
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
            {/* Legend */}
            <div className="flex items-center justify-end gap-2 mt-3">
              <span className="text-[10px] text-muted-foreground">کم</span>
              {[0.25, 0.5, 0.75, 1].map((r) => (
                <div key={r} className="w-4 h-4 rounded-sm" style={{ backgroundColor: getHeatColor(Math.round(heatmapMax * r), heatmapMax) }} />
              ))}
              <span className="text-[10px] text-muted-foreground">زیاد</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hourly Activity Chart */}
      <Card>
        <div className="p-5 border-b border-border">
          <h2 className="flex items-center gap-2 font-semibold text-foreground">
            <Clock className="h-4 w-4" /> فعالیت بر اساس ساعت
          </h2>
        </div>
        <CardContent className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={hourlyChartData}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="hour" tick={{ fontSize: 9 }} interval={2} />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <Tooltip
                formatter={(value: any) => [formatNumber(Number(value)), "کاربران فعال"]}
                contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", direction: "rtl" }}
              />
              <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Daily Activity Chart */}
      {dailyChartData.length > 1 && (
        <Card>
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">فعالیت روزانه</h2>
          </div>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyChartData}>
                <defs>
                  <linearGradient id="grad-daily" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis dataKey="date" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 10 }} width={40} />
                <Tooltip
                  formatter={(value: any) => [formatNumber(Number(value)), "کاربران فعال"]}
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px", direction: "rtl" }}
                />
                <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="url(#grad-daily)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
