"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, Search, ToggleLeft, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, Pagination, TableRowSkeleton, Textarea, Toggle } from "@/components/ui";
import { formatNumber, safeDateFormat } from "@/lib/utils";
import { getApiError, referralsApi } from "@/services/api";
import type { ReferralSettings } from "@/types";

const userLabel = (user?: { firstName?: string; lastName?: string | null; username?: string | null; id?: number }) => {
  if (!user) return "ثبت نشده";
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return name || user.username || `کاربر ${user.id}`;
};

export default function ReferralsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["referrals", page], queryFn: () => referralsApi.getAdmin({ page, limit: 20 }) });

  const filteredItems = useMemo(() => {
    const items = query.data?.items ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter((item) =>
      [item.referrer, item.referredUser].some((user) =>
        user ? [user.firstName, user.lastName, user.username, String(user.id)].filter(Boolean).some((value) => String(value).toLowerCase().includes(q)) : false,
      ),
    );
  }, [query.data?.items, search]);

  const settings = query.data?.stats.settings;
  const updateSettings = useMutation({
    mutationFn: (payload: Partial<Pick<ReferralSettings, "inviteRewardPoints" | "isEnabled" | "referralShareText">>) => referralsApi.updateSettings(payload),
    onSuccess: () => {
      toast.success("تنظیمات دعوت ذخیره شد");
      queryClient.invalidateQueries({ queryKey: ["referrals"] });
    },
    onError: (error) => toast.error(getApiError(error, "خطا در ذخیره تنظیمات دعوت")),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">مدیریت دعوت دوستان</h1>
          <p className="text-sm text-muted-foreground">تنظیم پاداش دعوت، آمار کلی دعوت‌ها و لیست دعوت‌های موفق (تمامی فصول)</p>
        </div>
        <Badge variant={settings?.isEnabled ? "success" : "danger"}>{settings?.isEnabled ? "سیستم فعال" : "سیستم غیرفعال"}</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<Users />} title="کل دعوت‌ها" value={formatNumber(query.data?.stats.totalInvites)} subtitle="دعوت‌های موفق ثبت‌شده (تمامی فصول)" />
        <Metric icon={<Gift />} title="امتیاز داده‌شده" value={formatNumber(query.data?.stats.totalRewardPoints)} subtitle="مجموع پاداش‌های رفرال (تمامی فصول)" />
        <Metric icon={<Trophy />} title="بهترین معرف‌ها" value={formatNumber(query.data?.leaderboard.length)} subtitle="براساس دعوت‌های موفق (تمامی فصول)" />
        <Metric icon={<ToggleLeft />} title="پاداش هر دعوت" value={formatNumber(settings?.inviteRewardPoints)} subtitle="قابل تغییر توسط مدیر" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="font-semibold">تنظیمات دعوت</h2>
                <p className="text-xs text-muted-foreground">مقدار پاداش hardcode نیست و از تنظیمات backend خوانده می‌شود.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-[180px_160px_auto] sm:items-end">
                <Input
                  label="امتیاز هر دعوت"
                  type="number"
                  min={0}
                  value={settings?.inviteRewardPoints ?? 20}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => updateSettings.mutate({ inviteRewardPoints: Number(event.target.value) })}
                />
                <div className="pb-2">
                  <Toggle checked={Boolean(settings?.isEnabled)} onChange={(value) => updateSettings.mutate({ isEnabled: value })} label="فعال بودن سیستم" />
                </div>
                <Button variant="outline" loading={updateSettings.isPending} onClick={() => queryClient.invalidateQueries({ queryKey: ["referrals"] })}>بروزرسانی</Button>
              </div>
            </div>
            <div className="border-t border-border pt-4">
              <Textarea
                label="متن اشتراک‌گذاری دعوت"
                placeholder="این ربات بیشتر کد تخفیف پراپ فرم دارم استارش کن 👇"
                value={settings?.referralShareText ?? ""}
                onChange={(event: React.ChangeEvent<HTMLTextAreaElement>) => updateSettings.mutate({ referralShareText: event.target.value })}
                rows={3}
              />
              <p className="text-xs text-muted-foreground mt-1">این متن به همراه لینک ربات در دکمه‌های اشتراک‌گذاری و کپی استفاده می‌شود. قالب Markdown پشتیبانی می‌شود.</p>
            </div>
          </div>
        </CardHeader>
      </Card>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-1">
          <CardHeader>
            <h2 className="font-semibold">لیدربورد کلی دعوت‌کنندگان</h2>
            <p className="text-xs text-muted-foreground">بر اساس مجموع دعوت‌های موفق در تمامی فصول</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {(query.data?.leaderboard ?? []).length > 0 ? (
              (query.data?.leaderboard ?? []).map((item, index) => (
                <div key={item.referrerId} className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <div>
                    <p className="font-medium">{index + 1}. {userLabel(item.referrer)}</p>
                    <p className="text-xs text-muted-foreground">@{item.referrer?.username ?? "-"}</p>
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-primary">{formatNumber(item.inviteCount)}</p>
                    <p className="text-xs text-muted-foreground">{formatNumber(item.totalRewardPoints)} امتیاز</p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState title="هنوز دعوت موفقی ثبت نشده" />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <h2 className="font-semibold">لیست دعوت‌ها</h2>
              <div className="relative w-full md:w-72">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input className="input pr-9" placeholder="جستجو معرف یا دعوت‌شده..." value={search} onChange={(event) => setSearch(event.target.value)} />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>معرف</th>
                    <th>کاربر دعوت شده</th>
                    <th>تاریخ ثبت</th>
                    <th>امتیاز داده شده</th><th>وضعیت تایید عضویت</th>
                  </tr>
                </thead>
                <tbody>
                  {query.isLoading ? Array.from({ length: 5 }).map((_, index) => <TableRowSkeleton key={index} cols={5} />) : filteredItems.map((item) => (
                    <tr key={item.id}>
                      <td><p className="font-medium">{userLabel(item.referrer)}</p><p className="text-xs text-muted-foreground">@{item.referrer?.username ?? "-"}</p></td>
                      <td><p className="font-medium">{userLabel(item.referredUser)}</p><p className="text-xs text-muted-foreground">@{item.referredUser?.username ?? "-"}</p></td>
                      <td>{safeDateFormat(item.createdAt, { dateStyle: "medium", timeStyle: "short" })}</td>
                      <td><Badge variant="success">{formatNumber(item.rewardPoints)} امتیاز</Badge></td><td><Badge variant="info">تایید شده</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!query.isLoading && !filteredItems.length && <EmptyState title="دعوتی یافت نشد" description="جستجو را تغییر دهید یا بعداً دوباره بررسی کنید." />}
            <Pagination page={page} pages={query.data?.pages ?? 1} onChange={setPage} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ title, value, subtitle, icon }: { title: string; value: string; subtitle: string; icon: React.ReactNode }) {
  return <div className="stat-card"><div className="mb-4 flex items-center justify-between"><p className="text-sm text-muted-foreground">{title}</p><span className="text-primary [&>svg]:h-5 [&>svg]:w-5">{icon}</span></div><p className="text-2xl font-bold">{value}</p><p className="mt-2 text-xs text-muted-foreground">{subtitle}</p></div>;
}
