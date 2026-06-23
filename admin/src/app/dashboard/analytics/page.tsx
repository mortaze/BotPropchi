"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Users, UserPlus, Ban, TrendingUp, HeartPulse,
  LineChart as LineChartIcon, ChevronDown,
  Download, ArrowUpDown, X,
} from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Card, CardContent, EmptyState, StatCardSkeleton } from "@/components/ui";
import { analyticsApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import type { UserAnalyticsSeriesItem } from "@/types";

// ─── Persian Date Helpers ───────────────────────────────────
const PERSIAN_MONTHS = [
  "ژانویه", "فوریه", "مارس", "آوریل", "مه", "ژوئن",
  "ژوئیه", "اوت", "سپتامبر", "اکتبر", "نوامبر", "دسامبر",
];
const PERSIAN_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function toJalaliDate(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00.000Z");
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
    const d = new Date(iso + "T12:00:00.000Z");
    return d.toLocaleDateString("fa-IR", { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

// Gregorian to Jalali converter
function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gy;
  if (gm > 2) gy2 += 1;
  let days = 355666 + 365 * gy2 + Math.floor(gy2 / 4) - Math.floor(gy2 / 100) + Math.floor(gy2 / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let jm: number, jd: number;
  if (days < 186) {
    jm = 1 + Math.floor(days / 31);
    jd = 1 + (days % 31);
  } else {
    jm = 7 + Math.floor((days - 186) / 30);
    jd = 1 + ((days - 186) % 30);
  }
  return [jy, jm, jd];
}

function isoToJalaliFull(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00.000Z");
    const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    const dd = String(jd).padStart(2, "0");
    const mm = String(jm).padStart(2, "0");
    return `${jy}/${mm}/${dd}`;
  } catch {
    return iso;
  }
}

function isoToJalaliShortFa(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00.000Z");
    const [, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    const monthName = PERSIAN_MONTHS_FA[jm - 1] ?? "";
    return `${jd} ${monthName}`;
  } catch {
    return iso;
  }
}

function formatJalaliDateInput(dateStr: string): string {
  try {
    const d = new Date(dateStr + "T12:00:00.000Z");
    const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return `${jy}-${String(jm).padStart(2, "0")}-${String(jd).padStart(2, "0")}`;
  } catch {
    return dateStr;
  }
}

function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const j_d_m = [0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336];
  const jd2 = jd + (jm < 7 ? 0 : j_d_m[jm - 7]);
  let gy = jy + 621;
  let gd: number;
  let gm: number;
  const daysFromJalaliEpoch = jd2 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + 4 + (jy > 0 ? -94 : -95);
  const daysFromGregorianEpoch = daysFromJalaliEpoch + 79;
  const g4 = daysFromGregorianEpoch + 1;
  const y1 = Math.floor((g4 - 1) / 146097);
  const y2 = Math.floor((g4 - 1 - y1 * 146097) / 36524);
  const y3 = Math.floor((g4 - 1 - y1 * 146097 - y2 * 36524) / 1461);
  const y4 = Math.floor((g4 - 1 - y1 * 146097 - y2 * 36524 - y3 * 1461) / 365);
  gy = y1 * 100 + y2 * 4 + y3 + y4;
  if (y4 === 4) {
    gm = 12;
    gd = 31;
  } else {
    const doy = g4 - 1 - y1 * 146097 - y2 * 36524 - y3 * 1461 - y4 * 365;
    const mo = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    const daysInMonth = [31, 28 + (y4 === 0 && (y1 !== 0 || y2 !== 0 || y3 % 4 !== 3) ? 0 : 1), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let md = doy;
    gm = 1;
    for (let i = 0; i < 12; i++) {
      if (md < daysInMonth[i]) break;
      md -= daysInMonth[i];
      gm = mo[i] + (i < 11 ? 1 : 0);
    }
    gd = md + 1;
  }
  return new Date(Date.UTC(gy, gm - 1, gd, 12, 0, 0, 0));
}

// ─── Helpers ────────────────────────────────────────────────
const nowIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n: number) => {
  const d = new Date(Date.now() - n * 86400000);
  return d.toISOString().slice(0, 10);
};

// ─── Metrics Config ─────────────────────────────────────────
const METRICS_CONFIG: Record<string, { label: string; color: string; icon: ReactNode }> = {
  realUsers: { label: "کاربران واقعی", color: "#3b82f6", icon: <Users className="h-4 w-4" /> },
  newUsers: { label: "کاربران جدید", color: "#06b6d4", icon: <UserPlus className="h-4 w-4" /> },
  blocked: { label: "مسدود شده", color: "#ef4444", icon: <Ban className="h-4 w-4" /> },
  growthRate: { label: "نرخ رشد", color: "#ec4899", icon: <TrendingUp className="h-4 w-4" /> },
  healthScore: { label: "سلامت سیستم", color: "#14b8a6", icon: <HeartPulse className="h-4 w-4" /> },
};

// ─── Export ──────────────────────────────────────────────────
function downloadCSV(series: UserAnalyticsSeriesItem[], metrics: string[]) {
  const header = ["تاریخ", ...metrics.map((m) => METRICS_CONFIG[m]?.label ?? m)];
  const rows = series.map((row) => [
    isoToJalaliFull(row.date),
    ...metrics.map((m) => String((row as any)[m] ?? "")),
  ]);
  const csv = [header.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `user-analytics-${nowIso()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadJSON(series: UserAnalyticsSeriesItem[]) {
  const blob = new Blob([JSON.stringify(series, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `user-analytics-${nowIso()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Jalali DatePicker Component ────────────────────────────
function JalaliDatePicker({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (iso: string) => void;
  label: string;
}) {
  const [jy, jm, jd] = useMemo(() => {
    try {
      const d = new Date(value + "T12:00:00.000Z");
      return gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    } catch {
      return [1404, 1, 1];
    }
  }, [value]);

  const [editY, setEditY] = useState(String(jy));
  const [editM, setEditM] = useState(String(jm));
  const [editD, setEditD] = useState(String(jd));

  useEffect(() => {
    setEditY(String(jy));
    setEditM(String(jm));
    setEditD(String(jd));
  }, [jy, jm, jd]);

  const apply = () => {
    const y = parseInt(editY, 10);
    const m = parseInt(editM, 10);
    const d = parseInt(editD, 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return;
    if (m < 1 || m > 12 || d < 1 || d > 31) return;
    const gregDate = jalaliToGregorian(y, m, d);
    const iso = gregDate.toISOString().slice(0, 10);
    onChange(iso);
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <div className="flex items-center gap-1 rounded-lg border border-input bg-background px-2 py-1.5">
        <input
          type="text"
          value={editD}
          onChange={(e) => setEditD(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className="w-8 text-center text-xs bg-transparent outline-none"
          maxLength={2}
          placeholder="روز"
        />
        <span className="text-xs text-muted-foreground">/</span>
        <input
          type="text"
          value={editM}
          onChange={(e) => setEditM(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className="w-8 text-center text-xs bg-transparent outline-none"
          maxLength={2}
          placeholder="ماه"
        />
        <span className="text-xs text-muted-foreground">/</span>
        <input
          type="text"
          value={editY}
          onChange={(e) => setEditY(e.target.value)}
          onBlur={apply}
          onKeyDown={(e) => e.key === "Enter" && apply()}
          className="w-12 text-center text-xs bg-transparent outline-none"
          maxLength={4}
          placeholder="سال"
        />
      </div>
      <span className="text-[10px] text-muted-foreground">
        {PERSIAN_MONTHS_FA[(parseInt(editM, 10) || 1) - 1] ?? ""}
      </span>
    </div>
  );
}

// ─── More Modal ─────────────────────────────────────────────
function MoreModal({
  open,
  onClose,
  startDate,
  endDate,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  startDate: string;
  endDate: string;
  onApply: (start: string, end: string) => void;
}) {
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const [activeTab, setActiveTab] = useState<"range" | "compare">("range");

  useEffect(() => {
    if (open) {
      setLocalStart(startDate);
      setLocalEnd(endDate);
    }
  }, [open, startDate, endDate]);

  const quickRanges = [
    { label: "۶ ماه اخیر", start: daysAgoIso(180), end: nowIso() },
    { label: "۱۲ ماه اخیر", start: daysAgoIso(365), end: nowIso() },
    { label: "۱۶ ماه اخیر", start: daysAgoIso(480), end: nowIso() },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl animate-fade-in overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-semibold text-foreground">بازه زمانی سفارشی</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setActiveTab("range")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "range"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            بازه زمانی
          </button>
          <button
            onClick={() => setActiveTab("compare")}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === "compare"
                ? "text-primary border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            مقایسه
          </button>
        </div>

        <div className="p-5 space-y-5">
          {activeTab === "range" && (
            <>
              {/* Quick ranges */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">انتخاب سریع</p>
                <div className="flex flex-wrap gap-2">
                  {quickRanges.map((qr) => (
                    <button
                      key={qr.label}
                      onClick={() => { setLocalStart(qr.start); setLocalEnd(qr.end); }}
                      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                        localStart === qr.start && localEnd === qr.end
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {qr.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom date pickers */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground">بازه سفارشی</p>
                <div className="flex items-center gap-4 flex-wrap">
                  <JalaliDatePicker value={localStart} onChange={setLocalStart} label="از:" />
                  <JalaliDatePicker value={localEnd} onChange={setLocalEnd} label="تا:" />
                </div>
                <p className="text-xs text-muted-foreground">
                  از {isoToJalaliFull(localStart)} تا {isoToJalaliFull(localEnd)}
                </p>
              </div>
            </>
          )}

          {activeTab === "compare" && (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                بازه فعلی: {isoToJalaliFull(localStart)} تا {isoToJalaliFull(localEnd)}
              </p>
              <p className="text-sm text-foreground">
                مقایسه با بازه قبلی مشابه ({localStart} تا {localEnd})
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            انصراف
          </button>
          <button
            onClick={() => { onApply(localStart, localEnd); onClose(); }}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            اعمال
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Time Range Bar ─────────────────────────────────────────
function TimeRangeBar({
  activePreset,
  onSelect,
  onMoreClick,
}: {
  activePreset: number | null;
  onSelect: (index: number) => void;
  onMoreClick: () => void;
}) {
  const presets = [
    { label: "۲۴ ساعت", shortLabel: "۲۴ ساعت" },
    { label: "۷ روز", shortLabel: "۷ روز" },
    { label: "۲۸ روز", shortLabel: "۲۸ روز" },
    { label: "۳ ماه", shortLabel: "۳ ماه" },
  ];

  return (
    <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
      {presets.map((p, i) => (
        <button
          key={i}
          onClick={() => onSelect(i)}
          className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
            activePreset === i
              ? "bg-primary text-primary-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          {p.shortLabel}
        </button>
      ))}
      <button
        onClick={onMoreClick}
        className={`flex items-center gap-1.5 rounded-md px-4 py-2 text-sm font-medium transition-all ${
          activePreset === null
            ? "bg-primary text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:text-foreground hover:bg-muted"
        }`}
      >
        بیشتر
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${activePreset === null ? "rotate-180" : ""}`} />
      </button>
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
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl transition-all"
            style={{
              backgroundColor: enabled ? `${color}15` : "#6b728015",
              color: enabled ? color : "#6b7280",
            }}
          >
            {icon}
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">{title}</p>
            <p className="text-xl font-bold tabular-nums text-foreground">
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
            className={`h-5 w-5 rounded-md border-2 transition-all flex items-center justify-center ${
              enabled ? "border-primary bg-primary" : "border-muted-foreground/30"
            }`}
          >
            {enabled && (
              <svg className="h-3 w-3 text-primary-foreground" viewBox="0 0 12 12" fill="none">
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
  const [startDate, setStartDate] = useState(daysAgoIso(28));
  const [endDate, setEndDate] = useState(nowIso());
  const [showMoreModal, setShowMoreModal] = useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<Set<string>>(
    new Set(["realUsers", "newUsers", "blocked"])
  );
  const [sortKey, setSortKey] = useState<string>("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [tablePage, setTablePage] = useState(1);
  const rowsPerPage = 10;
  const debugLogged = useRef(false);

  const presetRanges = useMemo(() => [
    { start: daysAgoIso(1), end: nowIso() },   // 24h
    { start: daysAgoIso(7), end: nowIso() },   // 7d
    { start: daysAgoIso(28), end: nowIso() },  // 28d
    { start: daysAgoIso(90), end: nowIso() },  // 3mo
  ], []);

  const handlePresetSelect = useCallback((index: number) => {
    setActivePreset(index);
    setStartDate(presetRanges[index].start);
    setEndDate(presetRanges[index].end);
  }, [presetRanges]);

  const handleMoreApply = useCallback((start: string, end: string) => {
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
      const matchIdx = presetRanges.findIndex((p) => p.start === s && p.end === e);
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

  // Debug logging
  useEffect(() => {
    if (d && !debugLogged.current) {
      debugLogged.current = true;
      console.group("[Analytics Debug]");
      console.log("Raw API Response:", d);
      console.log("KPIs:", d.kpis);
      console.log("Series length:", d.series?.length);
      console.log("First 5 series items:", d.series?.slice(0, 5));
      console.log("Series non-zero check:", d.series?.filter((s: any) => s.realUsers > 0 || s.newUsers > 0 || s.blocked > 0).length, "non-zero rows");
      console.log("Compare Summary:", d.compareSummary);
      console.groupEnd();
    }
  }, [d]);

  // Also log when data changes
  useEffect(() => {
    if (d) {
      console.log("[Analytics] Data updated:", {
        kpis: d.kpis,
        seriesLength: d.series?.length,
        nonZeroRows: d.series?.filter((s: any) => s.realUsers > 0 || s.newUsers > 0).length,
      });
    }
  }, [d, queryParams]);

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
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }
  if (!d) return <EmptyState />;

  const { kpis, series } = d;

  const kpiCards = [
    { key: "realUsers", title: "کاربران واقعی", value: kpis.realUsers, icon: <Users className="h-5 w-5" />, color: "#3b82f6" },
    { key: "totalUsers", title: "کل کاربران", value: kpis.totalUsers, icon: <Users className="h-5 w-5" />, color: "#6366f1" },
    { key: "newUsers", title: "کاربران جدید", value: kpis.newUsers, icon: <UserPlus className="h-5 w-5" />, color: "#06b6d4" },
    { key: "blocked", title: "مسدود شده", value: kpis.blocked, icon: <Ban className="h-5 w-5" />, color: "#ef4444" },
    { key: "growthRate", title: "نرخ رشد", value: `${kpis.growthRate}%`, icon: <TrendingUp className="h-5 w-5" />, color: "#ec4899" },
    { key: "healthScore", title: "سلامت سیستم", value: `${kpis.healthScore}`, icon: <HeartPulse className="h-5 w-5" />, color: "#14b8a6" },
  ];

  const tableColumns = [
    { key: "date", label: "تاریخ" },
    { key: "realUsers", label: "کاربران واقعی" },
    { key: "newUsers", label: "کاربران جدید" },
    { key: "blocked", label: "مسدود شده" },
    { key: "growthRate", label: "نرخ رشد" },
    { key: "healthScore", label: "سلامت" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      {/* More Modal */}
      <MoreModal
        open={showMoreModal}
        onClose={() => setShowMoreModal(false)}
        startDate={startDate}
        endDate={endDate}
        onApply={handleMoreApply}
      />

      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title">تحلیل کاربران</h1>
          <p className="text-sm text-muted-foreground">
            بازه: {isoToJalaliFull(startDate)} تا {isoToJalaliFull(endDate)}
          </p>
        </div>
      </div>

      {/* Time Range Bar */}
      <TimeRangeBar
        activePreset={activePreset}
        onSelect={handlePresetSelect}
        onMoreClick={() => setShowMoreModal(true)}
      />

      {/* Metric Cards Grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
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

      {/* Line Chart */}
      <Card>
        <div className="p-5 border-b border-border">
          <h2 className="flex items-center gap-2 font-semibold text-foreground">
            <LineChartIcon className="h-4 w-4" /> نمودار روند زمانی
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {isoToJalaliFull(startDate)} تا {isoToJalaliFull(endDate)} — {formatNumber(series.length)} روز
          </p>
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
                  tickFormatter={(v: string) => isoToJalaliShortFa(v)}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 10, fill: "#888" }} width={50} />
                <Tooltip
                  labelFormatter={(label: ReactNode) => `تاریخ: ${isoToJalaliFull(String(label ?? ""))}`}
                  formatter={(value: any, name: any) => [
                    formatNumber(Number(value ?? 0)),
                    METRICS_CONFIG[name as string]?.label ?? String(name),
                  ]}
                  contentStyle={{
                    backgroundColor: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                    fontSize: "12px",
                    direction: "rtl",
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
          <Download className="h-4 w-4" /> خروجی CSV
        </button>
        <button
          onClick={() => downloadJSON(series)}
          className="flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
        >
          <Download className="h-4 w-4" /> خروجی JSON
        </button>
      </div>

      {/* Inactive Users */}
      <Card>
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">کاربران غیرفعال</h2>
          <p className="text-xs text-muted-foreground mt-1">بر اساس آخرین فعالیت کاربر</p>
        </div>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl bg-muted/40 p-4 border border-border/50">
            <p className="text-sm text-muted-foreground">غیرفعال ۳۰ روز</p>
            <p className="text-2xl font-bold mt-1">{formatNumber(kpis.inactive30)}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-4 border border-border/50">
            <p className="text-sm text-muted-foreground">غیرفعال ۶۰ روز</p>
            <p className="text-2xl font-bold mt-1">{formatNumber(kpis.inactive60)}</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-4 border border-border/50">
            <p className="text-sm text-muted-foreground">غیرفعال ۹۰ روز</p>
            <p className="text-2xl font-bold mt-1">{formatNumber(kpis.inactive90)}</p>
          </div>
        </CardContent>
      </Card>

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
                  <td className="px-4 py-3 font-medium">{isoToJalaliFull(row.date)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(row.realUsers)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(row.newUsers)}</td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(row.blocked)}</td>
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
