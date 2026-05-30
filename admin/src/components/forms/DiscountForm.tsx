"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { discountsApi, type DiscountPayload } from "@/services/api";
import { CATEGORY_LABELS, type DiscountCategory, type DiscountCode } from "@/types";
import { Button, Input, Select, Toggle } from "@/components/ui";

const categories = Object.keys(CATEGORY_LABELS) as DiscountCategory[];

const schema = z.object({
  title: z.string().min(2, "عنوان حداقل ۲ کاراکتر است"),
  code: z.string().min(2, "کد حداقل ۲ کاراکتر است"),
  discountPercent: z.coerce.number().min(0).max(100),
  propFirmId: z.coerce.number().int().positive("پراپ فرم را انتخاب کنید"),
  affiliateLink: z.string().url("لینک معتبر نیست").or(z.literal("")).optional(),
  expiresAt: z.string().optional(),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
  category: z.enum(categories as [DiscountCategory, ...DiscountCategory[]]),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  initial?: DiscountCode;
  loading?: boolean;
  submitLabel?: string;
  onSubmit: (payload: DiscountPayload) => void;
}

export default function DiscountForm({ initial, loading, submitLabel = "ذخیره", onSubmit }: Props) {
  const firmsQuery = useQuery({ queryKey: ["prop-firms"], queryFn: discountsApi.getPropFirms });
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? "",
      code: initial?.code ?? "",
      discountPercent: initial?.discountPercent ?? 0,
      propFirmId: initial?.propFirmId ?? 0,
      affiliateLink: initial?.affiliateLink ?? "",
      expiresAt: initial?.expiresAt ? initial.expiresAt.slice(0, 10) : "",
      isFeatured: initial?.isFeatured ?? false,
      isActive: initial?.isActive ?? true,
      category: initial?.category ?? "OTHER",
    },
  });

  return (
    <form
      className="grid gap-4 md:grid-cols-2"
      onSubmit={handleSubmit((values) => onSubmit({
        ...values,
        code: values.code.toUpperCase(),
        affiliateLink: values.affiliateLink || null,
        expiresAt: values.expiresAt ? new Date(values.expiresAt).toISOString() : null,
      }))}
    >
      <Input label="عنوان" error={errors.title?.message} {...register("title")} />
      <Input label="کد تخفیف" error={errors.code?.message} {...register("code")} />
      <Input label="درصد تخفیف" type="number" error={errors.discountPercent?.message} {...register("discountPercent")} />
      <Select label="پراپ فرم" error={errors.propFirmId?.message} {...register("propFirmId")}>
        <option value={0}>انتخاب کنید</option>
        {(firmsQuery.data ?? []).map((firm) => <option key={firm.id} value={firm.id}>{firm.name}</option>)}
      </Select>
      <Select label="دسته‌بندی" error={errors.category?.message} {...register("category")}>
        {categories.map((category) => <option key={category} value={category}>{CATEGORY_LABELS[category]}</option>)}
      </Select>
      <Input label="تاریخ انقضا" type="date" error={errors.expiresAt?.message} {...register("expiresAt")} />
      <div className="md:col-span-2"><Input label="لینک افیلیت" error={errors.affiliateLink?.message} {...register("affiliateLink")} /></div>
      <Toggle checked={watch("isActive")} onChange={(value) => setValue("isActive", value)} label="فعال" />
      <Toggle checked={watch("isFeatured")} onChange={(value) => setValue("isFeatured", value)} label="ویژه" />
      <div className="md:col-span-2"><Button loading={loading} type="submit">{submitLabel}</Button></div>
    </form>
  );
}
