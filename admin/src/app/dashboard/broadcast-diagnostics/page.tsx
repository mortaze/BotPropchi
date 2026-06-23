"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, EmptyState, StatCardSkeleton } from "@/components/ui";
import { broadcastDiagnosticsApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { AlertTriangle, CheckCircle, XCircle, Shield, Activity, Users, Bug, Zap } from "lucide-react";

const ERROR_COLORS: Record<string, string> = {
  SUCCESS: "#22c55e",
  USER_BLOCKED: "#ef4444",
  USER_DEACTIVATED: "#f97316",
  NO_CHAT_ACCESS: "#eab308",
  CHAT_NOT_FOUND: "#a855f7",
  INVALID_CHAT_ID: "#ec4899",
  RATE_LIMITED: "#6366f1",
  NETWORK_ERROR: "#06b6d4",
  DATABASE_ERROR: "#dc2626",
  PROGRAMMING_ERROR: "#b91c1c",
  UNKNOWN_ERROR: "#6b7280",
};

const ERROR_LABELS: Record<string, string> = {
  SUCCESS: "موفق",
  USER_BLOCKED: "کاربر بلاک کرده",
  USER_DEACTIVATED: "اکانت غیرفعال",
  NO_CHAT_ACCESS: " عدم دسترسی",
  CHAT_NOT_FOUND: "چت یافت نشد",
  INVALID_CHAT_ID: "شناسه چت نامعتبر",
  RATE_LIMITED: "محدودیت نرخ",
  NETWORK_ERROR: "خطای شبکه",
  DATABASE_ERROR: "خطای دیتابیس",
  PROGRAMMING_ERROR: "خطای برنامه‌نویسی",
  UNKNOWN_ERROR: "خطای ناشناخته",
};

// ─── Jalali Helpers ─────────────────────────────────────────
function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gy; if (gm > 2) gy2 += 1;
  let days = 355666 + 365 * gy2 + Math.floor(gy2 / 4) - Math.floor(gy2 / 100) + Math.floor(gy2 / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053); days %= 12053;
  jy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let jm: number, jd: number;
  if (days < 186) { jm = 1 + Math.floor(days / 31); jd = 1 + (days % 31); }
  else { jm = 7 + Math.floor((days - 186) / 30); jd = 1 + ((days - 186) % 30); }
  return [jy, jm, jd];
}

function isoToJalaliFull(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
  } catch { return iso; }
}

function isoToJalaliDateTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  } catch { return iso; }
}

// ─── Custom Tooltip ─────────────────────────────────────────
function ErrorTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card p-3 shadow-lg text-sm" dir="rtl">
      <p className="font-medium text-foreground">{ERROR_LABELS[data.category] ?? data.category}</p>
      <p className="text-muted-foreground">تعداد: <span className="text-foreground font-medium">{formatNumber(data.count)}</span></p>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function BroadcastDiagnosticsPage() {
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<number | null>(null);

  const kpisQuery = useQuery({
    queryKey: ["broadcast-kpis", selectedBroadcastId],
    queryFn: () => broadcastDiagnosticsApi.getKPIs(selectedBroadcastId ?? undefined),
  });

  const integrityQuery = useQuery({
    queryKey: ["broadcast-integrity"],
    queryFn: () => broadcastDiagnosticsApi.getIntegrity(),
  });

  const historyQuery = useQuery({
    queryKey: ["broadcast-history"],
    queryFn: () => broadcastDiagnosticsApi.getHistory({ limit: 10 }),
  });

  const kpis = kpisQuery.data?.data;
  const integrity = integrityQuery.data?.data;
  const history = historyQuery.data?.data?.items ?? [];

  const errorChartData = useMemo(() => {
    if (!kpis?.errorBreakdown) return [];
    return kpis.errorBreakdown.map((e) => ({
      category: e.category,
      label: ERROR_LABELS[e.category] ?? e.category,
      count: e.count,
      color: ERROR_COLORS[e.category] ?? "#6b7280",
    }));
  }, [kpis?.errorBreakdown]);

  if (kpisQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header"><div><h1 className="section-title">آنالیز ارسال پیام همگانی</h1></div></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title">آنالیز ارسال پیام همگانی</h1>
          <p className="text-sm text-muted-foreground">عیب‌یابی و تحلیل دقیق وضعیت ارسال پیام‌ها</p>
        </div>
      </div>

      {/* Critical Alert */}
      {kpis?.hasCriticalBug && (
        <div className="rounded-xl border-2 border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
          <AlertTriangle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700">هشدار بحرانی: احتمال وجود باگ</p>
            <p className="text-sm text-red-600 mt-1">
              بیش از ۲۰٪ خطاها از نوع INVALID_CHAT_ID, CHAT_NOT_FOUND, DATABASE_ERROR یا PROGRAMMING_ERROR هستند.
              نرخ خطاهای سیستمی: {kpis.criticalErrorRate}% — این نشان‌دهنده مشکل احتمالی در پیاده‌سازی است.
            </p>
          </div>
        </div>
      )}

      {/* KPI Cards */}
      {kpis && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Users className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">کل کاربران</p>
                <p className="text-2xl font-bold">{formatNumber(kpis.totalUsers)}</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-500"><CheckCircle className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">نرخ موفقیت</p>
                <p className="text-2xl font-bold">{kpis.successRate}%</p>
                <p className="text-xs text-muted-foreground">{formatNumber(kpis.successCount)} موفق</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><XCircle className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">خطاها</p>
                <p className="text-2xl font-bold">{formatNumber(kpis.failedCount)}</p>
              </div>
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><Bug className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">خطاهای سیستمی</p>
                <p className="text-2xl font-bold">{kpis.criticalErrors}</p>
                <p className="text-xs text-muted-foreground">{kpis.criticalErrorRate}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Breakdown Chart */}
      {errorChartData.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <div className="p-5 border-b border-border">
              <h2 className="font-semibold text-foreground">توزیع انواع خطاها</h2>
            </div>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={errorChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="count">
                    {errorChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip content={<ErrorTooltip />} />
                  <Legend formatter={(value: string) => ERROR_LABELS[value] ?? value} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <div className="p-5 border-b border-border">
              <h2 className="font-semibold text-foreground">تعداد هر نوع خطا</h2>
            </div>
            <CardContent className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={errorChartData} layout="vertical" margin={{ left: 100 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                  <XAxis type="number" tick={{ fontSize: 10 }} />
                  <YAxis type="category" dataKey="label" tick={{ fontSize: 10 }} width={100} />
                  <Tooltip content={<ErrorTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {errorChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Data Integrity */}
      {integrity && (
        <Card>
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">سلامت دیتابیس کاربران</h2>
            <span className={`text-sm font-medium ${integrity.healthScore >= 90 ? "text-green-500" : integrity.healthScore >= 70 ? "text-yellow-500" : "text-red-500"}`}>
              {integrity.healthScore}%
            </span>
          </div>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-4">
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">کل کاربران</p>
                <p className="text-lg font-bold">{formatNumber(integrity.totalUsers)}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">کاربران سالم</p>
                <p className="text-lg font-bold text-green-500">{formatNumber(integrity.healthyUsers)}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">کاربران بلاک</p>
                <p className="text-lg font-bold text-red-500">{formatNumber(integrity.blockedUsers)}</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">تکراری</p>
                <p className="text-lg font-bold text-amber-500">{formatNumber(integrity.duplicateCount)}</p>
              </div>
            </div>
            {integrity.issues.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-muted-foreground">مشکلات یافت شده:</p>
                {integrity.issues.map((issue, i) => (
                  <div key={i} className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
                    issue.severity === "CRITICAL" ? "bg-red-500/10 text-red-600" :
                    issue.severity === "HIGH" ? "bg-orange-500/10 text-orange-600" :
                    "bg-yellow-500/10 text-yellow-600"
                  }`}>
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {issue.message}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Broadcast History */}
      <Card>
        <div className="p-5 border-b border-border">
          <h2 className="font-semibold text-foreground">تاریخچه ارسال‌ها</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">شناسه</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">عنوان</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">وضعیت</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">گیرندگان</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">موفق</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">ناموفق</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">تاریخ</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {history.map((item) => (
                <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">#{item.id}</td>
                  <td className="px-4 py-3">{item.title}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      item.status === "COMPLETED" ? "bg-green-500/10 text-green-600" :
                      item.status === "RUNNING" ? "bg-blue-500/10 text-blue-600" :
                      item.status === "FAILED" ? "bg-red-500/10 text-red-600" :
                      "bg-muted text-muted-foreground"
                    }`}>{item.status}</span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{formatNumber(item.totalRecipients)}</td>
                  <td className="px-4 py-3 tabular-nums text-green-500">{formatNumber(item.successCount)}</td>
                  <td className="px-4 py-3 tabular-nums text-red-500">{formatNumber(item.failedCount)}</td>
                  <td className="px-4 py-3">{isoToJalaliFull(item.createdAt)}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedBroadcastId(item.id)}
                      className="text-xs text-primary hover:underline">جزئیات</button>
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
