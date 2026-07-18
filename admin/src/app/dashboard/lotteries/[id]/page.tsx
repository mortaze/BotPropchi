"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { ArrowRight, Play, Users, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState } from "@/components/ui";
import { getApiError, lotteriesApi } from "@/services/api";
import { formatNumber, safeDateFormat } from "@/lib/utils";

export default function LotteryDetailsPage() {
  const id = Number(useParams<{ id: string }>().id);
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["lottery", id], queryFn: () => lotteriesApi.getById(id), enabled: Number.isFinite(id) });
  const winnersQuery = useQuery({ queryKey: ["lottery", id, "winners"], queryFn: () => lotteriesApi.getWinners(id), enabled: Number.isFinite(id) });

  const lottery = query.data?.lottery;
  if (query.isLoading) return <div className="skeleton h-96" />;
  if (!lottery) return <EmptyState />;

  const stats = lottery.ticketStats;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/dashboard/lotteries">
              <Button variant="ghost" size="sm">
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold">{lottery.title}</h1>
          </div>
          <p className="text-sm text-muted-foreground">{lottery.description ?? "بدون توضیح"}</p>
        </div>
        <div className="flex gap-2">
          <Link href={`/dashboard/lotteries/edit/${id}`}>
            <Button variant="secondary">ویرایش</Button>
          </Link>
          {!lottery.isCompleted && (
            <Link href={`/dashboard/lotteries/${id}/execute`}>
              <Button>
                <Play className="h-4 w-4 ml-2" />
                اجرای گردونه
              </Button>
            </Link>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Metric title="جایزه" value={lottery.prize} />
        <Metric title="شرکت‌کنندگان" value={formatNumber(stats?.participants ?? lottery._count?.entries ?? 0)} />
        <Metric title="کل شانس‌ها" value={formatNumber(stats?.totalTickets ?? 0)} />
        <Metric title="شانس کل" value={formatNumber(stats?.totalChance ?? 0)} />
        <Metric title="وضعیت" value={lottery.isCompleted ? "تکمیل" : lottery.isActive ? "فعال" : "غیرفعال"} />
        {lottery.startAt && (
          <Metric title="شروع" value={safeDateFormat(lottery.startAt, { dateStyle: "medium", timeStyle: "short" })} />
        )}
        {lottery.endAt && (
          <Metric title="پایان" value={safeDateFormat(lottery.endAt, { dateStyle: "medium", timeStyle: "short" })} />
        )}
        <Metric title="ایجاد شده" value={safeDateFormat(lottery.createdAt, { dateStyle: "medium", timeStyle: "short" })} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              <h2 className="font-semibold">شرکت‌کنندگان</h2>
            </div>
          </CardHeader>
          <CardContent>
            {lottery.entries?.length ? (
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {lottery.entries.map((entry) => (
                  <div key={entry.id} className="mb-2 rounded-lg bg-muted/40 p-3">
                    <div className="flex justify-between">
                      <Link href={`/dashboard/users/${entry.user.id}`} className="font-medium hover:text-primary">
                        {entry.user.firstName} {entry.user.lastName}
                      </Link>
                      <span className="text-xs text-muted-foreground">{safeDateFormat(entry.createdAt)}</span>
                    </div>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <span>شانس: {formatNumber(entry.ticketCount)}</span>
                      <span>امتیاز: {formatNumber(entry.pointsSpent)}</span>
                      <span>شانس: {formatNumber(entry.chanceWeight)}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="شرکت‌کننده‌ای وجود ندارد" />
            )}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-yellow-500" />
              <h2 className="font-semibold">برندگان</h2>
            </div>
          </CardHeader>
          <CardContent>
            {winnersQuery.data?.winners?.length ? (
              <div className="space-y-2">
                {winnersQuery.data.winners.map((winner) => (
                  <div key={winner.id} className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-600 font-bold text-sm">
                        {winner.roundNumber}
                      </div>
                      <div>
                        <p className="font-medium">{winner.winnerFirstName} {winner.winnerLastName || ""}</p>
                        <p className="text-xs text-muted-foreground">
                          {winner.winnerUsername ? `@${winner.winnerUsername}` : "-"}
                        </p>
                      </div>
                    </div>
                    <div className="text-left">
                      <Badge variant={winner.notified ? "success" : "warning"}>
                        {winner.notified ? "ارسال شده" : "در انتظار"}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">
                        {safeDateFormat(winner.wonAt, { dateStyle: "medium", timeStyle: "short" })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="هنوز برنده‌ای انتخاب نشده" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="stat-card">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="mt-2 font-bold">{value}</p>
    </div>
  );
}
