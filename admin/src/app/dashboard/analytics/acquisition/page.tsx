"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, EmptyState, StatCardSkeleton } from "@/components/ui";
import { analyticsApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { Users, TrendingUp, UserCheck, UserX } from "lucide-react";

// ─── Persian Date Helpers ───────────────────────────────────
const PERSIAN_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

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

function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const j_d_m = [0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336];
  const jd2 = jd + (jm < 7 ? 0 : j_d_m[jm - 7]);
  let gy = jy + 621;
  let gd: number; let gm: number;
  const daysFromJalaliEpoch = jd2 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + 4 + (jy > 0 ? -94 : -95);
  const daysFromGregorianEpoch = daysFromJalaliEpoch + 79;
  const g4 = daysFromGregorianEpoch + 1;
  const y1 = Math.floor((g4 - 1) / 146097);
  const y2 = Math.floor((g4 - 1 - y1 * 146097) / 36524);
  const y3 = Math.floor((g4 - 1 - y1 * 146097 - y2 * 36524) / 1461);
  const y4 = Math.floor((g4 - 1 - y1 * 146097 - y2 * 36524 - y3 * 1461) / 365);
  gy = y1 * 100 + y2 * 4 + y3 + y4;
  if (y4 === 4) { gm = 12; gd = 31; } else {
    const doy = g4 - 1 - y1 * 146097 - y2 * 36524 - y3 * 1461 - y4 * 365;
    const daysInMonth = [31, 28 + (y4 === 0 && (y1 !== 0 || y2 !== 0 || y3 % 4 !== 3) ? 0 : 1), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let md = doy; gm = 1;
    for (let i = 0; i < 12; i++) { if (md < daysInMonth[i]) break; md -= daysInMonth[i]; gm = i + 2; }
    gd = md + 1;
  }
  return new Date(Date.UTC(gy, gm - 1, gd, 12, 0, 0, 0));
}

const nowIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

// ─── Colors ─────────────────────────────────────────────────
const PIE_COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#ef4444", "#a855f7", "#06b6d4", "#6b7280"];

const SOURCE_ICONS: Record<string, string> = {
  referral: "👥",
  direct: "🚀",
  ads: "📢",
  website: "🌐",
  telegram: "📱",
  utm: "📊",
  unknown: "❓",
};

// ─── JalaliDatePicker ───────────────────────────────────────
function JalaliDatePicker({ value, onChange, label }: { value: string; onChange: (iso: string) => void; label: string }) {
  const [jy, jm, jd] = useMemo(() => {
    try {
      const d = new Date(value + "T12:00:00.000Z");
      return gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    } catch { return [1404, 1, 1]; }
  }, [value]);
  const [editY, setEditY] = useState(String(jy));
  const [editM, setEditM] = useState(String(jm));
  const [editD, setEditD] = useState(String(jd));
  const apply = () => {
    const y = parseInt(editY, 10), m = parseInt(editM, 10), d = parseInt(editD, 10);
    if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return;
    onChange(jalaliToGregorian(y, m, d).toISOString().slice(0, 10));
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="flex items-center gap-1 rounded-lg border border-input bg-background px-2 py-1.5">
        <input type="text" value={editD} onChange={(e) => setEditD(e.target.value)} onBlur={apply} onKeyDown={(e) => e.key === "Enter" && apply()} className="w-8 text-center text-xs bg-transparent outline-none" maxLength={2} />
        <span className="text-xs text-muted-foreground">/</span>
        <input type="text" value={editM} onChange={(e) => setEditM(e.target.value)} onBlur={apply} onKeyDown={(e) => e.key === "Enter" && apply()} className="w-8 text-center text-xs bg-transparent outline-none" maxLength={2} />
        <span className="text-xs text-muted-foreground">/</span>
        <input type="text" value={editY} onChange={(e) => setEditY(e.target.value)} onBlur={apply} onKeyDown={(e) => e.key === "Enter" && apply()} className="w-12 text-center text-xs bg-transparent outline-none" maxLength={4} />
      </div>
      <span className="text-[10px] text-muted-foreground">{PERSIAN_MONTHS_FA[(parseInt(editM, 10) || 1) - 1] ?? ""}</span>
    </div>
  );
}

// ─── Custom Tooltip ─────────────────────────────────────────
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-sm" dir="rtl">
      <p className="font-medium text-foreground">{data.label}</p>
      <p className="text-muted-foreground">تعداد: <span className="text-foreground font-medium">{formatNumber(data.count)}</span></p>
      <p className="text-muted-foreground">درصد: <span className="text-foreground font-medium">{data.percentage}%</span></p>
      <p className="text-muted-foreground">فعال: <span className="text-green-500 font-medium">{formatNumber(data.activeUsers)}</span></p>
      <p className="text-muted-foreground">غیرفعال: <span className="text-red-500 font-medium">{formatNumber(data.inactiveUsers)}</span></p>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function AcquisitionPage() {
  const [startDate, setStartDate] = useState(daysAgoIso(30));
  const [endDate, setEndDate] = useState(nowIso());
  const [activePreset, setActivePreset] = useState<number | null>(2);

  const presets = useMemo(() => [
    { start: daysAgoIso(7), end: nowIso(), label: "۷ روز" },
    { start: daysAgoIso(28), end: nowIso(), label: "۲۸ روز" },
    { start: daysAgoIso(90), end: nowIso(), label: "۳ ماه" },
  ], []);

  const queryParams = useMemo(() => ({ startDate, endDate }), [startDate, endDate]);

  const query = useQuery({
    queryKey: ["analytics-acquisition", queryParams],
    queryFn: () => analyticsApi.acquisition(queryParams),
    placeholderData: (prev: any) => prev,
  });

  const d = query.data?.data;

  const chartData = useMemo(() => {
    if (!d?.sources) return [];
    return d.sources.map((s) => ({
      ...s,
      name: s.label,
      value: s.count,
    }));
  }, [d?.sources]);

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header"><div><h1 className="section-title">منابع جذب کاربران</h1></div></div>
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
          <h1 className="section-title">منابع جذب کاربران</h1>
          <p className="text-sm text-muted-foreground">
            بازه: {isoToJalaliFull(startDate)} تا {isoToJalaliFull(endDate)} — {formatNumber(d.total)} کاربر
          </p>
        </div>
      </div>

      {/* Time Range */}
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
          {presets.map((p, i) => (
            <button key={i} onClick={() => { setActivePreset(i); setStartDate(p.start); setEndDate(p.end); }}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                activePreset === i ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}>{p.label}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <JalaliDatePicker value={startDate} onChange={(v) => { setStartDate(v); setActivePreset(null); }} label="از:" />
          <JalaliDatePicker value={endDate} onChange={(v) => { setEndDate(v); setActivePreset(null); }} label="تا:" />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">کل کاربران</p>
              <p className="text-2xl font-bold">{formatNumber(d.total)}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><TrendingUp className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">بهترین منبع</p>
              <p className="text-2xl font-bold">{d.sources[0]?.label ?? "-"}</p>
              <p className="text-xs text-muted-foreground">{d.sources[0]?.percentage ?? 0}%</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-500"><UserCheck className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">کاربران فعال</p>
              <p className="text-2xl font-bold">{formatNumber(d.sources.reduce((a, s) => a + s.activeUsers, 0))}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><UserX className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">کاربران غیرفعال</p>
              <p className="text-2xl font-bold">{formatNumber(d.sources.reduce((a, s) => a + s.inactiveUsers, 0))}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Pie Chart + Bar Chart */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">توزیع منابع جذب</h2>
          </div>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={chartData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={3} dataKey="value" label={({ name, percent }: any) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                  {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">تعداد کاربران هر منبع</h2>
          </div>
          <CardContent className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis type="number" tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={80} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Data Table */}
      <Card>
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">جدول منابع جذب</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">منبع</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">تعداد</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">درصد</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">فعال</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">غیرفعال</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">نرخ فعالیت</th>
              </tr>
            </thead>
            <tbody>
              {d.sources.map((s) => (
                <tr key={s.source} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">
                    <span className="mr-2">{SOURCE_ICONS[s.source] ?? "📊"}</span>
                    {s.label}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(s.count)}</td>
                  <td className="px-4 py-3 tabular-nums">{s.percentage}%</td>
                  <td className="px-4 py-3 tabular-nums text-green-500">{formatNumber(s.activeUsers)}</td>
                  <td className="px-4 py-3 tabular-nums text-red-500">{formatNumber(s.inactiveUsers)}</td>
                  <td className="px-4 py-3 tabular-nums">
                    {s.count > 0 ? Math.round((s.activeUsers / s.count) * 100) : 0}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
