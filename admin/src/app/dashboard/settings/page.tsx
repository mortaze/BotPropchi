"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Menu, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button, Card, CardContent, CardHeader, Toggle } from "@/components/ui";
import { getApiError, settingsApi } from "@/services/api";

export default function SettingsPage() {
  const qc = useQueryClient();
  const features = useQuery({ queryKey: ["features"], queryFn: settingsApi.getFeatures });
  const menuDisplayMode = useQuery({ queryKey: ["menu-display-mode"], queryFn: settingsApi.getMenuDisplayMode });
  const toggle = useMutation({ mutationFn: ({ key, isEnabled }: { key: string; isEnabled: boolean }) => settingsApi.updateFeature(key, isEnabled), onSuccess: () => { toast.success("وضعیت سرویس ذخیره شد"); qc.invalidateQueries({ queryKey: ["features"] }); }, onError: (e) => toast.error(getApiError(e)) });
  const saveMenuDisplayMode = useMutation({ mutationFn: settingsApi.setMenuDisplayMode, onSuccess: () => { toast.success("وضعیت نمایش منو ذخیره شد"); qc.invalidateQueries({ queryKey: ["menu-display-mode"] }); }, onError: (e) => toast.error(getApiError(e)) });

  const currentMode = menuDisplayMode.data?.mode || 'always_open';

  return <div className="space-y-6">
    <div className="page-header"><div><h1 className="section-title flex items-center gap-2"><Settings className="h-6 w-6" />⚙️ تنظیمات</h1><p className="text-sm text-muted-foreground">تنظیمات و سرویس‌های فعال ربات و پنل.</p></div></div>
    <Card><CardHeader><h2 className="flex items-center gap-2 font-semibold"><Menu className="h-5 w-5" />حالت نمایش منوی ربات</h2></CardHeader><CardContent><div className="space-y-4"><p className="text-sm text-muted-foreground">تعیین کنید منوی اصلی ربات همیشه نمایش داده شود یا کاربران بتوانند آن را ببندند.</p><div className="flex gap-4"><Button variant={currentMode === 'always_open' ? 'primary' : 'outline'} onClick={() => saveMenuDisplayMode.mutate('always_open')} disabled={saveMenuDisplayMode.isPending}>همیشه باز</Button><Button variant={currentMode === 'toggle_allowed' ? 'primary' : 'outline'} onClick={() => saveMenuDisplayMode.mutate('toggle_allowed')} disabled={saveMenuDisplayMode.isPending}>قابلیت بستن منو</Button></div><div className="rounded-xl border border-border bg-background/60 p-4"><p className="text-sm font-medium">{currentMode === 'always_open' ? '✅ همیشه باز' : '✅ قابلیت بستن منو'}</p><p className="mt-1 text-xs text-muted-foreground">{currentMode === 'always_open' ? 'منوی اصلی ربات همیشه برای کاربران نمایش داده می‌شود.' : 'کاربران می‌توانند با دکمه "بستن منو" منوی اصلی را ببندند و با /start دوباره نمایش دهند.'}</p></div></div></CardContent></Card>
    <Card><CardHeader><h2 className="font-semibold">مدیریت سرویس‌ها</h2></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{features.data?.items.map((feature) => <div key={feature.key} className="flex items-center justify-between rounded-xl border border-border bg-background/60 p-4"><div><p className="font-medium">{feature.isEnabled ? "✅" : "⛔"} {feature.label}</p><p className="text-xs text-muted-foreground" dir="ltr">{feature.key}</p></div><Toggle checked={feature.isEnabled} onChange={(v) => toggle.mutate({ key: feature.key, isEnabled: v })} /></div>)}</div></CardContent></Card>
  </div>;
}
