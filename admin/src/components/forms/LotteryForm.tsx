"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Input, Toggle } from "@/components/ui";
import { safeToISOString } from "@/lib/utils";
import type { Lottery } from "@/types";
import type { LotteryPayload } from "@/services/api";

const schema = z.object({
  title: z.string().min(2, "عنوان حداقل ۲ کاراکتر است"),
  prize: z.string().min(1, "جایزه الزامی است"),
  description: z.string().optional(),
  announcementMsg: z.string().optional(),
  startAt: z.string().min(1, "تاریخ شروع الزامی است"),
  endAt: z.string().min(1, "تاریخ پایان الزامی است"),
  winnersCount: z.coerce.number().int().positive(),
  minPoints: z.coerce.number().int().min(0),
  entryCost: z.coerce.number().int().min(0),
  isActive: z.boolean(),
}).refine((data) => {
  const start = safeToISOString(data.startAt);
  const end = safeToISOString(data.endAt);
  return Boolean(start && end && new Date(end).getTime() > new Date(start).getTime());
}, { path: ["endAt"], message: "تاریخ پایان باید بعد از شروع باشد" });

type FormValues = z.infer<typeof schema>;
const toLocal = (value?: string | null) => safeToISOString(value)?.slice(0, 16) ?? "";

export default function LotteryForm({ initial, loading, submitLabel = "ذخیره", onSubmit }: { initial?: Lottery; loading?: boolean; submitLabel?: string; onSubmit: (payload: LotteryPayload) => void }) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? "",
      prize: initial?.prize ?? "",
      description: initial?.description ?? "",
      announcementMsg: initial?.announcementMsg ?? "",
      startAt: toLocal(initial?.startAt),
      endAt: toLocal(initial?.endAt),
      winnersCount: initial?.winnersCount ?? 1,
      minPoints: initial?.minPoints ?? 0,
      entryCost: initial?.entryCost ?? 10,
      isActive: initial?.isActive ?? true,
    },
  });
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit((values) => onSubmit({
      ...values,
      startAt: safeToISOString(values.startAt) ?? "",
      endAt: safeToISOString(values.endAt) ?? "",
      description: values.description || null,
      announcementMsg: values.announcementMsg || null,
    }))}>
      <Input label="عنوان" error={errors.title?.message} {...register("title")} />
      <Input label="جایزه" error={errors.prize?.message} {...register("prize")} />
      <Input label="شروع" type="datetime-local" error={errors.startAt?.message} {...register("startAt")} />
      <Input label="پایان" type="datetime-local" error={errors.endAt?.message} {...register("endAt")} />
      <Input label="تعداد برنده" type="number" error={errors.winnersCount?.message} {...register("winnersCount")} />
      <Input label="حداقل امتیاز" type="number" error={errors.minPoints?.message} {...register("minPoints")} />
      <Input label="هزینه ورود" type="number" error={errors.entryCost?.message} {...register("entryCost")} />
      <div className="flex items-end"><Toggle checked={watch("isActive")} onChange={(value) => setValue("isActive", value)} label="فعال" /></div>
      <div className="md:col-span-2"><Input label="توضیحات" error={errors.description?.message} {...register("description")} /></div>
      <div className="md:col-span-2"><Input label="پیام اعلام" error={errors.announcementMsg?.message} {...register("announcementMsg")} /></div>
      <div className="md:col-span-2"><Button loading={loading} type="submit">{submitLabel}</Button></div>
    </form>
  );
}
