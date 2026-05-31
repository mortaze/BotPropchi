"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquareReply, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, Select, Textarea, Toggle } from "@/components/ui";
import { getApiError, keywordRepliesApi, type KeywordReplyPayload } from "@/services/api";
import type { KeywordReply, KeywordReplyLog } from "@/types";

const emptyForm: KeywordReplyPayload = { keyword: "", response: "", responseType: "TEXT", parseMode: undefined, mediaFileId: "", isActive: true };

export default function KeywordRepliesPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<KeywordReplyPayload>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const query = useQuery({ queryKey: ["keyword-replies"], queryFn: () => keywordRepliesApi.getAll() });
  const history = useQuery({ queryKey: ["keyword-reply-history"], queryFn: () => keywordRepliesApi.history() });
  const save = useMutation({
    mutationFn: (payload: KeywordReplyPayload) => editingId ? keywordRepliesApi.update(editingId, payload) : keywordRepliesApi.create(payload),
    onSuccess: () => { toast.success("پاسخ خودکار ذخیره شد"); setForm(emptyForm); setEditingId(null); queryClient.invalidateQueries({ queryKey: ["keyword-replies"] }); },
    onError: (error) => toast.error(getApiError(error)),
  });
  const update = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<KeywordReplyPayload> }) => keywordRepliesApi.update(id, payload), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["keyword-replies"] }) });
  const remove = useMutation({ mutationFn: keywordRepliesApi.delete, onSuccess: () => { toast.success("حذف شد"); queryClient.invalidateQueries({ queryKey: ["keyword-replies"] }); } });

  const edit = (item: KeywordReply) => { setEditingId(item.id); setForm({ keyword: item.keyword, response: item.response || "", responseType: item.responseType, parseMode: item.parseMode, mediaFileId: item.mediaFileId || "", isActive: item.isActive }); };

  return <div className="space-y-6">
    <div className="page-header"><div><h1 className="section-title">پاسخ‌های خودکار</h1><p className="text-sm text-muted-foreground">در گروه‌های تاییدشده، اگر پیام شامل کلمه کلیدی باشد ربات روی همان پیام Reply می‌کند.</p></div></div>
    <Card><CardHeader><h2 className="font-semibold">{editingId ? "ویرایش پاسخ" : "افزودن پاسخ"}</h2></CardHeader><CardContent>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="کلمه کلیدی" value={form.keyword} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, keyword: e.target.value })} placeholder="سرمایه گذار برتر" />
        <Select label="نوع پاسخ" value={form.responseType} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, responseType: e.target.value as KeywordReplyPayload["responseType"] })}><option value="TEXT">متن</option><option value="PHOTO">عکس</option><option value="DOCUMENT">فایل</option></Select>
        <Select label="Parse Mode" value={form.parseMode || ""} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, parseMode: (e.target.value || undefined) as KeywordReplyPayload["parseMode"] })}><option value="">بدون قالب‌بندی</option><option value="MARKDOWN">Markdown</option><option value="HTML">HTML</option></Select>
        <Input label="File ID رسانه" dir="ltr" value={form.mediaFileId || ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, mediaFileId: e.target.value })} placeholder="برای عکس یا فایل" />
        <div className="md:col-span-2"><Textarea rows={4} label="متن پاسخ / کپشن" value={form.response || ""} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm({ ...form, response: e.target.value })} /></div>
        <Toggle checked={Boolean(form.isActive)} onChange={(v) => setForm({ ...form, isActive: v })} label="فعال" />
      </div>
      <div className="mt-4 flex gap-2"><Button loading={save.isPending} onClick={() => save.mutate(form)}>{editingId ? "ذخیره ویرایش" : "ثبت"}</Button>{editingId && <Button variant="outline" onClick={() => { setEditingId(null); setForm(emptyForm); }}>انصراف</Button>}</div>
    </CardContent></Card>
    <Card><CardHeader><h2 className="font-semibold">لیست پاسخ‌ها</h2></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>کلمه کلیدی</th><th>نوع</th><th>وضعیت</th><th>پاسخ</th><th>عملیات</th></tr></thead><tbody>{query.data?.items.map((item: KeywordReply) => <tr key={item.id}><td>{item.keyword}</td><td><Badge variant="info">{item.responseType}</Badge></td><td><Toggle checked={item.isActive} onChange={(v) => update.mutate({ id: item.id, payload: { isActive: v } })} /></td><td className="max-w-md truncate">{item.response}</td><td><div className="flex gap-3"><button className="text-primary" onClick={() => edit(item)}>ویرایش</button><button className="text-red-500" onClick={() => remove.mutate(item.id)}><Trash2 className="h-4 w-4" /></button></div></td></tr>)}</tbody></table></div>{!query.isLoading && !query.data?.items.length && <EmptyState icon={<MessageSquareReply />} title="پاسخی ثبت نشده" />}</CardContent></Card>
    <Card><CardHeader><h2 className="font-semibold">تاریخچه پاسخ‌های خودکار</h2></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>زمان</th><th>گروه</th><th>کلمه</th><th>متن پیام</th><th>کاربر</th></tr></thead><tbody>{history.data?.items.map((log: KeywordReplyLog) => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString("fa-IR")}</td><td>{log.telegramGroup?.title}</td><td>{log.keywordReply?.keyword}</td><td className="max-w-md truncate">{log.matchedText}</td><td dir="ltr">{log.userTelegramId}</td></tr>)}</tbody></table></div>{!history.isLoading && !history.data?.items.length && <EmptyState title="تاریخچه‌ای ثبت نشده" />}</CardContent></Card>
  </div>;
}
