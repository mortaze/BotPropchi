"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { Card, CardContent, EmptyState } from "@/components/ui";
import { broadcastDiagnosticsApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
} from "recharts";
import { AlertTriangle, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

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
  NO_CHAT_ACCESS: "عدم دسترسی",
  CHAT_NOT_FOUND: "چت یافت نشد",
  INVALID_CHAT_ID: "شناسه چت نامعتبر",
  RATE_LIMITED: "محدودیت نرخ",
  NETWORK_ERROR: "خطای شبکه",
  DATABASE_ERROR: "خطای دیتابیس",
  PROGRAMMING_ERROR: "خطای برنامه‌نویسی",
  UNKNOWN_ERROR: "خطای ناشناخته",
};

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

export default function BroadcastDetailPage() {
  const params = useParams();
  const broadcastId = parseInt(params.id as string);

  const query = useQuery({
    queryKey: ["broadcast-details", broadcastId],
    queryFn: () => broadcastDiagnosticsApi.getDetails(broadcastId),
    enabled: !isNaN(broadcastId),
  });

  const validateQuery = useQuery({
    queryKey: ["broadcast-validate", broadcastId],
    queryFn: () => broadcastDiagnosticsApi.validate(broadcastId),
    enabled: !isNaN(broadcastId),
  });

  const d = query.data?.data;
  const validation = validateQuery.data?.data;

  const errorChartData = useMemo(() => {
    if (!d?.deliveryStats) return [];
    return d.deliveryStats.map((s) => ({
      category: s.errorCategory || s.finalStatus,
      label: ERROR_LABELS[s.errorCategory || s.finalStatus] ?? (s.errorCategory || s.finalStatus),
      count: s._count.id,
      color: ERROR_COLORS[s.errorCategory || s.finalStatus] ?? "#6b7280",
    }));
  }, [d?.deliveryStats]);

  if (query.isLoading) return <div className="p-6"><EmptyState title="در حال بارگذاری..." /></div>;
  if (!d) return <div className="p-6"><EmptyState title="Broadcast یافت نشد" /></div>;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/broadcast-diagnostics" className="text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="section-title">جزئیات Broadcast #{d.broadcast.id}</h1>
            <p className="text-sm text-muted-foreground">{d.broadcast.title}</p>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">کل گیرندگان</p>
          <p className="text-2xl font-bold">{formatNumber(d.broadcast.totalRecipients)}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">موفق</p>
              <p className="text-2xl font-bold text-green-500">{formatNumber(d.broadcast.successCount)}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 text-red-500" />
            <div>
              <p className="text-xs text-muted-foreground">ناموفق</p>
              <p className="text-2xl font-bold text-red-500">{formatNumber(d.broadcast.failedCount)}</p>
            </div>
          </div>
        </div>
        <div className="stat-card">
          <p className="text-xs text-muted-foreground">زمان شروع</p>
          <p className="text-sm font-medium">{isoToJalaliDateTime(d.broadcast.startedAt)}</p>
          <p className="text-xs text-muted-foreground mt-1">زمان پایان</p>
          <p className="text-sm font-medium">{isoToJalaliDateTime(d.broadcast.completedAt)}</p>
        </div>
      </div>

      {/* Error Distribution */}
      {errorChartData.length > 0 && (
        <Card>
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">توزیع انواع خطاها</h2>
          </div>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={errorChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="count">
                  {errorChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(value: any) => [formatNumber(Number(value)), "ت"]} />
                <Legend formatter={(value: string) => ERROR_LABELS[value] ?? value} />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Validation Results */}
      {validation && (
        <Card>
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">تحلیل نمونه‌های ناموفق ({validation.totalSamples} نمونه)</h2>
          </div>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-3 mb-4">
              <div className="rounded-lg bg-green-500/10 p-3">
                <p className="text-xs text-green-600 font-medium">رفتار کاربر</p>
                <p className="text-lg font-bold text-green-600">{validation.userBehaviorCount} ({validation.userBehaviorRate}%)</p>
                <p className="text-xs text-muted-foreground">بلاک، غیرفعال، عدم دسترسی</p>
              </div>
              <div className="rounded-lg bg-red-500/10 p-3">
                <p className="text-xs text-red-600 font-medium">خطای سیستمی</p>
                <p className="text-lg font-bold text-red-600">{validation.systemBugCount} ({validation.systemBugRate}%)</p>
                <p className="text-xs text-muted-foreground">دیتابیس، برنامه‌نویسی، ChatId</p>
              </div>
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground font-medium">نامشخص</p>
                <p className="text-lg font-bold">{validation.unknownCount}</p>
                <p className="text-xs text-muted-foreground">خطاهای دیگر</p>
              </div>
            </div>
            {validation.analysis.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">کاربر</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">خطا</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">دسته</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">نوع</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validation.analysis.map((item) => (
                      <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2">
                          <span className="font-medium">{item.firstName}</span>
                          <span className="text-muted-foreground mr-1">@{item.username}</span>
                        </td>
                        <td className="px-3 py-2 text-xs max-w-[200px] truncate" title={item.error ?? ""}>{item.error ?? "-"}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            ERROR_COLORS[item.category] ? `bg-opacity-10` : "bg-muted"
                          }`} style={{ backgroundColor: `${ERROR_COLORS[item.category]}15`, color: ERROR_COLORS[item.category] }}>
                            {ERROR_LABELS[item.category] ?? item.category}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {item.isUserBehavior && <span className="text-xs text-green-500">رفتار کاربر</span>}
                          {item.isSystemBug && <span className="text-xs text-red-500">خطای سیستم</span>}
                          {!item.isUserBehavior && !item.isSystemBug && <span className="text-xs text-muted-foreground">نامشخص</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Error Samples */}
      {d.errorSamples.length > 0 && (
        <Card>
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">نمونه خطاها ({d.errorSamples.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">زمان</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">TelegramId</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">خطا</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">دسته</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">HTTP</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">کد تلگرام</th>
                </tr>
              </thead>
              <tbody>
                {d.errorSamples.map((log) => (
                  <tr key={log.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs">{isoToJalaliDateTime(log.attemptedAt)}</td>
                    <td className="px-3 py-2 font-mono text-xs">{log.telegramUserId}</td>
                    <td className="px-3 py-2 text-xs max-w-[250px] truncate" title={log.errorMessage ?? ""}>{log.errorMessage ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs" style={{ color: ERROR_COLORS[log.errorCategory ?? ""] }}>
                        {ERROR_LABELS[log.errorCategory ?? ""] ?? log.errorCategory}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs">{log.httpStatusCode ?? "-"}</td>
                    <td className="px-3 py-2 text-xs">{log.telegramErrorCode ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
