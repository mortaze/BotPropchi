"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, EmptyState } from "@/components/ui";
import DiscountForm from "@/components/forms/DiscountForm";
import { discountsApi, getApiError, type DiscountPayload } from "@/services/api";

export default function EditDiscountPage() {
  const id = Number(useParams<{ id: string }>().id); const router = useRouter(); const qc = useQueryClient();
  const query = useQuery({ queryKey: ["discount", id], queryFn: () => discountsApi.getById(id), enabled: Number.isFinite(id) });
  const mutation = useMutation({ mutationFn: (payload: DiscountPayload) => discountsApi.update(id, payload), onSuccess: () => { toast.success("کد تخفیف ذخیره شد"); qc.invalidateQueries({ queryKey: ["discounts"] }); router.push("/dashboard/discounts"); }, onError: (error) => toast.error(getApiError(error)) });
  if (query.isLoading) return <div className="skeleton h-96" />; if (!query.data) return <EmptyState />;
  return <div className="max-w-4xl space-y-6"><div><h1 className="text-2xl font-bold">ویرایش کد تخفیف</h1></div><Card><CardHeader><h2 className="font-semibold">اطلاعات کد</h2></CardHeader><CardContent><DiscountForm initial={query.data} loading={mutation.isPending} submitLabel="ذخیره" onSubmit={(payload) => mutation.mutate(payload)} /></CardContent></Card></div>;
}
