
// src/app/dashboard/discounts/create/page.tsx
"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { discountsApi } from "@/services/api";

import {
  Card,
  CardHeader,
  CardContent,
  Button,
} from "@/components/ui";

import DiscountForm from "@/components/forms/DiscountForm";

import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

export default function CreateDiscountPage() {
  const router = useRouter();

  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return await discountsApi.create(data);
    },

    onSuccess: () => {
      toast.success("کد تخفیف با موفقیت ایجاد شد ✅");

      queryClient.invalidateQueries({
        queryKey: ["discounts"],
      });

      router.push("/dashboard/discounts");
    },

    onError: (error: any) => {
      console.error("CREATE DISCOUNT ERROR:", error);

      let message = "خطا در ایجاد کد تخفیف";

      // backend validation
      if (error?.response?.data?.error) {
        const backendError = error.response.data.error;

        if (typeof backendError === "string") {
          message = backendError;
        }

        // zod field errors
        else if (
          typeof backendError === "object" &&
          backendError?.fieldErrors
        ) {
          const firstError = Object.values(
            backendError.fieldErrors
          )[0];

          if (Array.isArray(firstError)) {
            message = firstError[0];
          }
        }
      }

      toast.error(message);
    },
  });

  return (
    <div className="max-w-3xl space-y-6">
      {/* header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            ایجاد کد تخفیف
          </h1>

          <p className="text-sm text-muted-foreground mt-1">
            ایجاد و مدیریت کد تخفیف جدید
          </p>
        </div>

        <Button
          variant="outline"
          onClick={() => router.back()}
          className="gap-2"
        >
          <ArrowRight className="w-4 h-4" />
          بازگشت
        </Button>
      </div>

      {/* form */}
      <Card>
        <CardHeader>
          <div>
            <h2 className="text-lg font-semibold">
              اطلاعات کد تخفیف
            </h2>

            <p className="text-sm text-muted-foreground mt-1">
              اطلاعات مورد نیاز را تکمیل کنید
            </p>
          </div>
        </CardHeader>

        <CardContent>
          <DiscountForm
            loading={createMutation.isPending}
            onSubmit={(data) => {
              createMutation.mutate(data);
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}

