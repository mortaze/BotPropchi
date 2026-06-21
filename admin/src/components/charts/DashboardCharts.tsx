"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis, PieChart, Pie, Cell,
} from "recharts";
import { useMemo } from "react";
import { Card, CardContent, CardHeader, EmptyState, StatCardSkeleton } from "@/components/ui";
import { analyticsApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import { Activity, Gift, MessageSquare, Target, Ticket, Trophy, Users, UserPlus } from "lucide-react";

function toJalali(iso: string) {
  try {
    const d = new Date(iso + "T00:00:00");
    return d.toLocaleDateString("fa-IR", { month: "short", day: "numeric" });
  } catch { return iso; }
}

function StatCard({ title, value, icon, colorClass }: { title: string; value: string | number; icon: React.ReactNode; colorClass: string }) {
  return (
    <div className="stat-card">
      <div className="mb-3 flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorClass}`}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold tabular-nums text-foreground">{typeof value === "number" ? formatNumber(value) : value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{title}</p>
    </div>
  );
}

export default function DashboardCharts() {
  const query = useQuery({
    queryKey: ["analytics-dashboard"],
    queryFn: () => analyticsApi.dashboard(),
    refetchInterval: 60_000,
  });

  const d = query.data?.data;

  const COLORS = ["#3b82f6", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#06b6d4", "#ec4899"];

  const referralData = useMemo(() => [
    { name: "موفق", value: d?.referrals.successful ?? 0 },
    { name: "ناموفق", value: d?.referrals.failed ?? 0 },
  ], [d?.referrals]);

  const broadcastData = useMemo(() => [
    { name: "موفق", value: d?.broadcasts.success ?? 0 },
    { name: "ناموفق", value: d?.broadcasts.failed ?? 0 },
  ], [d?.broadcasts]);

  if (query.isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>
    );
  }

  if (!d) return <EmptyState title="داده‌ای برای نمایش وجود ندارد" description="هنوز هیچ کاربری ثبت نشده است" />;

  const cards = [
    { title: "کل کاربران", value: d.users.totalUsers, icon: <Users className="h-5 w-5" />, colorClass: "bg-primary/10 text-primary" },
    { title: "کاربران فعال امروز", value: d.users.activeToday, icon: <Activity className="h-5 w-5" />, colorClass: "bg-green-500/10 text-green-500" },
    { title: "کاربران جدید (ماه)", value: d.users.newUsers, icon: <UserPlus className="h-5 w-5" />, colorClass: "bg-cyan-500/10 text-cyan-500" },
    { title: "دعوت‌ها", value: d.referrals.totalInvites, icon: <Gift className="h-5 w-5" />, colorClass: "bg-purple-500/10 text-purple-500" },
    { title: "پیام‌های همگانی", value: d.broadcasts.total, icon: <MessageSquare className="h-5 w-5" />, colorClass: "bg-amber-500/10 text-amber-500" },
    { title: "پست‌ها", value: 0, icon: <Target className="h-5 w-5" />, colorClass: "bg-pink-500/10 text-pink-500" },
    { title: "قرعه‌کشی‌ها", value: d.lotteries.total, icon: <Ticket className="h-5 w-5" />, colorClass: "bg-indigo-500/10 text-indigo-500" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-7">
        {cards.map((c, i) => <StatCard key={c.title} {...c} />)}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><h2 className="font-semibold">کاربران جدید روزانه (۳۰ روز)</h2></CardHeader>
          <CardContent className="h-72">
            {d.charts.dailyUsers.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={d.charts.dailyUsers}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => toJalali(v)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip labelFormatter={(label: any) => toJalali(String(label ?? ""))} formatter={(value: any) => [formatNumber(Number(value)), "کاربران جدید"]} />
                  <Area type="monotone" dataKey="count" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} strokeWidth={2} name="کاربران جدید" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold">دعوت‌های روزانه (۳۰ روز)</h2></CardHeader>
          <CardContent className="h-72">
            {d.charts.dailyReferrals.length === 0 ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={d.charts.dailyReferrals}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                  <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => toJalali(v)} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip labelFormatter={(label: any) => toJalali(String(label ?? ""))} formatter={(value: any) => [formatNumber(Number(value)), "دعوت‌ها"]} />
                  <Bar dataKey="count" fill="#a855f7" radius={[4, 4, 0, 0]} name="دعوت‌ها" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold">نرخ دعوت‌ها</h2></CardHeader>
          <CardContent className="h-64 flex items-center justify-center">
            {referralData.every((d) => d.value === 0) ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={referralData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" label={(entry: any) => `${entry.name} ${((entry.percent ?? 0) * 100).toFixed(0)}%`}>
                    {referralData.map((_, idx) => <Cell key={idx} fill={COLORS[idx]} />)}
                  </Pie>
                  <Tooltip formatter={(value: any) => [formatNumber(Number(value)), "تعداد"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold">نرخ موفقیت پیام‌های همگانی</h2></CardHeader>
          <CardContent className="h-64 flex items-center justify-center">
            {broadcastData.every((d) => d.value === 0) ? <EmptyState /> : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={broadcastData} cx="50%" cy="50%" innerRadius={60} outerRadius={90} paddingAngle={5} dataKey="value" label={(entry: any) => `${entry.name} ${((entry.percent ?? 0) * 100).toFixed(0)}%`}>
                    {broadcastData.map((_, idx) => <Cell key={idx} fill={COLORS[idx]} />)}
                  </Pie>
                  <Tooltip formatter={(value: any) => [formatNumber(Number(value)), "تعداد"]} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">عضویت اجباری</p>
          <p className="text-2xl font-bold">{formatNumber(d.forceJoin.verifiedUsers)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {d.forceJoin.channels} کانال / {d.forceJoin.groups} گروه
          </p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">گروه‌ها</p>
          <p className="text-2xl font-bold">{formatNumber(d.groups.approved)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{d.groups.active} گروه فعال</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">قرعه‌کشی</p>
          <p className="text-2xl font-bold">{formatNumber(d.lotteries.participants)}</p>
          <p className="mt-1 text-xs text-muted-foreground">شرکت‌کننده در {formatNumber(d.lotteries.total)} قرعه‌کشی</p>
        </div>
        <div className="stat-card">
          <p className="text-sm text-muted-foreground">نرخ موفقیت ارسال</p>
          <p className="text-2xl font-bold">{d.broadcasts.successRate}%</p>
          <p className="mt-1 text-xs text-muted-foreground">{formatNumber(d.broadcasts.success)} موفق / {formatNumber(d.broadcasts.failed)} ناموفق</p>
        </div>
      </div>
    </div>
  );
}
