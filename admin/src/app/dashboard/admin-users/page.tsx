"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, UserCog } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, Select, Toggle } from "@/components/ui";
import { adminUsersApi, getApiError, type PanelAdminPayload } from "@/services/api";

const empty: PanelAdminPayload & { repeatPassword?: string } = { firstName: "", lastName: "", username: "", email: "", password: "", repeatPassword: "", role: "ADMIN", isActive: true };

export default function AdminUsersPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState(empty);
  const query = useQuery({ queryKey: ["panel-admins"], queryFn: adminUsersApi.getAll });
  const create = useMutation({ mutationFn: adminUsersApi.create, onSuccess: () => { toast.success("ادمین ایجاد شد"); setForm(empty); qc.invalidateQueries({ queryKey: ["panel-admins"] }); }, onError: (e) => toast.error(getApiError(e)) });
  const update = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: PanelAdminPayload }) => adminUsersApi.update(id, payload), onSuccess: () => { toast.success("به‌روزرسانی شد"); qc.invalidateQueries({ queryKey: ["panel-admins"] }); }, onError: (e) => toast.error(getApiError(e)) });
  const remove = useMutation({ mutationFn: adminUsersApi.delete, onSuccess: () => { toast.success("حذف شد"); qc.invalidateQueries({ queryKey: ["panel-admins"] }); }, onError: (e) => toast.error(getApiError(e)) });
  const submit = () => {
    if (form.password !== form.repeatPassword) return toast.error("رمز عبور و تکرار آن برابر نیست");
    const { repeatPassword, ...payload } = form;
    create.mutate(payload);
  };
  return <div className="space-y-6"><div className="page-header"><div><h1 className="section-title">مدیریت ادمین‌های پنل</h1><p className="text-sm text-muted-foreground">فقط Owner امکان ایجاد، ویرایش، حذف، تغییر رمز و تغییر نقش ادمین‌های پنل را دارد.</p></div></div>
    <Card><CardHeader><h2 className="font-semibold">ساخت ادمین جدید</h2></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Input label="نام" value={form.firstName ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, firstName: e.target.value })} /><Input label="نام خانوادگی" value={form.lastName ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, lastName: e.target.value })} /><Input label="نام کاربری" dir="ltr" value={form.username ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, username: e.target.value })} /><Input label="ایمیل" dir="ltr" type="email" value={form.email ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, email: e.target.value })} /><Input label="رمز عبور" type="password" value={form.password ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, password: e.target.value })} /><Input label="تکرار رمز" type="password" value={form.repeatPassword ?? ""} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, repeatPassword: e.target.value })} /><Select label="نقش" value={form.role} onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setForm({ ...form, role: e.target.value as "OWNER" | "ADMIN" })}><option value="ADMIN">ADMIN</option><option value="OWNER">OWNER</option></Select><div className="flex items-end"><Toggle checked={Boolean(form.isActive)} onChange={(v) => setForm({ ...form, isActive: v })} label="فعال" /></div></div><div className="mt-4"><Button loading={create.isPending} onClick={submit}>ایجاد ادمین</Button></div></CardContent></Card>
    <Card><CardHeader><h2 className="font-semibold">لیست ادمین‌های پنل</h2></CardHeader><CardContent className="p-0"><div className="overflow-x-auto"><table className="data-table"><thead><tr><th>نام</th><th>نام کاربری</th><th>ایمیل</th><th>نقش</th><th>وضعیت</th><th>آخرین ورود</th><th>عملیات</th></tr></thead><tbody>{query.data?.items.map((item) => <tr key={item.id}><td>{item.firstName || "-"} {item.lastName || ""}</td><td dir="ltr">{item.username}</td><td dir="ltr">{item.email || "-"}</td><td><Badge variant={item.role === "OWNER" || item.role === "SUPER_ADMIN" ? "warning" : "info"}>{item.role}</Badge></td><td><Badge variant={item.isActive ? "success" : "danger"}>{item.isActive ? "فعال" : "غیرفعال"}</Badge></td><td>{item.lastLoginAt ? new Date(item.lastLoginAt).toLocaleString("fa-IR") : "-"}</td><td className="flex gap-2"><Button size="sm" variant="outline" onClick={() => update.mutate({ id: item.id, payload: { isActive: !item.isActive } })}>{item.isActive ? "غیرفعال" : "فعال"}</Button><Button size="sm" variant="outline" onClick={() => { const password = prompt("رمز عبور جدید را وارد کنید"); if (password) update.mutate({ id: item.id, payload: { password } }); }}>تغییر رمز</Button><button className="text-red-500 disabled:opacity-40" disabled={item.role === "OWNER"} onClick={() => remove.mutate(item.id)}><Trash2 className="h-4 w-4" /></button></td></tr>)}</tbody></table></div>{!query.isLoading && !query.data?.items.length && <EmptyState icon={<UserCog />} title="ادمینی ثبت نشده" />}</CardContent></Card>
  </div>;
}
