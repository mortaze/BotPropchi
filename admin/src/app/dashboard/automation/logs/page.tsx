"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, History, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, Badge, EmptyState } from "@/components/ui";
import { keywordRepliesApi, scheduledMessagesApi } from "@/services/api";
import { useState } from "react";

export default function ActivityLogsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const { data: kwHistory, isLoading: kwLoading } = useQuery({
    queryKey: ["automation", "keyword-history"],
    queryFn: () => keywordRepliesApi.history(),
  });

  const { data: schedData, isLoading: schedLoading } = useQuery({
    queryKey: ["automation", "scheduled-logs-all"],
    queryFn: async () => {
      const list = await scheduledMessagesApi.getAll({ page: 1, limit: 100 });
      const allLogs: any[] = [];
      for (const msg of (list?.items || [])) {
        try {
          const logs = await scheduledMessagesApi.getLogs(msg.id, 50);
          for (const log of (logs?.logs || [])) {
            allLogs.push({ ...log, sourceName: msg.title, source: "scheduled_message" });
          }
        } catch {}
      }
      return allLogs;
    },
  });

  const isLoading = kwLoading || schedLoading;

  // Combine all logs
  const kwLogs = (kwHistory?.items || []).map((l: any) => ({
    id: `kw_${l.id}`,
    type: "KEYWORD_MATCH",
    source: "keyword_reply",
    keyword: l.keywordReply?.keyword || null,
    groupName: l.telegramGroup?.title || String(l.telegramGroupId || "—"),
    userTelegramId: l.userTelegramId,
    matchedText: l.matchedText,
    status: "SUCCESS",
    createdAt: l.createdAt,
    sourceName: l.keywordReply?.keyword,
  }));

  const schedLogs = (schedData || []).map((l: any) => ({
    id: `sched_${l.id}`,
    type: l.status === "SUCCESS" ? "SCHEDULED_SENT" : "SCHEDULED_FAILED",
    source: "scheduled_message",
    keyword: null,
    groupName: String(l.targetChatId || "—"),
    userTelegramId: null,
    matchedText: null,
    status: l.status,
    createdAt: l.sentAt,
    sourceName: l.sourceName,
    errorMessage: l.errorMessage,
  }));

  const allLogs = [...kwLogs, ...schedLogs].sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return db - da;
  });

  const filtered = allLogs.filter((log) => {
    const matchesSearch = !search ||
      (log.keyword || "").includes(search) ||
      (log.groupName || "").includes(search) ||
      String(log.userTelegramId || "").includes(search) ||
      (log.matchedText || "").includes(search) ||
      (log.sourceName || "").includes(search);
    const matchesStatus = statusFilter === "all" || log.status === statusFilter;
    const matchesSource = sourceFilter === "all" || log.source === sourceFilter;
    return matchesSearch && matchesStatus && matchesSource;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/automation" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">تاریخچه فعالیت‌ها</h1>
            <p className="text-sm text-muted-foreground">مشاهده تاریخچه تمام فعالیت‌های سیستم اتوماسیون</p>
          </div>
        </div>
        <Badge variant="outline">{filtered.length} رکورد</Badge>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1 relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className="input w-full pr-9"
                placeholder="جستجو در کلمه، گروه، کاربر..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              <select className="input" value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
                <option value="all">همه منابع</option>
                <option value="keyword_reply">کلمه کلیدی</option>
                <option value="scheduled_message">پیام زمان‌بندی</option>
              </select>
              <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                <option value="all">همه وضعیت‌ها</option>
                <option value="SUCCESS">موفق</option>
                <option value="FAILED">ناموفق</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <EmptyState
              title="تاریخچه‌ای ثبت نشده"
              description={search || statusFilter !== "all" || sourceFilter !== "all"
                ? "نتیجه‌ای با فیلترهای اعمال‌شده یافت نشد."
                : "هنوز فعالیتی ثبت نشده است."}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full">
                <thead>
                  <tr>
                    <th>زمان</th>
                    <th>نوع</th>
                    <th>منبع</th>
                    <th>گروه</th>
                    <th>کاربر</th>
                    <th>کلمه/موضوع</th>
                    <th>وضعیت</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map((log: any) => (
                    <tr key={log.id}>
                      <td className="text-sm whitespace-nowrap">
                        {log.createdAt ? new Date(log.createdAt).toLocaleString("fa-IR") : "—"}
                      </td>
                      <td>
                        <Badge variant={log.type?.includes("FAILED") ? "danger" : log.type?.includes("KEYWORD") ? "info" : "success"}>
                          {log.type === "KEYWORD_MATCH" ? "تطبیق کلمه" : log.type === "SCHEDULED_SENT" ? "ارسال زمان‌بندی" : log.type === "SCHEDULED_FAILED" ? "خطای زمان‌بندی" : log.type}
                        </Badge>
                      </td>
                      <td className="text-sm">{log.sourceName || log.source}</td>
                      <td className="text-sm text-muted-foreground">{log.groupName}</td>
                      <td className="text-sm font-mono">{log.userTelegramId ? String(log.userTelegramId) : "—"}</td>
                      <td className="text-sm">
                        {log.keyword ? <Badge variant="info">{log.keyword}</Badge> : log.matchedText || "—"}
                      </td>
                      <td>
                        <Badge variant={log.status === "SUCCESS" ? "success" : "danger"}>
                          {log.status === "SUCCESS" ? "موفق" : "ناموفق"}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
