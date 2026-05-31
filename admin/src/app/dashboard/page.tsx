"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Activity, Gift, Ticket, Trophy, Users } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, EmptyState, StatCardSkeleton } from "@/components/ui";
import { discountsApi, lotteriesApi, usersApi } from "@/services/api";
import { formatNumber, safeDateFormat } from "@/lib/utils";


export default function DashboardPage() {
  const usersStats = useQuery({ queryKey: ["users", "stats"], queryFn: usersApi.getStats });
  const users = useQuery({ queryKey: ["users", 1], queryFn: () => usersApi.getAll({ page: 1, limit: 5 }) });
  const lotteries = useQuery({ queryKey: ["lotteries", 1], queryFn: () => lotteriesApi.getAll({ page: 1, limit: 10 }) });
  const discounts = useQuery({ queryKey: ["discounts", 1], queryFn: () => discountsApi.getAll({ page: 1, limit: 5 }) });

  const lotteryItems = lotteries.data?.items ?? [];
  const completed = lotteryItems.filter((item) => item.isCompleted).length;
  const active = lotteryItems.filter((item) => item.isActive && !item.isCompleted).length;
  const winners = lotteryItems.flatMap((item) => item.winners ?? []).slice(0, 5);

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">داشبورد مدیریت</h1><p className="text-sm text-muted-foreground">نمای کلی وضعیت کاربران، تخفیف‌ها و قرعه‌کشی‌ها</p></div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {usersStats.isLoading ? <StatCardSkeleton /> : <Metric icon={<Users />} title="کل کاربران" value={formatNumber(usersStats.data?.total)} subtitle={`امروز: ${formatNumber(usersStats.data?.today)}`} />}
        {lotteries.isLoading ? <StatCardSkeleton /> : <Metric icon={<Ticket />} title="کل قرعه‌کشی‌ها" value={formatNumber(lotteries.data?.total)} subtitle={`فعال: ${formatNumber(active)}`} />}
        {lotteries.isLoading ? <StatCardSkeleton /> : <Metric icon={<Trophy />} title="تکمیل‌شده‌ها" value={formatNumber(completed)} subtitle="بر اساس صفحه فعلی API" />}
        {discounts.isLoading ? <StatCardSkeleton /> : <Metric icon={<Gift />} title="کدهای تخفیف" value={formatNumber(discounts.data?.total)} subtitle="فعال/منقضی توسط backend" />}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card><CardHeader><h2 className="font-semibold">کاربران اخیر</h2></CardHeader><CardContent className="overflow-x-auto"><table className="data-table"><tbody>{(users.data?.users ?? []).map((user) => <tr key={user.id}><td><Link className="font-medium hover:text-primary" href={`/dashboard/users/${user.id}`}>{user.firstName} {user.lastName}</Link><p className="text-xs text-muted-foreground">@{user.username ?? "-"}</p></td><td>{formatNumber(user.points)} امتیاز</td><td>{safeDateFormat(user.createdAt, { dateStyle: "medium" })}</td></tr>)}</tbody></table>{!users.data?.users.length && <EmptyState />}</CardContent></Card>
        <Card><CardHeader><h2 className="font-semibold">فعالیت و برندگان اخیر</h2></CardHeader><CardContent>{winners.length ? winners.map((winner) => <div key={winner.id} className="mb-3 flex items-center justify-between rounded-lg bg-muted/40 p-3"><div><p className="font-medium">{winner.winnerFirstName} {winner.winnerLastName}</p><p className="text-xs text-muted-foreground">{winner.prize}</p></div><Badge variant={winner.notified ? "success" : "warning"}>{winner.notified ? "اطلاع‌رسانی شده" : "در انتظار اطلاع"}</Badge></div>) : <EmptyState title="هنوز برنده‌ای ثبت نشده" />}</CardContent></Card>
      </div>
      <Card><CardHeader><h2 className="flex items-center gap-2 font-semibold"><Activity className="h-4 w-4" />وضعیت سیستم</h2></CardHeader><CardContent className="grid gap-3 md:grid-cols-3"><Badge variant="success">API متصل</Badge><Badge variant="info">JWT Bearer فعال</Badge><Badge variant="outline">Backend source of truth</Badge></CardContent></Card>
    </div>
  );
}

function Metric({ title, value, subtitle, icon }: { title: string; value: string; subtitle: string; icon: React.ReactNode }) {
  return <div className="stat-card"><div className="mb-4 flex items-center justify-between"><p className="text-sm text-muted-foreground">{title}</p><span className="text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span></div><p className="text-2xl font-bold">{value}</p><p className="mt-2 text-xs text-muted-foreground">{subtitle}</p></div>;
}
