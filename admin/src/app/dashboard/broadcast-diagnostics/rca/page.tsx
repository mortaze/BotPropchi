"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, EmptyState, StatCardSkeleton } from "@/components/ui";
import { broadcastRcaApi, broadcastDiagnosticsApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { AlertTriangle, CheckCircle, XCircle, Shield, Bug, Database, Code, Server, ArrowRight } from "lucide-react";
import Link from "next/link";

const ROOT_CAUSE_COLORS: Record<string, string> = {
  INVALID_USER_ID: "#dc2626",
  INVALID_CHAT_ID: "#ec4899",
  MIGRATION_CORRUPTION: "#a855f7",
  USER_DEACTIVATED: "#f97316",
  USER_BLOCKED_BOT: "#ef4444",
  DATABASE_SCHEMA_ERROR: "#dc2626",
  CODE_LOGIC_ERROR: "#b91c1c",
  TELEGRAM_API_ERROR: "#6366f1",
  NETWORK_TIMEOUT: "#06b6d4",
  UNKNOWN: "#6b7280",
};

const ROOT_CAUSE_ICONS: Record<string, any> = {
  INVALID_USER_ID: XCircle,
  INVALID_CHAT_ID: XCircle,
  MIGRATION_CORRUPTION: Database,
  USER_DEACTIVATED: Shield,
  USER_BLOCKED_BOT: Shield,
  DATABASE_SCHEMA_ERROR: Database,
  CODE_LOGIC_ERROR: Code,
  TELEGRAM_API_ERROR: Server,
  NETWORK_TIMEOUT: Server,
  UNKNOWN: AlertTriangle,
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

// ─── Main Page ───────────────────────────────────────────────
export default function BroadcastRcaPage() {
  const [selectedBroadcastId, setSelectedBroadcastId] = useState<number | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Get broadcast history for selection
  const historyQuery = useQuery({
    queryKey: ["broadcast-history-rca"],
    queryFn: () => broadcastDiagnosticsApi.getHistory({ limit: 20 }),
  });

  // RCA analysis
  const rcaQuery = useQuery({
    queryKey: ["broadcast-rca", selectedBroadcastId],
    queryFn: () => broadcastRcaApi.analyze(selectedBroadcastId!),
    enabled: selectedBroadcastId !== null,
  });

  // Data integrity
  const integrityQuery = useQuery({
    queryKey: ["broadcast-integrity-rca"],
    queryFn: () => broadcastRcaApi.getIntegrity(),
  });

  // Error explorer
  const explorerQuery = useQuery({
    queryKey: ["broadcast-explorer", selectedBroadcastId, selectedCategory],
    queryFn: () => broadcastRcaApi.getExplorer(selectedBroadcastId!, selectedCategory!),
    enabled: selectedBroadcastId !== null && selectedCategory !== null,
  });

  // System errors
  const systemErrorsQuery = useQuery({
    queryKey: ["broadcast-system-errors"],
    queryFn: () => broadcastRcaApi.getSystemErrors(),
  });

  const history = historyQuery.data?.data?.items ?? [];
  const rca = rcaQuery.data?.data;
  const integrity = integrityQuery.data?.data;
  const explorer = explorerQuery.data?.data ?? [];
  const systemErrors = systemErrorsQuery.data?.data ?? [];

  const rootCauseChartData = useMemo(() => {
    if (!rca?.byRootCause) return [];
    return rca.byRootCause.map((rc) => ({
      cause: rc.cause,
      label: rc.label,
      count: rc.count,
      color: ROOT_CAUSE_COLORS[rc.cause] ?? "#6b7280",
    }));
  }, [rca?.byRootCause]);

  if (historyQuery.isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header"><div><h1 className="section-title">Broadcast Root Cause Analysis</h1></div></div>
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
        <div className="flex items-center gap-3">
          <Link href="/dashboard/broadcast-diagnostics" className="text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="section-title">Broadcast Root Cause Analysis</h1>
            <p className="text-sm text-muted-foreground">آنالیز ریشه‌ای خطاهای ارسال پیام همگانی</p>
          </div>
        </div>
      </div>

      {/* Broadcast Selection */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            <label className="text-sm font-medium text-muted-foreground">انتخاب Broadcast برای آنالیز</label>
            <select
              value={selectedBroadcastId ?? ""}
              onChange={(e) => setSelectedBroadcastId(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">یک Broadcast انتخاب کنید...</option>
              {history.map((item) => (
                <option key={item.id} value={item.id}>
                  #{item.id} - {item.title} ({item.failedCount} خطا)
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      {/* RCA Results */}
      {rcaQuery.isLoading && selectedBroadcastId && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      )}

      {rca && (
        <>
          {/* Summary KPIs */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><Bug className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">کل خطاها</p>
                  <p className="text-2xl font-bold">{formatNumber(rca.totalErrors)}</p>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-500"><Shield className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">رفتار کاربر</p>
                  <p className="text-2xl font-bold">{rca.summary.userBehaviorPercentage}%</p>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><Database className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">مشکل دیتابیس</p>
                  <p className="text-2xl font-bold">{rca.summary.databasePercentage}%</p>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-500"><Code className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">خطای کد</p>
                  <p className="text-2xl font-bold">{rca.summary.codePercentage}%</p>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500"><Server className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">خطای تلگرام</p>
                  <p className="text-2xl font-bold">{rca.summary.telegramApiPercentage}%</p>
                </div>
              </div>
            </div>
          </div>

          {/* Root Cause Breakdown */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <div className="p-5 border-b border-border">
                <h2 className="font-semibold text-foreground">توزیع Root Causes</h2>
              </div>
              <CardContent className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={rootCauseChartData} cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={2} dataKey="count">
                      {rootCauseChartData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: any) => [formatNumber(Number(value)), "ت"]} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <div className="p-5 border-b border-border">
                <h2 className="font-semibold text-foreground">Root Causes با جزئیات</h2>
              </div>
              <CardContent>
                <div className="space-y-3">
                  {rca.byRootCause.map((rc) => {
                    const Icon = ROOT_CAUSE_ICONS[rc.cause] ?? AlertTriangle;
                    return (
                      <div key={rc.cause}
                        className="flex items-center justify-between rounded-lg border border-border p-3 hover:bg-muted/20 cursor-pointer"
                        onClick={() => setSelectedCategory(rc.cause)}>
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${ROOT_CAUSE_COLORS[rc.cause]}15`, color: ROOT_CAUSE_COLORS[rc.cause] }}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="text-sm font-medium">{rc.label}</p>
                            <p className="text-xs text-muted-foreground">{rc.description}</p>
                          </div>
                        </div>
                        <div className="text-left">
                          <p className="text-lg font-bold">{formatNumber(rc.count)}</p>
                          <p className="text-xs text-muted-foreground">{rc.percentage}%</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Error Explorer */}
          {selectedCategory && (
            <Card>
              <div className="p-5 border-b border-border flex items-center justify-between">
                <h2 className="font-semibold text-foreground">
                  Error Explorer: {rca.byRootCause.find(r => r.cause === selectedCategory)?.label ?? selectedCategory}
                </h2>
                <button onClick={() => setSelectedCategory(null)} className="text-sm text-muted-hover:text-foreground">بستن</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">شناسه</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">کاربر</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">TelegramId</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">ChatId</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">وضعیت</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-خطا">خطا</th>
                      <th className="px-3 py-2 text-right font-medium text-muted-foreground">HTTP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {explorer.map((item) => (
                      <tr key={item.deliveryLogId} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-3 py-2 text-xs">#{item.userId}</td>
                        <td className="px-3 py-2">
                          <span className="font-medium">{item.firstName ?? "-"}</span>
                          <span className="text-muted-foreground mr-1 text-xs">@{item.username ?? "-"}</span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{item.telegramUserId}</td>
                        <td className="px-3 py-2 font-mono text-xs">{item.chatId ?? "-"}</td>
                        <td className="px-3 py-2">
                          <span className={`text-xs ${item.userStatus === "blocked" ? "text-red-500" : "text-green-500"}`}>
                            {item.userStatus === "blocked" ? "بلاک" : "فعال"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs max-w-[200px] truncate" title={item.errorMessage ?? ""}>
                          {item.errorMessage ?? "-"}
                        </td>
                        <td className="px-3 py-2 text-xs">{item.httpStatusCode ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Data Integrity */}
      {integrity && (
        <Card>
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">سلامت دیتابیس کاربران</h2>
            <span className={`text-lg font-bold ${integrity.healthScore >= 90 ? "text-green-500" : integrity.healthScore >= 70 ? "text-yellow-500" : "text-red-500"}`}>
              {integrity.healthScore}%
            </span>
          </div>
          <CardContent>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-muted/40 p-4">
                <p className="text-xs text-muted-foreground">کل کاربران</p>
                <p className="text-xl font-bold">{formatNumber(integrity.totalUsers)}</p>
              </div>
              <div className="rounded-lg bg-green-500/10 p-4">
                <p className="text-xs text-green-600">TelegramId معتبر</p>
                <p className="text-xl font-bold text-green-600">{formatNumber(integrity.validTelegramId)}</p>
              </div>
              <div className="rounded-lg bg-red-500/10 p-4">
                <p className="text-xs text-red-600">داده ناقص</p>
                <p className="text-xl font-bold text-red-600">{formatNumber(integrity.incompleteData)}</p>
              </div>
              <div className="rounded-lg bg-amber-500/10 p-4">
                <p className="text-xs text-amber-600">تکراری</p>
                <p className="text-xl font-bold text-amber-600">{formatNumber(integrity.duplicateCount)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* System Error Users */}
      {systemErrors.length > 0 && (
        <Card>
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">کاربران مشکوک به مشکل سیستمی ({systemErrors.length})</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">شناسه</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">کاربر</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">TelegramId</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">ChatId</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">نوع خطا</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">متن خطا</th>
                </tr>
              </thead>
              <tbody>
                {systemErrors.map((item) => (
                  <tr key={item.deliveryLogId} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-3 py-2 text-xs">#{item.userId}</td>
                    <td className="px-3 py-2">
                      <span className="font-medium">{item.firstName ?? "-"}</span>
                      <span className="text-muted-foreground mr-1 text-xs">@{item.username ?? "-"}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{item.telegramUserId}</td>
                    <td className="px-3 py-2 font-mono text-xs">{item.chatId ?? "-"}</td>
                    <td className="px-3 py-2">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: `${ROOT_CAUSE_COLORS[item.errorCategory ?? ""]}15`, color: ROOT_CAUSE_COLORS[item.errorCategory ?? ""] }}>
                        {item.errorCategory}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs max-w-[250px] truncate" title={item.errorMessage ?? ""}>
                      {item.errorMessage ?? "-"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Final Report */}
      {rca && (
        <Card>
          <div className="p-5 border-b border-border">
            <h2 className="font-semibold text-foreground">گزارش نهایی Root Cause Analysis</h2>
          </div>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4">
                <h3 className="font-medium text-foreground mb-3">دسته‌بندی خطاها بر اساس منشا</h3>
                <div className="space-y-2">
                  <ReportRow label="رفتار کاربران واقعی" value={rca.summary.userBehaviorErrors} percentage={rca.summary.userBehaviorPercentage} color="bg-green-500" />
                  <ReportRow label="مشکل دیتابیس" value={rca.summary.databaseErrors} percentage={rca.summary.databasePercentage} color="bg-red-500" />
                  <ReportRow label="ذخیره‌سازی اشتباه شناسه‌ها" value={rca.summary.databaseErrors} percentage={rca.summary.databasePercentage} color="bg-red-500" />
                  <ReportRow label="خطای منطق برنامه‌نویسی" value={rca.summary.codeErrors} percentage={rca.summary.codePercentage} color="bg-orange-500" />
                  <ReportRow label="خطای Telegram API" value={rca.summary.telegramApiErrors} percentage={rca.summary.telegramApiPercentage} color="bg-purple-500" />
                </div>
              </div>

              {rca.summary.databasePercentage + rca.summary.codePercentage > 20 && (
                <div className="rounded-lg border-2 border-red-500/30 bg-red-500/5 p-4 flex items-start gap-3">
                  <AlertTriangle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-red-700">هشدار: احتمال وجود باگ در سیستم</p>
                    <p className="text-sm text-red-600 mt-1">
                      مجموع خطاهای دیتابیس و برنامه‌نویسی ({rca.summary.databasePercentage + rca.summary.codePercentage}%) بیش از ۲۰٪ است.
                      این نشان‌دهنده مشکل احتمالی در پیاده‌سازی است و نیاز به بررسی فنی دارد.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function ReportRow({ label, value, percentage, color }: { label: string; value: number; percentage: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`h-3 w-3 rounded-full ${color}`} />
      <span className="flex-1 text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium">{formatNumber(value)}</span>
      <span className="text-sm text-muted-foreground w-16 text-left">{percentage}%</span>
    </div>
  );
}
