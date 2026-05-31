"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, Select } from "@/components/ui";
import { botAdminsApi, getApiError, type BotAdminPayload } from "@/services/api";
import type { BotAdmin } from "@/types";

const empty: BotAdminPayload = { telegramId: "", username: "", firstName: "", lastName: "", role: "ADMIN", status: "ACTIVE" };

export default function BotAdminsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<BotAdminPayload>(empty);
  const query = useQuery({ queryKey: ["bot-admins"], queryFn: botAdminsApi.getAll });
  const create = useMutation({ mutationFn: botAdminsApi.create, onSuccess: () => { toast.success("ادمین ثبت شد"); setForm(empty); queryClient.invalidateQueries({ queryKey: ["bot-admins"] }); }, onError: (e) => toast.error(getApiError(e)) });
  const update = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: Partial<BotAdminPayload> }) => botAdminsApi.update(id, payload), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bot-admins"] }) });
  const remove = useMutation({ mutationFn: botAdminsApi.delete, onSuccess: () => { toast.success("حذف شد"); queryClient.invalidateQueries({ queryKey: ["bot-admins"] }); } });

  return <div className="space-y-6"><div className="page-header"><div><h1 className="section-title">Bot Admin Management</h1><p className="text-sm text-muted-foreground">مدیریت ادمین‌های داخل ربات تلگرام.</p></div></div>
    <Card><CardHeader><h2 className="font-semibold">افزودن ادمین</h2></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-3"><Input label="Telegram ID" dir="ltr" value={form.telegramId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, telegramId: e.target.value })} /><Input label="Username" dir="ltr" value={form.username ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, username: e.target.value })} /><Input label="Name" value={form.firstName ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, firstName: e.target.value })} /><Select label="Role" value={form.role} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, role: e.target.value as BotAdminPayload["role"] })}><option value="OWNER">Owner</option><option value="SUPER_ADMIN">SuperAdmin</option><option value="ADMIN">Admin</option><option value="MODERATOR">Moderator</option></Select></div><div className="mt-4"><Button loading={create.isPending} onClick={() => create.mutate(form)}>ثبت</Button></div></CardContent></Card>
    <Card><CardHeader><h2 className="font-semibold">لیست ادمین‌ها</h2></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>Telegram ID</th><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>CreatedAt</th><th>عملیات</th></tr></thead><tbody>{query.data?.items.map((item: BotAdmin) => <tr key={item.id}><td dir="ltr">{item.telegramId}</td><td>@{item.username || "-"}</td><td>{item.firstName || "-"} {item.lastName || ""}</td><td><Badge variant="info">{item.role}</Badge></td><td><Badge variant={item.status === "ACTIVE" ? "success" : "warning"}>{item.status}</Badge></td><td>{new Date(item.createdAt).toLocaleString("fa-IR")}</td><td className="flex gap-2"><Button size="sm" variant="outline" onClick={() => update.mutate({ id: item.id, payload: { status: item.status === "ACTIVE" ? "SUSPENDED" : "ACTIVE" } })}>{item.status === "ACTIVE" ? "تعلیق" : "فعال‌سازی"}</Button><button className="text-red-500" onClick={() => remove.mutate(item.id)}><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>{!query.isLoading && !query.data?.items.length && <EmptyState icon={<UserCog />} title="ادمینی ثبت نشده" />}</CardContent></Card>
  </div>;
}
