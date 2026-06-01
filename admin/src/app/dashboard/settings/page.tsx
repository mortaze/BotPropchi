"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Settings } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, Toggle } from "@/components/ui";
import { getApiError, settingsApi } from "@/services/api";
import type { MenuOrderItem } from "@/types";

export default function SettingsPage() {
  const qc = useQueryClient();
  const menus = useQuery({ queryKey: ["settings-menus"], queryFn: settingsApi.getMenus });
  const features = useQuery({ queryKey: ["features"], queryFn: settingsApi.getFeatures });
  const reorder = useMutation({ mutationFn: settingsApi.reorderMenus, onSuccess: () => { toast.success("ترتیب منو ذخیره شد"); qc.invalidateQueries({ queryKey: ["settings-menus"] }); qc.invalidateQueries({ queryKey: ["menu-orders"] }); }, onError: (e) => toast.error(getApiError(e)) });
  const toggle = useMutation({ mutationFn: ({ key, isEnabled }: { key: string; isEnabled: boolean }) => settingsApi.updateFeature(key, isEnabled), onSuccess: () => { toast.success("وضعیت سرویس ذخیره شد"); qc.invalidateQueries({ queryKey: ["features"] }); qc.invalidateQueries({ queryKey: ["menu-orders"] }); }, onError: (e) => toast.error(getApiError(e)) });

  const move = (items: MenuOrderItem[], index: number, dir: -1 | 1) => {
    const next = [...items];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorder.mutate(next.map((item) => item.key));
  };

  return <div className="space-y-6">
    <div className="page-header"><div><h1 className="section-title flex items-center gap-2"><Settings className="h-6 w-6" />⚙️ تنظیمات</h1><p className="text-sm text-muted-foreground">تنظیمات مالک، ترتیب منوها و سرویس‌های فعال ربات و پنل.</p></div></div>
    <Card><CardHeader><h2 className="font-semibold">مدیریت ترتیب منو</h2></CardHeader><CardContent><div className="space-y-3">{menus.data?.items.map((item, index, arr) => <div key={item.key} className="flex flex-col gap-3 rounded-xl border border-border bg-background/60 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{item.label}</p><p className="text-xs text-muted-foreground" dir="ltr">{item.href}</p></div><div className="flex items-center gap-2"><Badge variant={item.ownerOnly ? "warning" : "outline"}>{item.ownerOnly ? "Owner" : "All"}</Badge><Button size="sm" variant="outline" disabled={index === 0 || reorder.isPending} onClick={() => move(arr, index, -1)}><ArrowUp className="h-4 w-4" />بالا</Button><Button size="sm" variant="outline" disabled={index === arr.length - 1 || reorder.isPending} onClick={() => move(arr, index, 1)}><ArrowDown className="h-4 w-4" />پایین</Button></div></div>)}</div></CardContent></Card>
    <Card><CardHeader><h2 className="font-semibold">مدیریت سرویس‌ها</h2></CardHeader><CardContent><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{features.data?.items.map((feature) => <div key={feature.key} className="flex items-center justify-between rounded-xl border border-border bg-background/60 p-4"><div><p className="font-medium">{feature.isEnabled ? "✅" : "⛔"} {feature.label}</p><p className="text-xs text-muted-foreground" dir="ltr">{feature.key}</p></div><Toggle checked={feature.isEnabled} onChange={(v) => toggle.mutate({ key: feature.key, isEnabled: v })} /></div>)}</div></CardContent></Card>
  </div>;
}
