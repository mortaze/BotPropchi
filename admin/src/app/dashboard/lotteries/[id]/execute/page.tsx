"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Play, Square, Users, Trophy, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState } from "@/components/ui";
import { getApiError, lotteriesApi } from "@/services/api";
import { formatNumber, safeDateFormat } from "@/lib/utils";
import WheelSpinner from "@/components/lottery/WheelSpinner";
import WinnerPanel from "@/components/lottery/WinnerPanel";
import WinnerModal from "@/components/lottery/WinnerModal";
import type { LotteryWinner, WheelSegment } from "@/types";

export default function LotteryExecutePage() {
  const id = Number(useParams<{ id: string }>().id);
  const router = useRouter();
  const qc = useQueryClient();

  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [winners, setWinners] = useState<LotteryWinner[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [currentWinner, setCurrentWinner] = useState<LotteryWinner | null>(null);
  const [roundNumber, setRoundNumber] = useState(1);

  const lotteryQuery = useQuery({
    queryKey: ["lottery", id],
    queryFn: () => lotteriesApi.getById(id),
    enabled: Number.isFinite(id),
  });

  const participantsQuery = useQuery({
    queryKey: ["lottery", id, "participants"],
    queryFn: () => lotteriesApi.getWheelParticipants(id),
    enabled: Number.isFinite(id),
  });

  const winnersQuery = useQuery({
    queryKey: ["lottery", id, "winners"],
    queryFn: () => lotteriesApi.getWinners(id),
    enabled: Number.isFinite(id),
  });

  useEffect(() => {
    if (participantsQuery.data?.data) {
      const wheelSegments: WheelSegment[] = [];
      for (const p of participantsQuery.data.data) {
        for (let i = 0; i < p.chances; i++) {
          wheelSegments.push({
            userId: p.userId,
            firstName: p.user.firstName,
            lastName: p.user.lastName,
            username: p.user.username,
            chances: p.chances,
          });
        }
      }
      setSegments(wheelSegments);
    }
  }, [participantsQuery.data]);

  useEffect(() => {
    if (winnersQuery.data?.winners) {
      setWinners(winnersQuery.data.winners);
      const maxRound = Math.max(...winnersQuery.data.winners.map((w) => w.roundNumber), 0);
      setRoundNumber(maxRound + 1);
    }
  }, [winnersQuery.data]);

  const spinMutation = useMutation({
    mutationFn: () => lotteriesApi.spinWheel(id),
    onSuccess: (data) => {
      if (data.data.winner) {
        setCurrentWinner(data.data.winner);
        setShowWinnerModal(true);
        setWinners((prev) => [data.data.winner!, ...prev]);
        setRoundNumber((prev) => prev + 1);
        qc.invalidateQueries({ queryKey: ["lottery", id, "participants"] });
        qc.invalidateQueries({ queryKey: ["lottery", id, "winners"] });
        qc.invalidateQueries({ queryKey: ["lottery", id] });

        if (data.data.isCompleted) {
          toast.success("قرعه‌کشی پایان یافت!");
          lotteriesApi.completeLottery(id).catch(() => {});
        } else {
          toast.success(`برنده دور ${data.data.winner!.roundNumber} انتخاب شد!`);
        }
      }
    },
    onError: (error) => toast.error(getApiError(error)),
    onSettled: () => setIsSpinning(false),
  });

  const sendNotificationsMutation = useMutation({
    mutationFn: () => lotteriesApi.sendNotifications(id),
    onSuccess: (data) => {
      toast.success(data.message);
      qc.invalidateQueries({ queryKey: ["lottery", id, "winners"] });
    },
    onError: (error) => toast.error(getApiError(error)),
  });

  const handleSpin = useCallback(() => {
    if (isSpinning || segments.length === 0) return;
    setIsSpinning(true);
    spinMutation.mutate();
  }, [isSpinning, segments.length, spinMutation]);

  const lottery = lotteryQuery.data?.lottery;
  const isCompleted = lottery?.isCompleted;
  const noParticipants = segments.length === 0 && !participantsQuery.isLoading;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/lotteries/${id}`}>
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{lottery?.title ?? "قرعه‌کشی"}</h1>
            <p className="text-sm text-muted-foreground">
              {isCompleted ? "قرعه‌کشی پایان یافته" : "اجرای گردونه شانس"}
            </p>
          </div>
        </div>
        <Badge variant={isCompleted ? "outline" : "success"}>
          {isCompleted ? "تکمیل" : "فعال"}
        </Badge>
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">گردونه شانس</h2>
                <div className="text-sm text-muted-foreground">
                  دور {roundNumber}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {isCompleted ? (
                <div className="text-center py-12">
                  <Trophy className="h-16 w-16 mx-auto mb-4 text-yellow-500" />
                  <h3 className="text-xl font-bold mb-2">قرعه‌کشی پایان یافت</h3>
                  <p className="text-muted-foreground">
                    {winners.length} برنده انتخاب شد
                  </p>
                </div>
              ) : noParticipants ? (
                <div className="text-center py-12">
                  <Users className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-bold mb-2">شرکت‌کننده‌ای وجود ندارد</h3>
                  <p className="text-muted-foreground">
                    ابتدا شرکت‌کنندگان را اضافه کنید
                  </p>
                </div>
              ) : (
                <>
                  <WheelSpinner
                    segments={segments}
                    onSpinComplete={() => setIsSpinning(false)}
                    isSpinning={isSpinning}
                    disabled={isCompleted || noParticipants}
                  />
                  <div className="mt-6 flex gap-3">
                    <Button
                      size="lg"
                      onClick={handleSpin}
                      disabled={isSpinning || isCompleted || noParticipants}
                      loading={isSpinning}
                    >
                      <Play className="h-5 w-5 ml-2" />
                      شروع چرخش
                    </Button>
                    {!isCompleted && winners.length > 0 && (
                      <Button
                        size="lg"
                        variant="danger"
                        onClick={() => {
                          if (confirm("آیا می‌خواهید قرعه‌کشی را پایان دهید؟")) {
                            lotteriesApi.completeLottery(id).then(() => {
                              qc.invalidateQueries({ queryKey: ["lottery", id] });
                              toast.success("قرعه‌کشی پایان یافت");
                            });
                          }
                        }}
                      >
                        <Square className="h-5 w-5 ml-2" />
                        پایان قرعه‌کشی
                      </Button>
                    )}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">شرکت‌کنندگان</h2>
                <Badge variant="default">
                  {participantsQuery.data?.data?.length ?? 0} نفر
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              {participantsQuery.isLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton h-12 rounded-lg" />
                  ))}
                </div>
              ) : participantsQuery.data?.data?.length === 0 ? (
                <EmptyState title="شرکت‌کننده‌ای وجود ندارد" />
              ) : (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {participantsQuery.data?.data?.map((p) => (
                    <div
                      key={p.userId}
                      className="flex items-center justify-between rounded-lg bg-muted/40 p-3"
                    >
                      <div>
                        <p className="font-medium">
                          {p.user.firstName} {p.user.lastName || ""}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.user.username ? `@${p.user.username}` : "-"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={p.isRemoved ? "outline" : "default"}>
                          {p.chances} شانس
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <WinnerPanel winners={winners} isLoading={winnersQuery.isLoading} />

          <Card>
            <CardHeader>
              <h2 className="font-semibold">ارسال پیام</h2>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                ارسال پیام تبریک به برندگانی که هنوز پیام دریافت نکرده‌اند.
              </p>
              <Button
                className="w-full"
                onClick={() => sendNotificationsMutation.mutate()}
                disabled={sendNotificationsMutation.isPending || winners.length === 0}
                loading={sendNotificationsMutation.isPending}
              >
                <Send className="h-4 w-4 ml-2" />
                ارسال پیام به برندگان
              </Button>
            </CardContent>
          </Card>

          {lottery && (
            <Card>
              <CardHeader>
                <h2 className="font-semibold">اطلاعات</h2>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">جایزه</span>
                  <span className="font-medium">{lottery.prize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">شرکت‌کنندگان</span>
                  <span className="font-medium">
                    {participantsQuery.data?.data?.length ?? 0}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">برندگان</span>
                  <span className="font-medium">{winners.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">وضعیت</span>
                  <Badge variant={isCompleted ? "outline" : "success"}>
                    {isCompleted ? "تکمیل" : "فعال"}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <WinnerModal
        winner={currentWinner}
        onClose={() => {
          setShowWinnerModal(false);
          setCurrentWinner(null);
        }}
      />
    </div>
  );
}
