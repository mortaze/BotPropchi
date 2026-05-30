
// src/app/dashboard/lotteries/page.tsx
"use client";

import { useState } from "react";

import {
  useQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { lotteriesApi } from "@/services/api";

import { Lottery } from "@/types";

import {
  Card,
  CardContent,
  Badge,
  Button,
  Modal,
  Input,
  EmptyState,
  Skeleton,
} from "@/components/ui";

import { formatDate } from "@/lib/utils";

import {
  Plus,
  Trophy,
  Play,
} from "lucide-react";

import { toast } from "sonner";

import {
  useForm,
} from "react-hook-form";

import { z } from "zod";

import {
  zodResolver,
} from "@hookform/resolvers/zod";

// ─────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────

const schema = z.object({
  title: z
    .string()
    .min(2, "عنوان حداقل ۲ کاراکتر باشد"),

  prize: z
    .string()
    .min(2, "جایزه الزامی است"),

  description: z
    .string()
    .optional(),

  startAt: z
    .string()
    .min(1, "تاریخ شروع الزامی است"),

  endAt: z
    .string()
    .min(1, "تاریخ پایان الزامی است"),

  winnersCount: z.coerce
    .number()
    .min(1, "حداقل ۱ برنده")
    .default(1),

  minPoints: z.coerce
    .number()
    .min(0)
    .default(0),
});

type FormData = z.infer<typeof schema>;

export default function LotteriesPage() {
  const [modal, setModal] = useState(false);

  const [drawingId, setDrawingId] =
    useState<number | null>(null);

  const queryClient = useQueryClient();

  // ─────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────

  const {
  data: lotteries = [],
  isLoading,
  refetch,
} = useQuery<Lottery[]>({
  queryKey: ["lotteries"],
  queryFn: async () => {
    const data = await lotteriesApi.getAll();

    console.log("📦 FINAL LOTTERIES:", data);

    return data || [];
  },
});

  // ─────────────────────────────────────────────
  // Form
  // ─────────────────────────────────────────────

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(schema),

    defaultValues: {
      winnersCount: 1,
      minPoints: 0,
    },
  });

  // ─────────────────────────────────────────────
  // Create Lottery
  // ─────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: lotteriesApi.create,

    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["lotteries"],
      });

      toast.success(
        "قرعه‌کشی با موفقیت ایجاد شد ✅"
      );

      setModal(false);

      reset();
    },

    onError: (error: any) => {
      console.error(
        "CREATE LOTTERY ERROR:",
        error
      );

      let message =
        "خطا در ایجاد قرعه‌کشی";

      // backend string error
      if (
        typeof error?.response?.data?.error ===
        "string"
      ) {
        message =
          error.response.data.error;
      }

      // zod validation error
      else if (
        typeof error?.response?.data?.error ===
          "object" &&
        error?.response?.data?.error
          ?.fieldErrors
      ) {
        const fieldErrors =
          error.response.data.error.fieldErrors;

        const firstField =
          Object.keys(fieldErrors)[0];

        if (
          firstField &&
          Array.isArray(
            fieldErrors[firstField]
          )
        ) {
          message =
            fieldErrors[firstField][0];
        }
      }

      toast.error(message);
    },
  });

  // ─────────────────────────────────────────────
  // Draw Lottery
  // ─────────────────────────────────────────────

  const drawMutation = useMutation({
    mutationFn: lotteriesApi.draw,

    onSuccess: (data: any) => {
      queryClient.invalidateQueries({
        queryKey: ["lotteries"],
      });

      const names =
        data?.winners
          ?.map((w: any) => w.name)
          ?.join("، ");

      toast.success(
        names
          ? `برندگان: ${names}`
          : "قرعه‌کشی انجام شد ✅"
      );

      setDrawingId(null);
    },

    onError: (error: any) => {
      console.error(
        "DRAW LOTTERY ERROR:",
        error
      );

      let message =
        "خطا در برگزاری قرعه‌کشی";

      if (
        typeof error?.response?.data?.error ===
        "string"
      ) {
        message =
          error.response.data.error;
      }

      toast.error(message);

      setDrawingId(null);
    },
  });

  // ─────────────────────────────────────────────
  // Submit
  // ─────────────────────────────────────────────

  const onSubmit = (data: FormData) => {
    createMutation.mutate({
      ...data,

      startAt: new Date(
        data.startAt
      ).toISOString(),

      endAt: new Date(
        data.endAt
      ).toISOString(),
    });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="section-title">
            قرعه‌کشی‌ها
          </h2>

          <p className="text-sm text-muted-foreground mt-0.5">
            {lotteries?.length || 0} قرعه‌کشی
          </p>
        </div>

        <Button
          size="sm"
          onClick={() => setModal(true)}
        >
          <Plus className="w-4 h-4 ml-1" />
          قرعه‌کشی جدید
        </Button>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="grid gap-4">
          {Array.from({
            length: 3,
          }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-40 rounded-xl"
            />
          ))}
        </div>
      ) : !lotteries?.length ? (
        <Card>
          <CardContent>
            <EmptyState title="قرعه‌کشی‌ای یافت نشد" />
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lotteries.map((l) => (
            <Card key={l.id}>
              <CardContent className="p-5">
                {/* top */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-10 h-10 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center">
                      <Trophy className="w-5 h-5 text-yellow-500" />
                    </div>

                    <div>
                      <h3 className="font-semibold text-foreground">
                        {l.title}
                      </h3>

                      <p className="text-xs text-muted-foreground mt-0.5">
                        🎁 {l.prize}
                      </p>
                    </div>
                  </div>

                  <Badge
                    variant={
                      l.isCompleted
                        ? "outline"
                        : l.isActive
                        ? "success"
                        : "warning"
                    }
                  >
                    {l.isCompleted
                      ? "پایان‌یافته"
                      : l.isActive
                      ? "فعال"
                      : "غیرفعال"}
                  </Badge>
                </div>

                {/* stats */}
                <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">
                      شرکت‌کنندگان
                    </p>

                    <p className="font-semibold text-foreground text-sm mt-0.5">
                      {l._count?.entries || 0}
                    </p>
                  </div>

                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">
                      برندگان
                    </p>

                    <p className="font-semibold text-foreground text-sm mt-0.5">
                      {l.winnersCount}
                    </p>
                  </div>

                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-xs text-muted-foreground">
                      حداقل امتیاز
                    </p>

                    <p className="font-semibold text-foreground text-sm mt-0.5">
                      {l.minPoints}
                    </p>
                  </div>
                </div>

                {/* footer */}
                <div className="flex items-center justify-between mt-4">
                  <p className="text-xs text-muted-foreground">
                    {formatDate(l.startAt)} —{" "}
                    {formatDate(l.endAt)}
                  </p>

                  {!l.isCompleted && (
                    <Button
                      size="sm"
                      variant="secondary"
                      loading={
                        drawMutation.isPending &&
                        drawingId === l.id
                      }
                      onClick={() => {
                        const confirmDraw =
                          confirm(
                            "قرعه‌کشی انجام شود؟"
                          );

                        if (!confirmDraw)
                          return;

                        setDrawingId(l.id);

                        drawMutation.mutate(
                          l.id
                        );
                      }}
                    >
                      <Play className="w-3.5 h-3.5 ml-1" />
                      برگزاری
                    </Button>
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
        title="ایجاد قرعه‌کشی جدید"
      >
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="space-y-4"
        >
          <Input
            label="عنوان"
            placeholder="قرعه‌کشی تابستان"
            {...register("title")}
            error={errors.title?.message}
          />

          <Input
            label="جایزه"
            placeholder="اکانت 50K"
            {...register("prize")}
            error={errors.prize?.message}
          />

          <Input
            label="توضیحات"
            placeholder="توضیحات اختیاری"
            {...register("description")}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              type="datetime-local"
              label="تاریخ شروع"
              {...register("startAt")}
              error={errors.startAt?.message}
            />

            <Input
              type="datetime-local"
              label="تاریخ پایان"
              {...register("endAt")}
              error={errors.endAt?.message}
            />

            <Input
              type="number"
              label="تعداد برندگان"
              {...register("winnersCount")}
              error={
                errors.winnersCount?.message
              }
            />

            <Input
              type="number"
              label="حداقل امتیاز"
              {...register("minPoints")}
              error={
                errors.minPoints?.message
              }
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="submit"
              loading={
                createMutation.isPending
              }
              className="flex-1"
            >
              ایجاد قرعه‌کشی
            </Button>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setModal(false);
                reset();
              }}
              className="flex-1"
            >
              انصراف
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

