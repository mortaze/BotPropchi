"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RadioTower, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, Select, Toggle } from "@/components/ui";
import { getApiError, requiredChannelsApi, type RequiredChannelPayload } from "@/services/api";
import type { RequiredChannel } from "@/types";

const emptyForm: RequiredChannelPayload = { title: "", chatId: "", username: "", type: "CHANNEL", inviteLink: "", isActive: true };

export default function RequiredChannelsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<RequiredChannelPayload>(emptyForm);
  const query = useQuery({ queryKey: ["required-channels"], queryFn: () => requiredChannelsApi.getAll() });
  const create = useMutation({
    mutationFn: requiredChannelsApi.create,
    onSuccess: () => { toast.success("کانال/گروه اضافه شد"); setForm(emptyForm); queryClient.invalidateQueries({ queryKey: ["required-channels"] }); },
    onError: (error) => toast.error(getApiError(error)),
  });
  const update = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<RequiredChannelPayload> }) => requiredChannelsApi.update(id, payload), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["required-channels"] }) });
  const remove = useMutation({ mutationFn: requiredChannelsApi.delete, onSuccess: () => { toast.success("حذف شد"); queryClient.invalidateQueries({ queryKey: ["required-channels"] }); } });

  return <div className="space-y-6">
    <div className="page-header"><div><h1 className="section-title">مدیریت عضویت اجباری</h1><p className="text-sm text-muted-foreground">کانال‌ها و گروه‌هایی که کاربر قبل از استفاده از ربات باید عضو آن‌ها باشد.</p></div></div>
    <Card>
      <CardHeader><h2 className="font-semibold">افزودن کانال یا گروه</h2></CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <Input label="عنوان" value={form.title} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, title: e.target.value })} />
          <Input label="Chat ID یا Username" dir="ltr" value={form.chatId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, chatId: e.target.value })} placeholder="@channel یا -100..." />
          <Input label="Username" dir="ltr" value={form.username ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, username: e.target.value })} />
          <Select label="نوع" value={form.type} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, type: e.target.value as RequiredChannelPayload["type"] })}><option value="CHANNEL">کانال</option><option value="GROUP">گروه</option></Select>
          <Input label="لینک دعوت" dir="ltr" value={form.inviteLink ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, inviteLink: e.target.value })} />
          <div className="flex items-end"><Toggle checked={Boolean(form.isActive)} onChange={(v) => setForm({ ...form, isActive: v })} label="فعال" /></div>
        </div>
        <div className="mt-4"><Button loading={create.isPending} onClick={() => create.mutate(form)}>ثبت</Button></div>
      </CardContent>
    </Card>
    <Card><CardHeader><h2 className="font-semibold">لیست عضویت اجباری</h2></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>عنوان</th><th>شناسه</th><th>نوع</th><th>چرخه تایید</th><th>وضعیت</th><th>عملیات</th></tr></thead><tbody>{query.data?.items.map((item: RequiredChannel) => <tr key={item.id}><td>{item.title}</td><td dir="ltr">{item.chatId || item.channelId}</td><td><Badge variant="info">{item.type === "CHANNEL" ? "کانال" : "گروه"}</Badge></td><td><Badge variant={item.status === "APPROVED" ? "success" : item.status === "PENDING" ? "warning" : "outline"}>{item.status}</Badge><div className="mt-2 flex gap-2"><Button size="sm" variant="outline" onClick={() => update.mutate({ id: item.id, payload: { status: "APPROVED" } })}>تایید</Button><Button size="sm" variant="outline" onClick={() => update.mutate({ id: item.id, payload: { status: "REJECTED" } })}>رد</Button><Button size="sm" variant="outline" onClick={() => update.mutate({ id: item.id, payload: { status: "DISABLED" } })}>غیرفعال</Button></div></td><td><Toggle checked={item.isActive} onChange={(v) => update.mutate({ id: item.id, payload: { isActive: v } })} /></td><td><button className="text-red-500" onClick={() => remove.mutate(item.id)}><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>{!query.isLoading && !query.data?.items.length && <EmptyState icon={<RadioTower />} title="موردی ثبت نشده" />}</CardContent></Card>
  </div>;
}
