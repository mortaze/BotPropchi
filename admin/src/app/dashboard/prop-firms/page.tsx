"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, Modal, TableRowSkeleton, Toggle } from "@/components/ui";
import { discountsApi, getApiError } from "@/services/api";
import type { PropFirm } from "@/types";

const schema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2),
  description: z.string().optional(),
  logoUrl: z.string().url().or(z.literal("")).optional(),
  websiteUrl: z.string().url().or(z.literal("")).optional(),
  reviewLink: z.string().url().or(z.literal("")).optional(),
  isActive: z.boolean(),
});
type Values = z.infer<typeof schema>;

const toPayload = (values: Values) => ({
  ...values,
  description: values.description || null,
  logoUrl: values.logoUrl || null,
  websiteUrl: values.websiteUrl || null,
  reviewLink: values.reviewLink || null,
});

const defaults: Values = { name: "", slug: "", description: "", logoUrl: "", websiteUrl: "", reviewLink: "", isActive: true };

export default function PropFirmsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PropFirm | null>(null);
  const query = useQuery({ queryKey: ["prop-firms"], queryFn: discountsApi.getPropFirms });
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });
  const editForm = useForm<Values>({ resolver: zodResolver(schema), defaultValues: defaults });

  useEffect(() => {
    if (editing) {
      editForm.reset({
        name: editing.name,
        slug: editing.slug,
        description: editing.description || "",
        logoUrl: editing.logoUrl || "",
        websiteUrl: editing.websiteUrl || "",
        reviewLink: editing.reviewLink || "",
        isActive: editing.isActive,
      });
    }
  }, [editing, editForm]);

  const create = useMutation({
    mutationFn: (values: Values) => discountsApi.createPropFirm(toPayload(values)),
    onSuccess: () => { toast.success("پراپ فرم ایجاد شد"); form.reset(defaults); qc.invalidateQueries({ queryKey: ["prop-firms"] }); },
    onError: (error) => toast.error(getApiError(error)),
  });
  const update = useMutation({
    mutationFn: (values: Values) => discountsApi.updatePropFirm(editing!.id, toPayload(values)),
    onSuccess: () => { toast.success("پراپ فرم به‌روزرسانی شد"); setEditing(null); qc.invalidateQueries({ queryKey: ["prop-firms"] }); },
    onError: (error) => toast.error(getApiError(error)),
  });

  const rows = useMemo(() => query.data ?? [], [query.data]);

  const FirmForm = ({ mode }: { mode: "create" | "edit" }) => {
    const current = mode === "create" ? form : editForm;
    const mutation = mode === "create" ? create : update;
    return (
      <form className="grid gap-4 md:grid-cols-2" onSubmit={current.handleSubmit((values) => mutation.mutate(values))}>
        <Input label="نام پراپ" error={current.formState.errors.name?.message} {...current.register("name")} />
        <Input label="اسلاگ" error={current.formState.errors.slug?.message} {...current.register("slug")} />
        <Input label="لینک خرید / وب‌سایت" error={current.formState.errors.websiteUrl?.message} {...current.register("websiteUrl")} />
        <Input label="لوگو" error={current.formState.errors.logoUrl?.message} {...current.register("logoUrl")} />
        <Input label="لینک بررسی پراپ" error={current.formState.errors.reviewLink?.message} {...current.register("reviewLink")} />
        <Input label="توضیح" error={current.formState.errors.description?.message} {...current.register("description")} />
        <Toggle checked={current.watch("isActive")} onChange={(value) => current.setValue("isActive", value, { shouldDirty: true })} label="فعال" />
        <div className="md:col-span-2"><Button loading={current.formState.isSubmitting || mutation.isPending} type="submit">{mode === "create" ? "ایجاد" : "ذخیره تغییرات"}</Button></div>
      </form>
    );
  };

  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold">مدیریت پراپ فرم‌ها</h1><p className="text-sm text-muted-foreground">نام، لوگو، لینک خرید و لینک بررسی پراپ را مدیریت کنید.</p></div>
      <Card><CardHeader><h2 className="font-semibold">ایجاد پراپ فرم</h2></CardHeader><CardContent><FirmForm mode="create" /></CardContent></Card>
      <Card>
        <CardHeader><h2 className="font-semibold">لیست پراپ فرم‌ها</h2></CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="data-table responsive-table">
              <thead><tr><th>نام</th><th>اسلاگ</th><th>خرید</th><th>بررسی</th><th>کدها</th><th>وضعیت</th><th>اکشن</th></tr></thead>
              <tbody>
                {query.isLoading && Array.from({ length: 4 }).map((_, i) => <TableRowSkeleton key={i} cols={7} />)}
                {rows.map((firm) => <tr key={firm.id}>
                  <td data-label="نام" className="font-medium">{firm.name}</td>
                  <td data-label="اسلاگ">{firm.slug}</td>
                  <td data-label="خرید">{firm.websiteUrl ? <a className="text-primary" href={firm.websiteUrl} target="_blank">لینک</a> : "-"}</td>
                  <td data-label="بررسی">{firm.reviewLink ? <a className="text-primary" href={firm.reviewLink} target="_blank">لینک</a> : "-"}</td>
                  <td data-label="کدها">{firm._count?.discountCodes ?? 0}</td>
                  <td data-label="وضعیت"><Badge variant={firm.isActive ? "success" : "warning"}>{firm.isActive ? "فعال" : "غیرفعال"}</Badge></td>
                  <td data-label="اکشن"><Button size="sm" variant="outline" onClick={() => setEditing(firm)}>ویرایش</Button></td>
                </tr>)}
              </tbody>
            </table>
          </div>
          {!query.isLoading && !rows.length && <EmptyState />}
        </CardContent>
      </Card>
      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="ویرایش پراپ فرم" size="lg"><FirmForm mode="edit" /></Modal>
    </div>
  );
}
