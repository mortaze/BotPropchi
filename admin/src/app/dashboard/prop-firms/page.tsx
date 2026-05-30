"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, TableRowSkeleton, Toggle } from "@/components/ui";
import { discountsApi, getApiError } from "@/services/api";

const schema = z.object({ name: z.string().min(2), slug: z.string().min(2), description: z.string().optional(), logoUrl: z.string().url().or(z.literal("")).optional(), websiteUrl: z.string().url().or(z.literal("")).optional(), isActive: z.boolean() });
type Values = z.infer<typeof schema>;

export default function PropFirmsPage() {
  const qc = useQueryClient(); const query = useQuery({ queryKey: ["prop-firms"], queryFn: discountsApi.getPropFirms });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { name: "", slug: "", description: "", logoUrl: "", websiteUrl: "", isActive: true } });
  const mutation = useMutation({ mutationFn: (values: Values) => discountsApi.createPropFirm({ ...values, description: values.description || null, logoUrl: values.logoUrl || null, websiteUrl: values.websiteUrl || null }), onSuccess: () => { toast.success("پراپ فرم ایجاد شد"); reset(); qc.invalidateQueries({ queryKey: ["prop-firms"] }); }, onError: (error) => toast.error(getApiError(error)) });
  return <div className="space-y-6"><div><h1 className="text-2xl font-bold">مدیریت پراپ فرم‌ها</h1><p className="text-sm text-muted-foreground">backend فعلاً ایجاد و لیست پراپ فرم‌ها را ارائه می‌کند.</p></div><Card><CardHeader><h2 className="font-semibold">ایجاد پراپ فرم</h2></CardHeader><CardContent><form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit((values) => mutation.mutate(values))}><Input label="نام" error={errors.name?.message} {...register("name")} /><Input label="اسلاگ" error={errors.slug?.message} {...register("slug")} /><Input label="وب‌سایت" error={errors.websiteUrl?.message} {...register("websiteUrl")} /><Input label="لوگو" error={errors.logoUrl?.message} {...register("logoUrl")} /><div className="md:col-span-2"><Input label="توضیح" error={errors.description?.message} {...register("description")} /></div><Toggle checked={watch("isActive")} onChange={(value) => setValue("isActive", value)} label="فعال" /><div className="md:col-span-2"><Button loading={isSubmitting || mutation.isPending} type="submit">ایجاد</Button></div></form></CardContent></Card><Card><CardHeader><h2 className="font-semibold">لیست پراپ فرم‌ها</h2></CardHeader><CardContent className="overflow-x-auto p-0"><table className="data-table"><thead><tr><th>نام</th><th>اسلاگ</th><th>وب‌سایت</th><th>کدها</th><th>وضعیت</th></tr></thead><tbody>{query.isLoading && Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} cols={5} />)}{(query.data ?? []).map((firm) => <tr key={firm.id}><td className="font-medium">{firm.name}</td><td>{firm.slug}</td><td>{firm.websiteUrl ? <a className="text-primary" href={firm.websiteUrl} target="_blank">لینک</a> : "-"}</td><td>{firm._count?.discountCodes ?? 0}</td><td><Badge variant={firm.isActive ? "success" : "warning"}>{firm.isActive ? "فعال" : "غیرفعال"}</Badge></td></tr>)}</tbody></table>{!query.isLoading && !query.data?.length && <EmptyState />}</CardContent></Card></div>;
}
