// // src/components/forms/DiscountForm.tsx
// "use client";
// import { useForm } from "react-hook-form";
// import { zodResolver } from "@hookform/resolvers/zod";
// import { z } from "zod";
// import { useQuery } from "@tanstack/react-query";
// import { discountsApi } from "@/services/api";
// import { Input, Select, Button } from "@/components/ui";
// import { CATEGORY_LABELS, DiscountCategory } from "@/types";
// import { cn } from "@/lib/utils";

// const schema = z.object({
//   title: z.string().min(2, "حداقل ۲ کاراکتر"),
//   code: z.string().min(2, "حداقل ۲ کاراکتر"),
//   discountPercent: z.coerce.number().min(1).max(100),
//   propFirmId: z.coerce.number().min(1, "پراپ فرم انتخاب کنید"),
//   affiliateLink: z.string().url("لینک معتبر وارد کنید").optional().or(z.literal("")),
//   expiresAt: z.string().optional(),
//   isFeatured: z.boolean().default(false),
//   isActive: z.boolean().default(true),
//   category: z.string().default("OTHER"),
// });

// export type DiscountFormData = z.infer<typeof schema>;

// export default function DiscountForm({
//   defaultValues, onSubmit, loading,
// }: {
//   defaultValues?: Partial<DiscountFormData>;
//   onSubmit: (data: DiscountFormData) => void;
//   loading?: boolean;
// }) {
//   const { data: propFirms } = useQuery({
//     queryKey: ["prop-firms"],
//     queryFn: discountsApi.getPropFirms,
//   });

//   const { register, handleSubmit, formState: { errors } } = useForm<DiscountFormData>({
//     resolver: zodResolver(schema),
//     defaultValues: { isActive: true, isFeatured: false, ...defaultValues },
//   });

//   return (
//     <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
//       <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
//         <Input label="عنوان کد" {...register("title")} error={errors.title?.message} placeholder="مثال: تخفیف ۱۰٪ FTMO" />
//         <Input label="کد تخفیف" {...register("code")} error={errors.code?.message} placeholder="FTMO10" className="font-mono uppercase" />
//         <Input label="درصد تخفیف" type="number" {...register("discountPercent")} error={errors.discountPercent?.message} placeholder="10" />
//         <Select label="پراپ فرم" {...register("propFirmId")} error={errors.propFirmId?.message}>
//           <option value="">انتخاب کنید...</option>
//           {(propFirms || []).map((f: any) => (
//             <option key={f.id} value={f.id}>{f.name}</option>
//           ))}
//         </Select>
//         <Select label="دسته‌بندی" {...register("category")}>
//           {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
//             <option key={k} value={k}>{v}</option>
//           ))}
//         </Select>
//         <Input label="تاریخ انقضا (اختیاری)" type="datetime-local" {...register("expiresAt")} />
//       </div>
//       <Input label="لینک افیلیت (اختیاری)" {...register("affiliateLink")} error={errors.affiliateLink?.message} placeholder="https://..." />
//       <div className="flex items-center gap-6 pt-2">
//         <label className="flex items-center gap-2 cursor-pointer">
//           <input type="checkbox" {...register("isActive")} className="rounded border-input" />
//           <span className="text-sm text-foreground">فعال</span>
//         </label>
//         <label className="flex items-center gap-2 cursor-pointer">
//           <input type="checkbox" {...register("isFeatured")} className="rounded border-input" />
//           <span className="text-sm text-foreground">ویژه (Featured)</span>
//         </label>
//       </div>
//       <Button type="submit" loading={loading} className="w-full sm:w-auto">ذخیره</Button>
//     </form>
//   );
// }

// src/components/forms/DiscountForm.tsx
"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";

import { discountsApi } from "@/services/api";

import {
  Button,
  Input,
} from "@/components/ui";

import { toast } from "sonner";

const categories = [
  { value: "HIGHEST_DISCOUNT", label: "بیشترین تخفیف" },
  { value: "NO_TIME_LIMIT", label: "بدون محدودیت زمانی" },
  { value: "FIRST_PURCHASE", label: "اولین خرید" },
  { value: "TWO_PHASE_ONLY", label: "دو مرحله‌ای" },
  { value: "NEWEST", label: "جدیدترین" },
  { value: "MOST_POPULAR", label: "محبوب‌ترین" },
  { value: "OTHER", label: "سایر" },
];

const schema = z.object({
  title: z.string().min(2, "عنوان الزامی است"),

  code: z.string().min(2, "کد تخفیف الزامی است"),

  discountPercent: z.coerce
    .number()
    .min(1, "حداقل ۱ درصد")
    .max(100, "حداکثر ۱۰۰ درصد"),

  category: z.string(),

  propFirmId: z.coerce.number(),

  affiliateLink: z
    .string()
    .optional()
    .or(z.literal("")),

  description: z
    .string()
    .optional()
    .or(z.literal("")),

  expiresAt: z
    .string()
    .optional()
    .or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

interface DiscountFormProps {
  onSubmit: (data: any) => void;
  loading?: boolean;
  defaultValues?: Partial<FormValues>;
}

export default function DiscountForm({
  onSubmit,
  loading = false,
  defaultValues,
}: DiscountFormProps) {
  const [firms, setFirms] = useState<any[]>([]);
  const [loadingFirms, setLoadingFirms] = useState(true);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),

    defaultValues: {
      title: defaultValues?.title || "",
      code: defaultValues?.code || "",
      discountPercent: defaultValues?.discountPercent || 10,
      category: defaultValues?.category || "OTHER",
      affiliateLink: defaultValues?.affiliateLink || "",
      description: defaultValues?.description || "",
      expiresAt: defaultValues?.expiresAt || "",
      propFirmId: defaultValues?.propFirmId || undefined,
    },
  });

  useEffect(() => {
    const fetchFirms = async () => {
      try {
        const data = await discountsApi.getPropFirms();
        setFirms(data || []);
      } catch (err) {
        toast.error("خطا در دریافت پراپ فرم‌ها");
      } finally {
        setLoadingFirms(false);
      }
    };

    fetchFirms();
  }, []);

  const submitHandler = (data: FormValues) => {
    const payload = {
      ...data,

      affiliateLink:
        data.affiliateLink?.trim() || null,

      description:
        data.description?.trim() || null,

      expiresAt:
        data.expiresAt?.trim()
          ? new Date(data.expiresAt).toISOString()
          : null,
    };

    onSubmit(payload);
  };

  return (
    <form
      onSubmit={handleSubmit(submitHandler)}
      className="space-y-5"
    >
      {/* title */}
      <Input
        label="عنوان"
        placeholder="کد تخفیف FTMO"
        {...register("title")}
        error={errors.title?.message}
      />

      {/* code */}
      <Input
        label="کد تخفیف"
        placeholder="PROPCHI30"
        {...register("code")}
        error={errors.code?.message}
      />

      {/* percent */}
      <Input
        type="number"
        label="درصد تخفیف"
        placeholder="30"
        {...register("discountPercent")}
        error={errors.discountPercent?.message}
      />

      {/* category */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          دسته‌بندی
        </label>

        <select
          {...register("category")}
          className="
            w-full h-11 rounded-xl border border-border
            bg-background px-4 text-sm
            outline-none focus:ring-2 focus:ring-primary
          "
        >
          {categories.map((cat) => (
            <option
              key={cat.value}
              value={cat.value}
            >
              {cat.label}
            </option>
          ))}
        </select>

        {errors.category && (
          <p className="text-xs text-red-500">
            {errors.category.message}
          </p>
        )}
      </div>

      {/* prop firm */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          پراپ فرم
        </label>

        <select
          {...register("propFirmId")}
          className="
            w-full h-11 rounded-xl border border-border
            bg-background px-4 text-sm
            outline-none focus:ring-2 focus:ring-primary
          "
        >
          <option value="">
            انتخاب پراپ فرم
          </option>

          {firms.map((firm) => (
            <option
              key={firm.id}
              value={firm.id}
            >
              {firm.name}
            </option>
          ))}
        </select>

        {errors.propFirmId && (
          <p className="text-xs text-red-500">
            پراپ فرم الزامی است
          </p>
        )}
      </div>

      {/* affiliate */}
      <Input
        label="لینک افیلیت"
        placeholder="https://..."
        {...register("affiliateLink")}
        error={errors.affiliateLink?.message}
      />

      {/* expires */}
      <Input
        type="datetime-local"
        label="تاریخ انقضا (اختیاری)"
        {...register("expiresAt")}
        error={errors.expiresAt?.message}
      />

      {/* desc */}
      <div className="space-y-2">
        <label className="text-sm font-medium">
          توضیحات
        </label>

        <textarea
          rows={4}
          {...register("description")}
          className="
            w-full rounded-xl border border-border
            bg-background px-4 py-3 text-sm
            outline-none focus:ring-2 focus:ring-primary
          "
          placeholder="توضیحات..."
        />
      </div>

      <Button
        type="submit"
        loading={loading}
        className="w-full"
      >
        ایجاد کد تخفیف
      </Button>
    </form>
  );
}

