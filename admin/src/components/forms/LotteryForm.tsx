"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button, Input } from "@/components/ui";
import type { Lottery } from "@/types";
import type { LotteryPayload } from "@/services/api";

const schema = z.object({
  title: z.string().min(2, "عنوان حداقل ۲ کاراکتر است"),
  prize: z.string().min(1, "جایزه الزامی است"),
  winnersCount: z.coerce.number().int().positive(),
  entryCost: z.coerce.number().int().min(0),
});

type FormValues = z.infer<typeof schema>;

export default function LotteryForm({ initial, loading, submitLabel = "ذخیره", onSubmit }: { initial?: Lottery; loading?: boolean; submitLabel?: string; onSubmit: (payload: LotteryPayload) => void }) {
  const { register, handleSubmit, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? "",
      prize: initial?.prize ?? "",
      winnersCount: initial?.winnersCount ?? 1,
      entryCost: initial?.entryCost ?? 10,
    },
  });
  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit((values) => onSubmit(values))}>
      <Input label="عنوان" error={errors.title?.message} {...register("title")} />
      <Input label="جایزه" error={errors.prize?.message} {...register("prize")} />
      <Input label="تعداد برنده" type="number" error={errors.winnersCount?.message} {...register("winnersCount")} />
      <Input label="هزینه ورود" type="number" error={errors.entryCost?.message} {...register("entryCost")} />
      <div className="md:col-span-2"><Button loading={loading} type="submit">{submitLabel}</Button></div>
    </form>
  );
}
