"use client";
import { useQuery } from "@tanstack/react-query";
import { BarChart3 } from "lucide-react";
import { Card, CardContent, CardHeader, StatCardSkeleton } from "@/components/ui";
import { analyticsApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";

function Metric({ title, value, subtitle }: { title: string; value: string | number; subtitle?: string }) { return <div className="stat-card"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-3 text-2xl font-bold">{value}</p>{subtitle && <p className="mt-2 text-xs text-muted-foreground">{subtitle}</p>}</div>; }
export default function AnalyticsPage() {
  const q = useQuery({ queryKey: ["analytics-dashboard"], queryFn: analyticsApi.dashboard });
  const d = q.data?.data;
  if (q.isLoading || !d) return <div className="grid gap-4 md:grid-cols-4"><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /><StatCardSkeleton /></div>;
  return <div className="space-y-6"><div className="page-header"><div><h1 className="section-title">Analytics & Reports</h1><p className="text-sm text-muted-foreground">داشبورد آماری کاربران، دعوت‌ها، عضویت اجباری، تخفیف، قرعه‌کشی و Broadcast.</p></div></div>
    <div className="grid gap-4 md:grid-cols-5"><Metric title="کل کاربران" value={formatNumber(d.users.totalUsers)} subtitle={`امروز: ${d.users.activeToday}`} /><Metric title="فعال هفته" value={formatNumber(d.users.activeWeek)} /><Metric title="فعال ماه" value={formatNumber(d.users.activeMonth)} /><Metric title="کاربران جدید" value={formatNumber(d.users.newUsers)} /><Metric title="نرخ دعوت موفق" value={`${d.referrals.conversionRate}%`} /></div>
    <div className="grid gap-4 md:grid-cols-3"><Metric title="عضویت اجباری" value={`${d.forceJoin.approved} فعال`} subtitle={`در انتظار: ${d.forceJoin.pending} | رد شده: ${d.forceJoin.rejected}`} /><Metric title="Broadcast" value={d.broadcasts.total} subtitle={`موفقیت: ${d.broadcasts.successRate}% | خطا: ${d.broadcasts.errorRate}%`} /><Metric title="قرعه‌کشی" value={`${d.lotteries.participants} شرکت‌کننده`} subtitle={`${d.lotteries.winners} برنده | ${d.lotteries.pointsSpent} امتیاز مصرف‌شده`} /></div>
    <Card><CardHeader><h2 className="flex items-center gap-2 font-semibold"><BarChart3 className="h-4 w-4" />کدهای تخفیف محبوب</h2></CardHeader><CardContent className="grid gap-3 md:grid-cols-2">{d.discounts.topUsage.map((item) => <div key={item.id} className="rounded-lg bg-muted/40 p-3"><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.propFirm?.name} — استفاده: {item.usageCount}</p></div>)}</CardContent></Card>
  </div>;
}
