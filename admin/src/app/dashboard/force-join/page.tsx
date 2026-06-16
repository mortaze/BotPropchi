"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Eye, RotateCcw, Save, Settings } from "lucide-react";
import { Button, Card, CardContent, CardHeader, Input, Textarea, Skeleton, Modal } from "@/components/ui";
import { getApiError, forceJoinApi } from "@/services/api";
import type { ForceJoinSettings } from "@/types";

type FormKey = keyof Omit<ForceJoinSettings, "id" | "createdAt" | "updatedAt">;

const LABELS: Record<FormKey, string> = {
  title: "عنوان",
  welcomeMessage: "متن خوش‌آمد",
  notJoinedMessage: "پیام عدم عضویت",
  joinButtonText: "متن دکمه عضویت",
  checkMembershipButtonText: "متن دکمه بررسی عضویت",
  successJoinMessage: "پیام موفقیت",
  errorMessage: "پیام خطا",
  retryMessage: "پیام تلاش مجدد",
  emptyChannelsMessage: "پیام نبود کانال",
};

const TEXTAREAS: FormKey[] = ["welcomeMessage", "notJoinedMessage", "successJoinMessage", "errorMessage", "retryMessage", "emptyChannelsMessage"];

function SettingSkeleton() {
  return (
    <Card>
      <CardHeader><Skeleton className="h-6 w-40" /></CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-1.5">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function ForceJoinSettingsPage() {
  const query = useQuery({
    queryKey: ["force-join-settings"],
    queryFn: () => forceJoinApi.getSettings(),
  });

  const [form, setForm] = useState<Partial<ForceJoinSettings>>({});
  const [previewOpen, setPreviewOpen] = useState(false);
  const [dirty, setDirty] = useState(false);

  const settings = query.data?.data;
  const current = { ...settings, ...form } as ForceJoinSettings;

  const update = useMutation({
    mutationFn: forceJoinApi.updateSettings,
    onSuccess: () => {
      toast.success("تنظیمات با موفقیت ذخیره شد");
      setDirty(false);
      query.refetch();
    },
    onError: (error) => toast.error(getApiError(error)),
  });

  const resetMutation = useMutation({
    mutationFn: forceJoinApi.resetToDefaults,
    onSuccess: (res) => {
      toast.success("تنظیمات به حالت پیش‌فرض بازگشت");
      setForm(res.data);
      setDirty(false);
      query.refetch();
    },
    onError: (error) => toast.error(getApiError(error)),
  });

  const setField = (key: FormKey, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };

  const handleSave = () => {
    const payload: Record<string, string> = {};
    for (const key of Object.keys(form) as FormKey[]) {
      const val = form[key];
      if (val !== undefined && val !== settings?.[key]) {
        payload[key] = val;
      }
    }
    if (Object.keys(payload).length === 0) {
      toast.info("تغییری برای ذخیره وجود ندارد");
      return;
    }
    update.mutate(payload as Partial<ForceJoinSettings>);
  };

  const handleReset = () => {
    if (confirm("آیا از بازگشت به تنظیمات پیش‌فرض اطمینان دارید؟")) {
      resetMutation.mutate();
    }
  };

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header">
          <div>
            <h1 className="section-title flex items-center gap-2">
              <Settings className="h-6 w-6" /> تنظیمات عضویت اجباری
            </h1>
            <p className="text-sm text-muted-foreground">مدیریت متن‌های نمایش داده شده به کاربران در فرآیند عضویت اجباری</p>
          </div>
        </div>
        <SettingSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Settings className="h-6 w-6" /> تنظیمات عضویت اجباری
          </h1>
          <p className="text-sm text-muted-foreground">مدیریت متن‌های نمایش داده شده به کاربران در فرآیند عضویت اجباری</p>
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <span className="flex items-center gap-1.5 rounded-full bg-yellow-500/10 px-3 py-1 text-xs font-medium text-yellow-600">
              <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
              تغییرات ذخیره نشده
            </span>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">ویرایش متن‌ها</h2>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPreviewOpen(true)} loading={false}>
                <Eye className="h-4 w-4" /> پیش‌نمایش
              </Button>
              <Button variant="outline" size="sm" onClick={handleReset} loading={resetMutation.isPending}>
                <RotateCcw className="h-4 w-4" /> بازگردانی
              </Button>
              <Button size="sm" onClick={handleSave} loading={update.isPending}>
                <Save className="h-4 w-4" /> ذخیره
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <Input
              label={LABELS.title}
              value={current.title ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField("title", e.target.value)}
            />
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            {TEXTAREAS.map((key) => (
              <Textarea
                key={key}
                label={LABELS[key]}
                value={(current[key as FormKey] as string) ?? ""}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setField(key, e.target.value)}
                className="min-h-24 leading-7"
                dir="auto"
              />
            ))}
          </div>

          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Input
              label={LABELS.joinButtonText}
              value={current.joinButtonText ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField("joinButtonText", e.target.value)}
            />
            <Input
              label={LABELS.checkMembershipButtonText}
              value={current.checkMembershipButtonText ?? ""}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setField("checkMembershipButtonText", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-semibold">راهنما</h2></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground leading-7">
          <p>🔹 این تنظیمات مستقیماً روی پیام‌های نمایش داده شده به کاربران در فرآیند عضویت اجباری تأثیر می‌گذارد.</p>
          <p>🔹 پس از ذخیره تغییرات، تنظیمات بلافاصله در ربات اعمال می‌شوند (حداکثر با ۳۰ ثانیه تأخیر کش).</p>
          <p>🔹 برای بازگشت به متن‌های پیش‌فرض کارخانه، از دکمه بازگردانی استفاده کنید.</p>
          <p>🔹 متن‌ها می‌توانند به زبان فارسی یا انگلیسی باشند.</p>
        </CardContent>
      </Card>

      <Modal open={previewOpen} onClose={() => setPreviewOpen(false)} title="پیش‌نمایش پیام‌ها" size="lg">
        <div className="space-y-6">
          {(["welcomeMessage", "notJoinedMessage", "successJoinMessage", "errorMessage", "retryMessage", "emptyChannelsMessage"] as FormKey[]).map((key) => (
            <div key={key} className="rounded-xl border border-border bg-background/60 p-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">{LABELS[key]}</p>
              <div className="rounded-lg bg-card p-3 text-sm leading-7 shadow-sm border border-border/50">
                {current[key as FormKey] || "—"}
              </div>
            </div>
          ))}
          <div className="rounded-xl border border-border bg-background/60 p-4">
            <p className="mb-2 text-xs font-medium text-muted-foreground">دکمه‌ها</p>
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                {current.joinButtonText || "عضویت"}
              </span>
              <span className="inline-flex items-center rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground">
                {current.checkMembershipButtonText || "بررسی عضویت"}
              </span>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
