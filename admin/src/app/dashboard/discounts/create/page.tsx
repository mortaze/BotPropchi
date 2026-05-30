"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui";
import DiscountForm from "@/components/forms/DiscountForm";
import { discountsApi, getApiError } from "@/services/api";

export default function CreateDiscountPage() {
  const router = useRouter(); const qc = useQueryClient();
  const mutation = useMutation({ mutationFn: discountsApi.create, onSuccess: () => { toast.success("کد تخفیف ایجاد شد"); qc.invalidateQueries({ queryKey: ["discounts"] }); router.push("/dashboard/discounts"); }, onError: (error) => toast.error(getApiError(error)) });
  return <div className="max-w-4xl space-y-6"><div><h1 className="text-2xl font-bold">ایجاد کد تخفیف</h1></div><Card><CardHeader><h2 className="font-semibold">اطلاعات کد</h2></CardHeader><CardContent><DiscountForm loading={mutation.isPending} submitLabel="ایجاد" onSubmit={(payload) => mutation.mutate(payload)} /></CardContent></Card></div>;
}
