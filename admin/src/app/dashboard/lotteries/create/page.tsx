"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui";
import LotteryForm from "@/components/forms/LotteryForm";
import { getApiError, lotteriesApi } from "@/services/api";

export default function CreateLotteryPage() {
  const router = useRouter(); const qc = useQueryClient();
  const mutation = useMutation({ mutationFn: lotteriesApi.create, onSuccess: (data) => { toast.success("قرعه‌کشی ایجاد شد"); qc.invalidateQueries({ queryKey: ["lotteries"] }); router.push(`/dashboard/lotteries/${data.lottery.id}`); }, onError: (error) => toast.error(getApiError(error)) });
  return <div className="max-w-4xl space-y-6"><div><h1 className="text-2xl font-bold">ایجاد قرعه‌کشی</h1><p className="text-sm text-muted-foreground">مطابق payload واقعی backend</p></div><Card><CardHeader><h2 className="font-semibold">اطلاعات قرعه‌کشی</h2></CardHeader><CardContent><LotteryForm loading={mutation.isPending} submitLabel="ایجاد" onSubmit={(payload) => mutation.mutate(payload)} /></CardContent></Card></div>;
}
