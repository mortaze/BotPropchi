"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone, Pause, Play, RotateCcw, Send } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, Select, Textarea } from "@/components/ui";
import { broadcastsApi, getApiError, type BroadcastPayload } from "@/services/api";
import type { Broadcast, BroadcastType } from "@/types";

const typeLabels: Record<BroadcastType, string> = { TEXT: "متن", PHOTO: "عکس", VIDEO: "ویدیو", DOCUMENT: "فایل", VOICE: "Voice", AUDIO: "Audio", STICKER: "Sticker", ANIMATION: "Animation", MEDIA_GROUP: "Media Group" };
const statusVariant: Record<string, "default" | "success" | "warning" | "danger" | "info" | "outline"> = { DRAFT: "outline", SCHEDULED: "info", QUEUED: "warning", RUNNING: "info", PAUSED: "warning", COMPLETED: "success", FAILED: "danger", CANCELLED: "danger" };
const initial: BroadcastPayload = { title: "", messageType: "TEXT", content: "", mediaFileId: "", parseMode: null, scheduledAt: "" };

export default function BroadcastsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BroadcastPayload>(initial);
  const [buttonText, setButtonText] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const query = useQuery({ queryKey: ["broadcasts"], queryFn: () => broadcastsApi.getAll({ limit: 50 }), refetchInterval: 10_000 });
  const create = useMutation({
    mutationFn: broadcastsApi.create,
    onSuccess: () => { toast.success("پیام همگانی ساخته شد"); setForm(initial); setButtonText(""); setButtonUrl(""); queryClient.invalidateQueries({ queryKey: ["broadcasts"] }); },
    onError: (error) => toast.error(getApiError(error)),
  });
  const action = useMutation({ mutationFn: ({ id, name }: { id: number; name: "enqueue" | "pause" | "resume" | "cancel" | "retry" }) => broadcastsApi.action(id, name), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["broadcasts"] }), onError: (error) => toast.error(getApiError(error)) });
  const test = useMutation({ mutationFn: (id: number) => broadcastsApi.sendTest(id), onSuccess: () => toast.success("ارسال تستی انجام شد"), onError: (error) => toast.error(getApiError(error)) });

  const submit = () => {
    const inlineKeyboard = buttonText && buttonUrl ? [[{ text: buttonText, url: buttonUrl }]] : undefined;
    create.mutate({ ...form, inlineKeyboard, scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : null });
  };

  return <div className="space-y-6">
    <div className="page-header"><div><h1 className="section-title">پیام همگانی / Broadcast Center</h1><p className="text-sm text-muted-foreground">ارسال زمان‌بندی‌شده، صف‌دار و قابل توقف با رعایت Rate Limit تلگرام.</p></div></div>
    <Card><CardHeader><h2 className="font-semibold">ساخت پیام جدید</h2></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-4 md:grid-cols-3"><Input label="عنوان" value={form.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, title: e.target.value })} /><Select label="نوع پیام" value={form.messageType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, messageType: e.target.value as BroadcastType })}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</Select><Select label="Parse Mode" value={form.parseMode ?? ""} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, parseMode: (e.target.value || null) as BroadcastPayload["parseMode"] })}><option value="">بدون فرمت</option><option value="MARKDOWN">Markdown</option><option value="HTML">HTML</option></Select></div>
      <Textarea label="متن / Caption" rows={5} value={form.content ?? ""} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, content: e.target.value })} />
      {form.messageType !== "TEXT" && <Input label="Telegram file_id یا URL فایل" dir="ltr" value={form.mediaFileId ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, mediaFileId: e.target.value })} />}
      <div className="grid gap-4 md:grid-cols-3"><Input label="متن دکمه لینک" value={buttonText} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setButtonText(e.target.value)} /><Input label="URL دکمه" dir="ltr" value={buttonUrl} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setButtonUrl(e.target.value)} /><Input label="زمان‌بندی" type="datetime-local" value={form.scheduledAt ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, scheduledAt: e.target.value })} /></div>
      <Button loading={create.isPending} onClick={submit}>ایجاد پیام</Button>
    </CardContent></Card>
    <Card><CardHeader><h2 className="font-semibold">تاریخچه و وضعیت ارسال</h2></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>عنوان</th><th>نوع</th><th>وضعیت</th><th>دریافت‌کنندگان</th><th>موفق/ناموفق</th><th>عملیات</th></tr></thead><tbody>{query.data?.items.map((item: Broadcast) => <tr key={item.id}><td><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.scheduledAt ? new Date(item.scheduledAt).toLocaleString("fa-IR") : "ارسال دستی"}</p></td><td>{typeLabels[item.messageType]}</td><td><Badge variant={statusVariant[item.status]}>{item.status}</Badge></td><td>{item.totalRecipients}</td><td><span className="text-green-500">{item.successCount}</span> / <span className="text-red-500">{item.failedCount}</span></td><td><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => action.mutate({ id: item.id, name: item.status === "PAUSED" ? "resume" : "enqueue" })}><Play className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => action.mutate({ id: item.id, name: "pause" })}><Pause className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => action.mutate({ id: item.id, name: "retry" })}><RotateCcw className="h-4 w-4" /></Button><Button size="sm" variant="outline" onClick={() => test.mutate(item.id)}><Send className="h-4 w-4" /></Button></div></td></tr>)}</tbody></table></div>{!query.isLoading && !query.data?.items.length && <EmptyState icon={<Megaphone />} title="هنوز پیامی ساخته نشده" />}</CardContent></Card>
  </div>;
}
