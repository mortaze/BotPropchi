"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, CheckCircle, FileText, UserCheck, UserX } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, EmptyState, Input, Select } from "@/components/ui";
import { miniAppLogsApi } from "@/services/api";
import type { MiniAppDebugLog } from "@/types";

const eventOptions = [
  "MINI_APP_CLIENT_BOOT",
  "MINI_APP_CLIENT_NO_INIT_DATA",
  "MINI_APP_VALIDATE_BEFORE",
  "MINI_APP_AUTH_SUCCESS",
  "MINI_APP_PROFILE_LOADED",
  "MINI_APP_PROFILE_UPDATED",
  "MINI_APP_NO_INIT_DATA",
  "MINI_APP_INVALID_HASH",
  "MINI_APP_EXPIRED_AUTH",
  "MINI_APP_INVALID_USER",
  "MINI_APP_SERVER_ERROR",
];

function isFailure(eventType: string) {
  return eventType.includes("INVALID") || eventType.includes("EXPIRED") || eventType.includes("NO_INIT") || eventType.includes("SERVER_ERROR");
}

function LogTable({ items }: { items: MiniAppDebugLog[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table">
        <thead><tr><th>زمان</th><th>رویداد</th><th>Telegram ID</th><th>پیام</th><th>UserAgent</th><th>Payload</th></tr></thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{new Date(item.createdAt).toLocaleString("fa-IR")}</td>
              <td><Badge variant={isFailure(item.eventType) ? "danger" : item.eventType.includes("SUCCESS") ? "success" : "info"}>{item.eventType}</Badge></td>
              <td dir="ltr">{item.telegramId || item.user?.telegramId || "-"}</td>
              <td className="max-w-sm whitespace-normal">{item.message}</td>
              <td dir="ltr" className="max-w-xs truncate text-xs text-muted-foreground">{item.userAgent || "-"}</td>
              <td dir="ltr" className="max-w-md truncate text-left text-xs text-muted-foreground">{item.payload ? JSON.stringify(item.payload) : "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function MiniAppLogsPage() {
  const [eventType, setEventType] = useState("");
  const [telegramId, setTelegramId] = useState("");
  const logs = useQuery({ queryKey: ["mini-app-logs", eventType, telegramId], queryFn: () => miniAppLogsApi.getAll({ eventType: eventType || undefined, telegramId: telegramId || undefined, limit: 50 }) });
  const report = useQuery({ queryKey: ["mini-app-logs-report"], queryFn: miniAppLogsApi.getReport });

  return (
    <div className="space-y-6">
      <div className="page-header"><div><h1 className="section-title">Mini App Logs</h1><p className="text-sm text-muted-foreground">گزارش مدیریتی ورود، initData و Validation مینی‌اپ تلگرام.</p></div></div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="flex items-center gap-3"><UserCheck className="h-8 w-8 text-green-500" /><div><p className="text-sm text-muted-foreground">کاربران وارد شده</p><p className="text-2xl font-bold">{report.data?.data.successfulUsersCount ?? "-"}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3"><UserX className="h-8 w-8 text-red-500" /><div><p className="text-sm text-muted-foreground">کاربران ناموفق</p><p className="text-2xl font-bold">{report.data?.data.failedUsersCount ?? "-"}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3"><AlertTriangle className="h-8 w-8 text-yellow-500" /><div><p className="text-sm text-muted-foreground">آخرین خطاها</p><p className="text-2xl font-bold">{report.data?.data.latestErrors.length ?? "-"}</p></div></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3"><CheckCircle className="h-8 w-8 text-cyan-500" /><div><p className="text-sm text-muted-foreground">آخرین ورودهای موفق</p><p className="text-2xl font-bold">{report.data?.data.latestSuccesses.length ?? "-"}</p></div></CardContent></Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card><CardHeader><h2 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> آخرین Validation Failure</h2></CardHeader><CardContent className="space-y-2">{report.data?.data.latestValidationFailures.slice(0, 5).map((item) => <p key={item.id} className="truncate text-sm"><Badge variant="danger">{item.eventType}</Badge> <span className="text-muted-foreground">{item.message}</span></p>)}</CardContent></Card>
        <Card className="lg:col-span-2"><CardHeader><h2 className="flex items-center gap-2 font-semibold"><Activity className="h-4 w-4" /> آخرین ورودهای موفق</h2></CardHeader><CardContent className="space-y-2">{report.data?.data.latestSuccesses.slice(0, 5).map((item) => <p key={item.id} className="truncate text-sm"><Badge variant="success">{item.eventType}</Badge> <span dir="ltr">{item.telegramId || "-"}</span> <span className="text-muted-foreground">{new Date(item.createdAt).toLocaleString("fa-IR")}</span></p>)}</CardContent></Card>
      </div>

      <Card>
        <CardHeader><h2 className="font-semibold">فیلتر لاگ‌ها</h2></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <Select label="نوع رویداد" value={eventType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEventType(e.target.value)}><option value="">همه</option>{eventOptions.map((e) => <option key={e} value={e}>{e}</option>)}</Select>
          <Input label="Telegram ID" dir="ltr" value={telegramId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTelegramId(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold">لاگ‌ها</h2></CardHeader>
        <CardContent className="p-0">
          {logs.data?.items.length ? <LogTable items={logs.data.items} /> : !logs.isLoading && <EmptyState icon={<FileText />} title="لاگی یافت نشد" />}
        </CardContent>
      </Card>
    </div>
  );
}
