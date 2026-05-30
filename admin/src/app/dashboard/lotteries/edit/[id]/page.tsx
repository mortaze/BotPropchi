"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent, CardHeader, EmptyState } from "@/components/ui";
import LotteryForm from "@/components/forms/LotteryForm";
import { getApiError, lotteriesApi, type LotteryPayload } from "@/services/api";

export default function EditLotteryPage() {
  const id = Number(useParams<{ id: string }>().id); const router = useRouter(); const qc = useQueryClient();
  const query = useQuery({ queryKey: ["lottery", id], queryFn: () => lotteriesApi.getById(id), enabled: Number.isFinite(id) });
  const mutation = useMutation({ mutationFn: (payload: LotteryPayload) => lotteriesApi.update(id, payload), onSuccess: () => { toast.success("قرعه‌کشی ذخیره شد"); qc.invalidateQueries({ queryKey: ["lotteries"] }); qc.invalidateQueries({ queryKey: ["lottery", id] }); router.push(`/dashboard/lotteries/${id}`); }, onError: (error) => toast.error(getApiError(error)) });
  if (query.isLoading) return <div className="skeleton h-96" />; if (!query.data?.lottery) return <EmptyState />;
  return <div className="max-w-4xl space-y-6"><div><h1 className="text-2xl font-bold">ویرایش قرعه‌کشی</h1></div><Card><CardHeader><h2 className="font-semibold">اطلاعات</h2></CardHeader><CardContent><LotteryForm initial={query.data.lottery} loading={mutation.isPending} submitLabel="ذخیره" onSubmit={(payload) => mutation.mutate(payload)} /></CardContent></Card></div>;
}
