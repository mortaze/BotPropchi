"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, RadioTower, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, Select, Toggle } from "@/components/ui";
import { getApiError, requiredChannelsApi, type RequiredChannelPayload } from "@/services/api";
import type { RequiredChannel } from "@/types";

const emptyForm: RequiredChannelPayload = { title: "", displayTitle: "", chatId: "", username: "", type: "CHANNEL", inviteLink: "", buttonText: "", isActive: true };

export default function RequiredChannelsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RequiredChannelPayload>(emptyForm);
  const query = useQuery({ queryKey: ["required-channels"], queryFn: () => requiredChannelsApi.getAll() });
  const create = useMutation({
    mutationFn: requiredChannelsApi.create,
    onSuccess: () => {
      toast.success("کانال/گروه اضافه شد");
      setForm(emptyForm);
      queryClient.invalidateQueries({ queryKey: ["required-channels"] });
    },
    onError: (error) => toast.error(getApiError(error)),
  });
  const update = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<RequiredChannelPayload> }) => requiredChannelsApi.update(id, payload), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["required-channels"] }), onError: (error) => toast.error(getApiError(error)) });
  const refresh = useMutation({ mutationFn: requiredChannelsApi.refreshBotStatus, onSuccess: () => { toast.success("وضعیت ربات بروزرسانی شد"); queryClient.invalidateQueries({ queryKey: ["required-channels"] }); }, onError: (error) => toast.error(getApiError(error)) });
  const remove = useMutation({ mutationFn: requiredChannelsApi.delete, onSuccess: () => { toast.success("حذف شد"); queryClient.invalidateQueries({ queryKey: ["required-channels"] }); } });

  const patch = (id: number, payload: Partial<RequiredChannelPayload>) => update.mutate({ id, payload });

  return <div className="space-y-6">
    <div className="page-header"><div><h1 className="section-title">مدیریت عضویت اجباری</h1><p className="text-sm text-muted-foreground">برای رفع خطای chat not found، شناسه عددی واقعی کانال با پیشوند -100 را ذخیره کنید و وضعیت ربات را از همین صفحه بررسی کنید.</p></div></div>
    <Card>
      <CardHeader><h2 className="font-semibold">افزودن کانال یا گروه</h2></CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <Input label="نام واقعی" value={form.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, title: e.target.value })} />
          <Input label="عنوان نمایشی در ربات" value={form.displayTitle ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, displayTitle: e.target.value })} placeholder="مثلاً کانال اطلاع‌رسانی پراپچی" />
          <Input label="Chat ID عددی" dir="ltr" value={form.chatId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, chatId: e.target.value })} placeholder="-1001234567890" />
          <Input label="Username" dir="ltr" value={form.username ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, username: e.target.value })} />
          <Select label="نوع" value={form.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, type: e.target.value as RequiredChannelPayload["type"] })}><option value="CHANNEL">کانال</option><option value="GROUP">گروه</option></Select>
          <Input label="لینک دعوت" dir="ltr" value={form.inviteLink ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, inviteLink: e.target.value })} />
          <Input label="متن دکمه" value={form.buttonText ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, buttonText: e.target.value })} placeholder="عضویت در کانال اطلاع‌رسانی" />
          <div className="flex items-end"><Toggle checked={Boolean(form.isActive)} onChange={(v) => setForm({ ...form, isActive: v })} label="فعال" /></div>
        </div>
        <div className="mt-4"><Button loading={create.isPending} onClick={() => create.mutate(form)}>ثبت</Button></div>
      </CardContent>
    </Card>
    <Card><CardHeader><h2 className="font-semibold">لیست عضویت اجباری</h2></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>عنوان</th><th>شناسه</th><th>دعوت و دکمه</th><th>وضعیت ربات</th><th>چرخه تایید</th><th>فعال</th><th>عملیات</th></tr></thead><tbody>{query.data?.items.map((item: RequiredChannel) => <tr key={item.id}>
      <td className="min-w-64"><Input label="نام واقعی" value={item.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch(item.id, { title: e.target.value })} /><Input label="عنوان نمایشی" value={item.displayTitle ?? item.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch(item.id, { displayTitle: e.target.value })} /></td>
      <td className="min-w-56"><Input label="Chat ID" dir="ltr" value={item.chatId || item.channelId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch(item.id, { chatId: e.target.value })} /><div className="mt-2"><Badge variant="info">{item.type === "CHANNEL" ? "کانال" : "گروه"}</Badge></div></td>
      <td className="min-w-64"><Input label="لینک دعوت" dir="ltr" value={item.inviteLink ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch(item.id, { inviteLink: e.target.value })} /><Input label="متن دکمه" value={item.buttonText ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => patch(item.id, { buttonText: e.target.value })} /></td>
      <td><Badge variant={item.botStatus === "administrator" || item.botStatus === "creator" ? "success" : item.botStatus?.includes("ERROR") || item.lastError ? "danger" : "outline"}>{item.botStatus || "بررسی نشده"}</Badge>{item.lastError && <p className="mt-2 flex max-w-xs items-start gap-1 text-xs text-red-500"><AlertTriangle className="h-4 w-4 shrink-0" />{item.lastError}</p>}<Button className="mt-2" size="sm" variant="outline" loading={refresh.isPending} onClick={() => refresh.mutate(item.id)}><RefreshCw className="h-4 w-4" /> بررسی</Button></td>
      <td><Badge variant={item.status === "APPROVED" ? "success" : item.status === "PENDING" ? "warning" : "outline"}>{item.status}</Badge><div className="mt-2 flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => patch(item.id, { status: "APPROVED" })}>تایید</Button><Button size="sm" variant="outline" onClick={() => patch(item.id, { status: "REJECTED" })}>رد</Button><Button size="sm" variant="outline" onClick={() => patch(item.id, { status: "DISABLED" })}>غیرفعال</Button></div></td>
      <td><Toggle checked={item.isActive} onChange={(v) => patch(item.id, { isActive: v })} /></td>
      <td><button className="text-red-500" onClick={() => remove.mutate(item.id)}><Trash2 className="h-4 w-4" /></button></td>
    </tr>)}</tbody></table></div>{!query.isLoading && !query.data?.items.length && <EmptyState icon={<RadioTower />} title="موردی ثبت نشده" />}</CardContent></Card>
  </div>;
}
