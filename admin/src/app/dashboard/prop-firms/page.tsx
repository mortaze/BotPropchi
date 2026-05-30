"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { discountsApi } from "@/services/api";
import { PropFirm } from "@/types";

import {
  Card,
  CardContent,
  Badge,
  Button,
  Modal,
  Input,
  EmptyState,
} from "@/components/ui";

import { Plus, ExternalLink } from "lucide-react";

import { toast } from "sonner";

import { useForm } from "react-hook-form";

import { z } from "zod";

import { zodResolver } from "@hookform/resolvers/zod";

const schema = z.object({
  name: z.string().min(2, "نام حداقل ۲ کاراکتر"),

  slug: z
    .string()
    .min(2, "Slug حداقل ۲ کاراکتر")
    .regex(
      /^[a-z0-9-]+$/,
      "فقط حروف کوچک انگلیسی، عدد و خط تیره"
    ),

  description: z.string().optional(),

  websiteUrl: z
    .string()
    .url("لینک معتبر نیست")
    .optional()
    .or(z.literal("")),

  logoUrl: z
    .string()
    .url("لینک معتبر نیست")
    .optional()
    .or(z.literal("")),
});

type FormData = z.infer<typeof schema>;

export default function PropFirmsPage() {
  const [mounted, setMounted] = useState(false);

  const [modal, setModal] = useState(false);

  const qc = useQueryClient();

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    data: firms,
    isLoading,
  } = useQuery({
    queryKey: ["prop-firms"],
    queryFn: discountsApi.getPropFirms,
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),
  });

  const mutation = useMutation({
    mutationFn: discountsApi.createPropFirm,

    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: ["prop-firms"],
      });

      toast.success("پراپ فرم با موفقیت اضافه شد");

      setModal(false);

      reset();
    },

    onError: (e: any) => {
      console.error(e);

      const errorMessage =
        typeof e?.response?.data?.error === "string"
          ? e.response.data.error
          : "خطا در ثبت پراپ فرم";

      toast.error(errorMessage);
    },
  });

  if (!mounted) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">
            پراپ فرم‌ها
          </h2>

          <p className="text-sm text-muted-foreground mt-1">
            مجموع {firms?.length || 0} پراپ فرم
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setModal(true)}
        >
          <Plus className="w-4 h-4 ml-1" />
          پراپ فرم جدید
        </Button>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-xl animate-pulse bg-muted"
            />
          ))}
        </div>
      ) : !firms?.length ? (
        <Card>
          <CardContent className="p-10">
            <EmptyState title="پراپ فرمی یافت نشد" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(firms as PropFirm[]).map((f) => (
            <Card
              key={f.id}
              className="transition-all hover:-translate-y-1"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary text-sm">
                    {f.name?.charAt(0)}
                  </div>

                  <Badge
                    variant={
                      f.isActive
                        ? "success"
                        : "warning"
                    }
                  >
                    {f.isActive
                      ? "فعال"
                      : "غیرفعال"}
                  </Badge>
                </div>

                <h3 className="font-semibold text-foreground">
                  {f.name}
                </h3>

                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {f.description ||
                    "بدون توضیحات"}
                </p>

                <div className="flex items-center justify-between mt-4">
                  <span className="text-xs text-muted-foreground">
                    {f._count?.discountCodes || 0} کد
                    تخفیف
                  </span>

                  {f.websiteUrl && (
                    <a
                      href={f.websiteUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs text-primary hover:underline flex items-center gap-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      وبسایت
                    </a>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modal}
        onClose={() => {
          setModal(false);
          reset();
        }}
        title="افزودن پراپ فرم"
      >
        <form
          onSubmit={handleSubmit((data) =>
            mutation.mutate(data)
          )}
          className="space-y-4"
        >
          <Input
            label="نام پراپ فرم"
            placeholder="FTMO"
            error={errors.name?.message}
            {...register("name")}
          />

          <Input
            label="Slug"
            placeholder="ftmo"
            error={errors.slug?.message}
            {...register("slug")}
          />

          <Input
            label="توضیحات"
            placeholder="توضیح کوتاه"
            error={errors.description?.message}
            {...register("description")}
          />

          <Input
            label="وبسایت"
            placeholder="https://example.com"
            error={errors.websiteUrl?.message}
            {...register("websiteUrl")}
          />

          <Input
            label="لینک لوگو"
            placeholder="https://example.com/logo.png"
            error={errors.logoUrl?.message}
            {...register("logoUrl")}
          />

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              loading={mutation.isPending}
              className="flex-1"
            >
              ذخیره
            </Button>

            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => {
                setModal(false);
                reset();
              }}
            >
              انصراف
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}