// src/app/dashboard/discounts/edit/[id]/page.tsx
"use client";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { discountsApi } from "@/services/api";
import { Card, CardHeader, CardContent, Skeleton } from "@/components/ui";
import DiscountForm from "@/components/forms/DiscountForm";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

export default function EditDiscountPage() {
  const { id } = useParams();
  const router = useRouter();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["discounts", 1],
    queryFn: () => discountsApi.getAll(1),
    select: (d: any) => d.items?.find((i: any) => i.id === parseInt(id as string)),
  });

  const mutation = useMutation({
    mutationFn: (formData: any) => discountsApi.update(parseInt(id as string), formData),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["discounts"] });
      toast.success("تغییرات ذخیره شد");
      router.push("/dashboard/discounts");
    },
    onError: (err: any) => toast.error(err.response?.data?.error || "خطا"),
  });

  return (
    <div className="max-w-2xl space-y-5">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="w-4 h-4" />بازگشت
      </button>
      <Card>
        <CardHeader><h2 className="font-semibold text-foreground">ویرایش کد تخفیف</h2></CardHeader>
        <CardContent>
          {isLoading ? <Skeleton className="h-64 w-full" /> : data ? (
            <DiscountForm defaultValues={{ ...data, propFirmId: data.propFirmId }}
              onSubmit={(d) => mutation.mutate(d)} loading={mutation.isPending} />
          ) : <p className="text-muted-foreground">کدی یافت نشد</p>}
        </CardContent>
      </Card>
    </div>
  );
}