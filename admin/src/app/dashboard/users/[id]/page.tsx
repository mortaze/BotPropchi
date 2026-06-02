"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input } from "@/components/ui";
import { getApiError, usersApi } from "@/services/api";
import { formatNumber, safeDateFormat } from "@/lib/utils";

const userLabel = (user?: { firstName?: string; lastName?: string | null; username?: string | null; id?: number } | null) => {
  if (!user) return "ثبت نشده";
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return name || user.username || `کاربر ${user.id}`;
};

export default function UserDetailsPage() {
  const id = Number(useParams<{ id: string }>().id);
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState("");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["user", id], queryFn: () => usersApi.getById(id), enabled: Number.isFinite(id) });
  const grantMutation = useMutation({
    mutationFn: () => usersApi.grantPoints(id, amount, description || undefined),
    onSuccess: () => {
      toast.success("امتیاز ثبت شد");
      setAmount(0);
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["user", id] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(getApiError(error)),
  });

  const user = query.data;
  if (query.isLoading) return <div className="skeleton h-80" />;
  if (!user) return <EmptyState title="کاربر یافت نشد" />;

  const referralRewardPoints = user.referralRewardPoints ?? 0;
  const referralCount = user.referralCount ?? user.totalReferrals;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{user.firstName} {user.lastName}</h1>
        <p className="text-sm text-muted-foreground">@{user.username ?? "-"} · Telegram ID: {user.telegramId}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="امتیاز" value={formatNumber(user.points)} />
        <Metric title="دعوت‌ها" value={formatNumber(referralCount)} />
        <Metric title="امتیاز دعوت" value={formatNumber(referralRewardPoints)} />
        <Metric title="وضعیت" value={user.isBlocked ? "مسدود" : "فعال"} />
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold">اطلاعات تکمیلی پروفایل</h2></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <Metric title="نام" value={user.firstName || "-"} />
          <Metric title="نام خانوادگی" value={user.lastName || "-"} />
          <Metric title="شماره موبایل" value={user.phoneNumber || "-"} />
          <Metric title="وضعیت تکمیل" value={user.profileCompleted ? "✅ تکمیل شده" : "❌ ناقص"} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">اعطای امتیاز دستی</h2>
          <p className="text-xs text-muted-foreground">ثبت امتیاز از مسیر مرکزی PointService انجام می‌شود و در لاگ امتیاز ذخیره می‌گردد.</p>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-3">
          <Input label="مقدار" type="number" value={amount} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAmount(Number(e.target.value))} />
          <Input label="توضیح" value={description} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDescription(e.target.value)} />
          <div className="flex items-end"><Button loading={grantMutation.isPending} onClick={() => grantMutation.mutate()} disabled={!amount}>ثبت امتیاز</Button></div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="font-semibold">دعوت‌های ثبت‌شده</h2>
            <p className="text-xs text-muted-foreground">این بخش مستقیماً از جدول Referral خوانده می‌شود.</p>
          </CardHeader>
          <CardContent>
            {user.sentReferrals?.length ? user.sentReferrals.map((referral) => (
              <div key={referral.id} className="mb-2 flex justify-between rounded-lg bg-muted/40 p-3">
                <div>
                  <p>{userLabel(referral.referredUser)}</p>
                  <p className="text-xs text-muted-foreground">@{referral.referredUser?.username ?? "-"} · {safeDateFormat(referral.createdAt)}</p>
                </div>
                <Badge variant="success">{formatNumber(referral.rewardPoints)} امتیاز</Badge>
              </div>
            )) : <EmptyState title="دعوتی ثبت نشده" />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><h2 className="font-semibold">معرف این کاربر</h2></CardHeader>
          <CardContent>
            {user.receivedReferral || user.referredBy ? (
              <div className="rounded-lg bg-muted/40 p-3">
                <p className="font-medium">{userLabel(user.receivedReferral?.referrer ?? user.referredBy)}</p>
                <p className="text-xs text-muted-foreground">امتیاز ثبت‌شده: {formatNumber(user.receivedReferral?.rewardPoints ?? 0)}</p>
                {user.receivedReferral?.createdAt && <p className="text-xs text-muted-foreground">تاریخ ثبت: {safeDateFormat(user.receivedReferral.createdAt)}</p>}
              </div>
            ) : <EmptyState title="معرفی ثبت نشده" />}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader><h2 className="font-semibold">لاگ امتیاز</h2></CardHeader>
          <CardContent>{user.pointLogs.length ? user.pointLogs.map((log) => <div key={log.id} className="mb-2 flex justify-between rounded-lg bg-muted/40 p-3"><div><p>{log.description ?? log.type}</p><p className="text-xs text-muted-foreground">{safeDateFormat(log.createdAt)}</p></div><Badge variant={log.amount >= 0 ? "success" : "danger"}>{formatNumber(log.amount)}</Badge></div>) : <EmptyState />}</CardContent>
        </Card>
        <Card>
          <CardHeader><h2 className="font-semibold">قرعه‌کشی‌ها و برنده‌ها</h2></CardHeader>
          <CardContent>{user.lotteryWins.map((win) => <div key={win.id} className="mb-2 rounded-lg bg-muted/40 p-3"><p className="font-medium">{win.lottery?.title}</p><p className="text-xs text-muted-foreground">{win.prize} · {safeDateFormat(win.wonAt)}</p></div>)}{!user.lotteryWins.length && <EmptyState title="برنده‌ای ثبت نشده" />}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold">کلیک‌های تخفیف</h2></CardHeader>
        <CardContent>{user.clickLogs.length ? user.clickLogs.map((click) => <div key={click.id} className="mb-2 flex justify-between rounded-lg bg-muted/40 p-3"><span>{click.discountCode?.title ?? click.discountCodeId}</span><span className="text-xs text-muted-foreground">{safeDateFormat(click.createdAt)}</span></div>) : <EmptyState />}</CardContent>
      </Card>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return <div className="stat-card"><p className="text-sm text-muted-foreground">{title}</p><p className="mt-2 font-bold">{value}</p></div>;
}
