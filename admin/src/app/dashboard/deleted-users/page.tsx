"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, EmptyState, StatCardSkeleton, Pagination } from "@/components/ui";
import { userDeleteApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import { Trash2, Users, Clock, UserX } from "lucide-react";

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

function isoToJalaliDateTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  } catch { return "-"; }
}

export default function DeletedUsersPage() {
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["deleted-users", page],
    queryFn: () => userDeleteApi.getDeletedUsers({ page, limit: 20 }),
  });

  const data = query.data?.data;

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header"><div><h1 className="section-title">کاربران حذف‌شده</h1></div></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="page-header">
        <div>
          <h1 className="section-title">کاربران حذف‌شده</h1>
          <p className="text-sm text-muted-foreground">تاریخچه حذف کاربران توسط ادمین</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="stat-card">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-500/10 text-red-500"><Trash2 className="h-5 w-5" /></div>
            <div>
              <p className="text-xs text-muted-foreground">کل حذف‌ها</p>
              <p className="text-2xl font-bold">{formatNumber(data?.total ?? 0)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">شناسه</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">Telegram ID</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">نام</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">یوزرنیم</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">زمان حذف</th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">حذف‌کننده</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((item) => (
                <tr key={item.id} className="border-b border-border/50 hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">#{item.deletedUserId}</td>
                  <td className="px-4 py-3 font-mono text-xs">{item.telegramId}</td>
                  <td className="px-4 py-3">{item.firstName ?? "-"}</td>
                  <td className="px-4 py-3">@{item.username ?? "-"}</td>
                  <td className="px-4 py-3">{isoToJalaliDateTime(item.deletedAt)}</td>
                  <td className="px-4 py-3">{item.deletedByAdminName ?? `#${item.deletedByAdminId}`}</td>
                </tr>
              ))}
              {(!data?.items || data.items.length === 0) && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">هنوز کاربری حذف نشده</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {data && data.pages > 1 && (
          <Pagination page={page} pages={data.pages} onChange={setPage} />
        )}
      </Card>
    </div>
  );
}
