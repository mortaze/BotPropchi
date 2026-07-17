"use client";

import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button, Card, CardContent, CardHeader, Input } from "@/components/ui";
import { getApiError, scoringApi } from "@/services/api";

const schema = z.object({
  startPoints: z.coerce.number().int().min(0),
  channelJoinPoints: z.coerce.number().int().min(0),
  futureActivityPoints: z.coerce.number().int().min(0),
  dailyActivityPoints: z.coerce.number().int().min(0),
  linkClickPoints: z.coerce.number().int().min(0),
  referralRewardPoints: z.coerce.number().int().min(0),
  profileCompletionPoints: z.coerce.number().int().min(0),
  welcomeMessageText: z.string().min(1),
  initialPointsMessageText: z.string().min(1),
  isWelcomeMessageEnabled: z.boolean(),
});

type Values = z.infer<typeof schema>;

export default function ScoringPage() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["scoring-settings"], queryFn: scoringApi.getSettings });
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      startPoints: 0,
      channelJoinPoints: 0,
      futureActivityPoints: 0,
      dailyActivityPoints: 5,
      linkClickPoints: 2,
      referralRewardPoints: 20,
      profileCompletionPoints: 50,
      welcomeMessageText: "",
      initialPointsMessageText: "",
      isWelcomeMessageEnabled: true,
    },
  });

  useEffect(() => {
    if (query.data?.item) reset(query.data.item);
  }, [query.data?.item, reset]);

  const mutation = useMutation({
    mutationFn: (values: Values) => scoringApi.updateSettings(values),
    onSuccess: () => {
      toast.success("تنظیمات امتیازدهی ذخیره شد");
      qc.invalidateQueries({ queryKey: ["scoring-settings"] });
    },
    onError: (error) => toast.error(getApiError(error)),
  });

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="section-title flex items-center gap-2"><Star className="h-6 w-6" /> سیستم امتیازدهی</h1>
          <p className="text-sm text-muted-foreground">مدیریت مرکزی همه امتیازهای ربات و پیام‌های اولین ورود.</p>
        </div>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit((values) => mutation.mutate(values))}>
        <Card>
          <CardHeader><h2 className="font-semibold">امتیازها</h2></CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <Input type="number" label="امتیاز استارت ربات" error={errors.startPoints?.message} {...register("startPoints")} />
            <Input type="number" label="امتیاز عضویت در کانال" error={errors.channelJoinPoints?.message} {...register("channelJoinPoints")} />
            <Input type="number" label="امتیاز فعالیت‌های آینده" error={errors.futureActivityPoints?.message} {...register("futureActivityPoints")} />
            <Input type="number" label="امتیاز فعالیت روزانه" error={errors.dailyActivityPoints?.message} {...register("dailyActivityPoints")} />
            <Input type="number" label="امتیاز کلیک لینک خرید" error={errors.linkClickPoints?.message} {...register("linkClickPoints")} />
            <Input type="number" label="امتیاز دعوت موفق" error={errors.referralRewardPoints?.message} {...register("referralRewardPoints")} />
            <Input type="number" label="امتیاز تکمیل پروفایل" error={errors.profileCompletionPoints?.message} {...register("profileCompletionPoints")} />
          </CardContent>
        </Card>

        <div className="sticky bottom-4 z-10 flex justify-end">
          <Button type="submit" loading={isSubmitting || mutation.isPending}>ذخیره تنظیمات</Button>
        </div>
      </form>
    </div>
  );
}
