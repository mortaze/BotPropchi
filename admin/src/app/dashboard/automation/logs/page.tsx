"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, History, Search, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, Badge, EmptyState } from "@/components/ui";
import { automationApi } from "@/services/api";
import { useState } from "react";

const EVENT_TYPES = [
  { value: "", label: "همه انواع" },
  { value: "AUTO_REPLY_SENT", label: "ارسال پاسخ خودکار" },
  { value: "AUTO_REPLY_FAILED", label: "خطای پاسخ خودکار" },
  { value: "SCHEDULED_SENT", label: "ارسال پیام زمان‌بندی" },
  { value: "SCHEDULED_FAILED", label: "خطای پیام زمان‌بندی" },
  { value: "KEYWORD_MATCH", label: "تطبیق کلمه کلیدی" },
  { value: "BUTTON_CLICK", label: "کلیک دکمه" },
  { value: "POPUP_CLICK", label: "کلیک پاپ‌آپ" },
  { value: "COMMAND_CLICK", label: "کلیک دستور" },
];

const SOURCES = [
  { value: "", label: "همه منابع" },
  { value: "auto_reply", label: "پاسخ خودکار" },
  { value: "scheduled_message", label: "پیام زمان‌بندی" },
  { value: "keyword_reply", label: "کلمه کلیدی" },
];

export default function ActivityLogsPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("");
  const [source, setSource] = useState("");
  const [status, setStatus] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [appliedFilters, setAppliedFilters] = useState({ eventType: "", source: "", status: "", from: "", to: "" });

  const { data, isLoading } = useQuery({
    queryKey: ["automation", "activity", page, appliedSearch, appliedFilters],
    queryFn: () => automationApi.getActivity({
      page,
      limit: 25,
      search: appliedSearch || undefined,
      eventType: appliedFilters.eventType || undefined,
      source: appliedFilters.source || undefined,
      status: appliedFilters.status || undefined,
      from: appliedFilters.from || undefined,
      to: appliedFilters.to || undefined,
    }),
  });

  const logs = data?.items || [];
  const totalPages = data?.pages || 1;

  const handleApplyFilters = () => {
    setPage(1);
    setAppliedSearch(search);
    setAppliedFilters({ eventType, source, status, from: dateFrom, to: dateTo });
  };

  const handleReset = () => {
    setSearch("");
    setEventType("");
    setSource("");
    setStatus("");
    setDateFrom("");
    setDateTo("");
    setAppliedSearch("");
    setAppliedFilters({ eventType: "", source: "", status: "", from: "", to: "" });
    setPage(1);
  };

  const getEventLabel = (type: string) => {
    const found = EVENT_TYPES.find(e => e.value === type);
    return found?.label || type;
  };

  const getEventColor = (type: string) => {
    if (type.includes("FAILED")) return "danger";
    if (type.includes("SENT")) return "success";
    if (type.includes("MATCH")) return "info";
    return "outline";
  };

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
        <Badge variant="outline">{data?.total ?? 0} رکورد</Badge>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                className="input w-full pr-9"
                placeholder="جستجو در کلمه، متن پیام..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleApplyFilters()}
              />
            </div>
            <select
              className="input w-full"
              value={eventType}
              onChange={(e) => setEventType(e.target.value)}
            >
              {EVENT_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
            <select
              className="input w-full"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {SOURCES.map(s => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
            <select
              className="input w-full"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">همه وضعیت‌ها</option>
              <option value="SUCCESS">موفق</option>
              <option value="FAILED">ناموفق</option>
            </select>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row mt-3">
            <div className="flex gap-2 flex-1">
              <input
                type="date"
                className="input flex-1"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                placeholder="از تاریخ"
              />
              <input
                type="date"
                className="input flex-1"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                placeholder="تا تاریخ"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleApplyFilters}
                className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Filter className="h-4 w-4 inline ml-1" />
                اعمال فیلتر
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-muted/80 transition-colors"
              >
                پاک کردن
              </button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logs Table */}
      <Card>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          ) : logs.length === 0 ? (
            <EmptyState
              title="تاریخچه‌ای ثبت نشده"
              description={appliedSearch || Object.values(appliedFilters).some(Boolean)
                ? "نتیجه‌ای با فیلترهای اعمال‌شده یافت نشد."
                : "هنوز فعالیتی ثبت نشده است."}
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="data-table w-full">
                  <thead>
                    <tr>
                      <th>زمان</th>
                      <th>نوع فعالیت</th>
                      <th>منبع</th>
                      <th>گروه</th>
                      <th>کاربر</th>
                      <th>کلمه کلیدی</th>
                      <th>وضعیت</th>
                      <th>جزئیات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log: any) => (
                      <tr key={log.id}>
                        <td className="text-sm whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString("fa-IR")}
                        </td>
                        <td>
                          <Badge variant={getEventColor(log.eventType)}>
                            {getEventLabel(log.eventType)}
                          </Badge>
                        </td>
                        <td className="text-sm">{log.source}</td>
                        <td className="text-sm text-muted-foreground font-mono">
                          {log.targetChatId ? String(log.targetChatId) : "—"}
                        </td>
                        <td className="text-sm font-mono">
                          {log.userTelegramId ? String(log.userTelegramId) : "—"}
                        </td>
                        <td className="text-sm">
                          {log.keyword ? <Badge variant="info">{log.keyword}</Badge> : "—"}
                        </td>
                        <td>
                          <Badge variant={log.status === "SUCCESS" ? "success" : "danger"}>
                            {log.status === "SUCCESS" ? "موفق" : "ناموفق"}
                          </Badge>
                        </td>
                        <td className="text-sm text-muted-foreground max-w-[200px] truncate">
                          {log.errorMessage || log.messageText || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <span className="text-sm text-muted-foreground">
                    صفحه {page} از {totalPages}
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-3 py-2 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
                      if (pageNum > totalPages) return null;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setPage(pageNum)}
                          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                            page === pageNum
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="px-3 py-2 rounded-lg bg-muted text-sm font-medium hover:bg-muted/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
