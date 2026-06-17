"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Calendar, Plus, SquareStack, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, TableRowSkeleton } from "@/components/ui";
import { formatNumber, safeDateFormat } from "@/lib/utils";
import { getApiError, seasonsApi } from "@/services/api";

export default function SeasonsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState("");
  const [newEnd, setNewEnd] = useState("");
  const [selectedSeason, setSelectedSeason] = useState<number | null>(null);

  const query = useQuery({ queryKey: ["seasons"], queryFn: seasonsApi.list });
  const seasons = query.data?.data ?? [];

  const createMutation = useMutation({
    mutationFn: () => seasonsApi.create({ name: newName, startDate: newStart, endDate: newEnd }),
    onSuccess: () => {
      toast.success("فصل جدید ایجاد شد");
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
      setShowCreate(false);
      setNewName("");
      setNewStart("");
      setNewEnd("");
    },
    onError: (error) => toast.error(getApiError(error, "خطا در ایجاد فصل")),
  });

  const endMutation = useMutation({
    mutationFn: (id: number) => seasonsApi.endSeason(id),
    onSuccess: () => {
      toast.success("فصل به پایان رسید");
      queryClient.invalidateQueries({ queryKey: ["seasons"] });
    },
    onError: (error) => toast.error(getApiError(error, "خطا در پایان فصل")),
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">فصل‌ها و لیدربورد</h1>
          <p className="text-sm text-muted-foreground">مدیریت فصول رقابتی دعوت دوستان</p>
        </div>
        <Button onClick={() => setShowCreate(!showCreate)}><Plus className="h-4 w-4" />فصل جدید</Button>
      </div>

      {showCreate && (
        <Card>
          <CardHeader><h2 className="font-semibold">ایجاد فصل جدید</h2></CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              <Input label="نام فصل" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="مثال: Summer 2026" />
              <Input label="تاریخ شروع" type="date" value={newStart} onChange={(e) => setNewStart(e.target.value)} />
              <Input label="تاریخ پایان" type="date" value={newEnd} onChange={(e) => setNewEnd(e.target.value)} />
              <div className="flex items-end gap-2">
                <Button onClick={() => createMutation.mutate()} loading={createMutation.isPending}>ذخیره</Button>
                <Button variant="outline" onClick={() => setShowCreate(false)}>لغو</Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4">
        {query.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => <TableRowSkeleton key={i} cols={4} />)
        ) : seasons.length === 0 ? (
          <EmptyState title="هیچ فصلی یافت نشد" description="برای شروع یک فصل جدید ایجاد کنید." />
        ) : (
          seasons.map((season) => (
            <SeasonCard
              key={season.id}
              season={season}
              selected={selectedSeason === season.id}
              onToggle={() => setSelectedSeason(selectedSeason === season.id ? null : season.id)}
              onEnd={() => endMutation.mutate(season.id)}
              ending={endMutation.isPending}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SeasonCard({
  season,
  selected,
  onToggle,
  onEnd,
  ending,
}: {
  season: { id: number; name: string; isActive: boolean; startDate: string; endDate: string };
  selected: boolean;
  onToggle: () => void;
  onEnd: () => void;
  ending: boolean;
}) {
  const leaderboardQuery = useQuery({
    queryKey: ["season-leaderboard", season.id],
    queryFn: () => seasonsApi.getLeaderboard(season.id, 10),
    enabled: selected,
  });

  const totalReferrals = leaderboardQuery.data?.data?.stats?.totalReferrals ?? 0;
  const totalInviters = leaderboardQuery.data?.data?.stats?.totalInviters ?? 0;
  const entries = leaderboardQuery.data?.data?.leaderboard ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Trophy className="h-5 w-5 text-primary" />
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{season.name}</h2>
                <Badge variant={season.isActive ? "success" : "default"}>{season.isActive ? "فعال" : "پایان‌یافته"}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                <Calendar className="inline h-3 w-3" /> {safeDateFormat(season.startDate, { dateStyle: "medium" })} — {safeDateFormat(season.endDate, { dateStyle: "medium" })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={onToggle}>
              <SquareStack className="h-4 w-4" />{selected ? "بستن" : "لیدربورد"}
            </Button>
            {season.isActive && (
              <Button variant="danger" size="sm" onClick={onEnd} loading={ending}>پایان فصل</Button>
            )}
          </div>
        </div>
      </CardHeader>
      {selected && (
        <CardContent>
          {leaderboardQuery.isLoading ? (
            <TableRowSkeleton cols={3} />
          ) : entries.length === 0 ? (
            <EmptyState title="دعوتی در این فصل ثبت نشده" />
          ) : (
            <>
              <div className="mb-3 flex gap-4 text-sm text-muted-foreground">
                <span>کل دعوت‌ها: <strong>{formatNumber(totalReferrals)}</strong></span>
                <span>شرکت‌کنندگان: <strong>{formatNumber(totalInviters)}</strong></span>
              </div>
              <div className="space-y-2">
                {entries.map((entry) => (
                  <div key={entry.userId} className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                        {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                      </span>
                      <div>
                        <p className="font-medium">{entry.firstName || entry.username || `کاربر ${entry.userId}`}</p>
                        {entry.username && <p className="text-xs text-muted-foreground">@{entry.username}</p>}
                      </div>
                    </div>
                    <span className="font-semibold text-primary">{formatNumber(entry.inviteCount)} دعوت</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  );
}
