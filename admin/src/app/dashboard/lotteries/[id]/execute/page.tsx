"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
import WinnerModal from "@/components/lottery/WheelWinnerModal";
import type { LotteryWinner, WheelSegment } from "@/types";

export default function LotteryExecutePage() {
  const id = Number(useParams<{ id: string }>().id);
  const router = useRouter();
  const qc = useQueryClient();
  const prevSidebarRef = useRef<boolean | null>(null);

  const [segments, setSegments] = useState<WheelSegment[]>([]);
  const [winners, setWinners] = useState<LotteryWinner[]>([]);
  const [isSpinning, setIsSpinning] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [currentWinner, setCurrentWinner] = useState<LotteryWinner | null>(null);
  const [targetIndex, setTargetIndex] = useState<number | null>(null);
  const [roundNumber, setRoundNumber] = useState(1);

  useEffect(() => {
    try {
      const { sidebarOpen, setSidebarOpen } = require("@/store/ui.store").useUIStore.getState();
      prevSidebarRef.current = sidebarOpen;
      if (sidebarOpen) setSidebarOpen(false);
    } catch {}
    return () => {
      try {
        const { setSidebarOpen } = require("@/store/ui.store").useUIStore.getState();
        if (prevSidebarRef.current !== null) setSidebarOpen(prevSidebarRef.current);
      } catch {}
    };
  }, []);

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

  const handleSpinComplete = useCallback(() => {
    setIsSpinning(false);
  }, []);

  const spinMutation = useMutation({
    mutationFn: () => lotteriesApi.spinWheel(id),
    onSuccess: (data) => {
      if (data.data.winner) {
        const winner = data.data.winner;
        const winnerUserId = winner.userId;
        let idx = -1;
        for (let i = 0; i < segments.length; i++) {
          if (segments[i].userId === winnerUserId) { idx = i; break; }
        }
        if (idx === -1) idx = Math.floor(Math.random() * segments.length);
        setTargetIndex(idx);
        setCurrentWinner(winner);
        setWinners((prev) => [winner, ...prev]);
        setRoundNumber((prev) => prev + 1);
        qc.invalidateQueries({ queryKey: ["lottery", id, "participants"] });
        qc.invalidateQueries({ queryKey: ["lottery", id, "winners"] });
        qc.invalidateQueries({ queryKey: ["lottery", id] });
        if (data.data.isCompleted) {
          lotteriesApi.completeLottery(id).catch(() => {});
        }
      }
    },
    onError: (error) => {
      toast.error(getApiError(error));
      setIsSpinning(false);
    },
  });

  const handleSpin = useCallback(() => {
    if (isSpinning || segments.length === 0) return;
    setIsSpinning(true);
    setTargetIndex(null);
    spinMutation.mutate();
  }, [isSpinning, segments.length, spinMutation]);

  const sendNotificationsMutation = useMutation({
    mutationFn: () => lotteriesApi.sendNotifications(id),
    onSuccess: (data) => {
      toast.success(data.message);
      qc.invalidateQueries({ queryKey: ["lottery", id, "winners"] });
    },
    onError: (error) => toast.error(getApiError(error)),
  });

  const lottery = lotteryQuery.data?.lottery;
  const isCompleted = lottery?.isCompleted;
  const noParticipants = segments.length === 0 && !participantsQuery.isLoading;

  return (
    <div className="h-screen flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-6 py-3 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Link href={`/dashboard/lotteries/${id}`}>
            <Button variant="ghost" size="sm">
              <ArrowRight className="h-4 w-4" />
              <span className="mr-1">بازگشت</span>
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold">{lottery?.title ?? "قرعه‌کشی"}</h1>
            <p className="text-xs text-muted-foreground">
              {isCompleted ? "قرعه‌کشی پایان یافته" : `دور ${roundNumber}`}
            </p>
          </div>
        </div>
        <Badge variant={isCompleted ? "outline" : "success"}>
          {isCompleted ? "تکمیل" : "فعال"}
        </Badge>
      </div>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-72 border-l overflow-y-auto p-4 space-y-4 shrink-0">
          <WinnerPanel winners={winners} isLoading={winnersQuery.isLoading} />
          <Card>
            <CardHeader>
              <h2 className="font-semibold text-sm">ارسال پیام</h2>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground mb-3">
                ارسال پیام تبریک به برندگانی که هنوز پیام دریافت نکرده‌اند.
              </p>
              <Button
                className="w-full"
                size="sm"
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
                <h2 className="font-semibold text-sm">اطلاعات</h2>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">جایزه</span>
                  <span className="font-medium">{lottery.prize}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">شرکت‌کنندگان</span>
                  <span className="font-medium">{segments.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">برندگان</span>
                  <span className="font-medium">{winners.length}</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-hidden">
          {isCompleted ? (
            <div className="text-center py-12">
              <Trophy className="h-20 w-20 mx-auto mb-4 text-yellow-500" />
              <h3 className="text-2xl font-bold mb-2">قرعه‌کشی پایان یافت</h3>
              <p className="text-muted-foreground">{winners.length} برنده انتخاب شد</p>
            </div>
          ) : noParticipants ? (
            <div className="text-center py-12">
              <Users className="h-20 w-20 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-2xl font-bold mb-2">شرکت‌کننده‌ای وجود ندارد</h3>
              <p className="text-muted-foreground">ابتدا شرکت‌کنندگان را اضافه کنید</p>
            </div>
          ) : (
            <>
              <WheelSpinner
                segments={segments}
                targetIndex={targetIndex}
                onSpinComplete={handleSpinComplete}
                isSpinning={isSpinning}
                disabled={isCompleted || noParticipants}
              />
              <div className="mt-8 flex gap-3">
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
        </div>
      </div>

      <WinnerModal
        winner={currentWinner}
        show={showWinnerModal}
        onClose={() => {
          setShowWinnerModal(false);
          setCurrentWinner(null);
        }}
        onShow={() => setShowWinnerModal(true)}
      />
    </div>
  );
}
