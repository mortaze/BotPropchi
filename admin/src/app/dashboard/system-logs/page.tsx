"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { Badge, Card, CardContent, CardHeader, EmptyState, Input, Select } from "@/components/ui";
import { systemLogsApi } from "@/services/api";
import type { SystemEventType } from "@/types";

const events: SystemEventType[] = ["USER_LOGIN", "FORCE_JOIN", "REFERRAL", "BROADCAST", "LOTTERY", "DISCOUNT_CLICK", "ERROR", "ADMIN_ACTION", "GROUP_INTEGRATION"];
export default function SystemLogsPage() {
  const [eventType, setEventType] = useState<SystemEventType | "">("");
  const [telegramId, setTelegramId] = useState("");
  const q = useQuery({ queryKey: ["system-logs", eventType, telegramId], queryFn: () => systemLogsApi.getAll({ eventType: eventType || undefined, telegramId: telegramId || undefined, limit: 50 }) });
  return <div className="space-y-6"><div className="page-header"><div><h1 className="section-title">System Logs</h1><p className="text-sm text-muted-foreground">لاگ حرفه‌ای کل سیستم با فیلتر نوع رویداد و کاربر.</p></div></div><Card><CardHeader><h2 className="font-semibold">فیلتر</h2></CardHeader><CardContent className="grid gap-4 md:grid-cols-3"><Select label="نوع رویداد" value={eventType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEventType(e.target.value as SystemEventType | "")}><option value="">همه</option>{events.map((e) => <option key={e} value={e}>{e}</option>)}</Select><Input label="Telegram ID" dir="ltr" value={telegramId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTelegramId(e.target.value)} /></CardContent></Card><Card><CardHeader><h2 className="font-semibold">لاگ‌ها</h2></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>زمان</th><th>رویداد</th><th>سطح</th><th>کاربر</th><th>پیام</th></tr></thead><tbody>{q.data?.items.map((item) => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("fa-IR")}</td><td><Badge variant="info">{item.eventType}</Badge></td><td><Badge variant={item.level === "ERROR" ? "danger" : item.level === "WARN" ? "warning" : "success"}>{item.level}</Badge></td><td dir="ltr">{item.telegramId || item.user?.telegramId || "-"}</td><td>{item.message}</td></tr>)}</tbody></table></div>{!q.isLoading && !q.data?.items.length && <EmptyState icon={<FileText />} title="لاگی یافت نشد" />}</CardContent></Card></div>;
}
