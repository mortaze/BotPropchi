"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Search, Trophy, Users } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, EmptyState, TableRowSkeleton } from "@/components/ui";
import { formatNumber, safeDateFormat } from "@/lib/utils";
import { seasonsApi } from "@/services/api";

export default function LeaderboardPage() {
  const [selectedSeasonId, setSelectedSeasonId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const seasonsQuery = useQuery({ queryKey: ["seasons"], queryFn: seasonsApi.list });
  const activeSeasonQuery = useQuery({ queryKey: ["active-season"], queryFn: seasonsApi.getActive, staleTime: 30_000 });

  const seasons = seasonsQuery.data?.data ?? [];
  const activeSeason = activeSeasonQuery.data?.data;

  const currentSeasonId = selectedSeasonId ?? activeSeason?.id;
  const currentSeason = seasons.find((s) => s.id === currentSeasonId);

  const leaderboardQuery = useQuery({
    queryKey: ["leaderboard-page", currentSeasonId],
    queryFn: () => seasonsApi.getLeaderboard(currentSeasonId!, 50),
    enabled: !!currentSeasonId,
  });

  const searchLeaderboardQuery = useQuery({
    queryKey: ["leaderboard-search", currentSeasonId, searchQuery],
    queryFn: () => seasonsApi.search(currentSeasonId!, searchQuery),
    enabled: !!currentSeasonId && searchQuery.trim().length > 0,
  });

  const entries = searchQuery.trim()
    ? (searchLeaderboardQuery.data?.data ?? [])
    : (leaderboardQuery.data?.data?.leaderboard ?? []);

  const stats = leaderboardQuery.data?.data?.stats;
  const entriesToShow = searchQuery.trim() ? searchLeaderboardQuery.data?.data : entries;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">لیدربورد دعوت دوستان</h1>
          <p className="text-sm text-muted-foreground">مشاهده رتبه‌بندی کاربران بر اساس دعوت‌های موفق در هر فصل</p>
        </div>
      </div>

      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-foreground">انتخاب فصل:</label>
          <select
            className="input w-auto min-w-[200px]"
            value={currentSeasonId ?? ""}
            onChange={(e) => setSelectedSeasonId(e.target.value ? Number(e.target.value) : null)}
          >
            {activeSeason && <option value={activeSeason.id}>فصل فعال: {activeSeason.name}</option>}
            {seasons.filter((s) => !s.isActive).map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
            {!activeSeason && seasons.length > 0 && <option value={seasons[0].id}>{seasons[0].name}</option>}
          </select>
        </div>
        <div className="relative w-full md:w-72">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className="input pr-9" placeholder="جستجوی کاربر..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        </div>
      </div>

      {currentSeason && (
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <Calendar className="h-4 w-4" />
          <span>{currentSeason.name}: {safeDateFormat(currentSeason.startDate, { dateStyle: "medium" })} — {safeDateFormat(currentSeason.endDate, { dateStyle: "medium" })}</span>
          <Badge variant={currentSeason.isActive ? "success" : "default"}>{currentSeason.isActive ? "فعال" : "پایان‌یافته"}</Badge>
        </div>
      )}

      {stats && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="stat-card">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">کل دعوت‌ها</p>
              <Users className="h-5 w-5 text-primary" />
            </div>
            <p className="text-2xl font-bold">{formatNumber(stats.totalReferrals)}</p>
          </div>
          <div className="stat-card">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm text-muted-foreground">شرکت‌کنندگان</p>
              <Trophy className="h-5 w-5 text-primary" />
            </div>
            <p className="text-2xl font-bold">{formatNumber(stats.totalInviters)}</p>
          </div>
        </div>
      )}

      <Card>
        <CardHeader>
          <h2 className="font-semibold">رتبه‌بندی</h2>
        </CardHeader>
        <CardContent className="p-0">
          {leaderboardQuery.isLoading ? (
            <div className="p-5"><TableRowSkeleton cols={3} /></div>
          ) : !entriesToShow || entriesToShow.length === 0 ? (
            <EmptyState title="دعوتی در این فصل ثبت نشده" />
          ) : (
            <div className="space-y-2 p-5">
              {entriesToShow.map((entry: any) => (
                <div key={entry.userId} className="flex items-center justify-between rounded-lg bg-muted/40 p-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                      {entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : entry.rank}
                    </span>
                    <div>
                      <p className="font-medium">{entry.firstName || entry.username || `کاربر ${entry.userId}`}</p>
                      {entry.username && <p className="text-xs text-muted-foreground">@{entry.username}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-left">
                    <div>
                      <p className="font-semibold text-primary">{formatNumber(entry.inviteCount)}</p>
                      <p className="text-xs text-muted-foreground">دعوت</p>
                    </div>
                    <div>
                      <p className="font-semibold">{formatNumber(entry.points || 0)}</p>
                      <p className="text-xs text-muted-foreground">امتیاز</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
