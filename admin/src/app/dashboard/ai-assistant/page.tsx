"use client";

import { FormEvent, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, KeyRound, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, Input, Textarea, Toggle } from "@/components/ui";
import { aiApi, getApiError } from "@/services/api";
import type { AiApiKeyItem } from "@/types";

export default function AiAssistantPage() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["ai-settings"], queryFn: aiApi.getSettings });
  const keys = useQuery({ queryKey: ["ai-keys"], queryFn: aiApi.getKeys });
  const [systemPrompt, setSystemPrompt] = useState("");
  const [allowedSourceUrls, setAllowedSourceUrls] = useState("");
  const [fallbackMessage, setFallbackMessage] = useState("");
  const [topicFallbackMessage, setTopicFallbackMessage] = useState("");
  const [sourceFallbackMessage, setSourceFallbackMessage] = useState("");
  const [model, setModel] = useState("gemini-2.5-flash");
  const [rateLimitPerHour, setRateLimitPerHour] = useState(20);
  const [keyName, setKeyName] = useState("");
  const [apiKey, setApiKey] = useState("");

  useEffect(() => {
    const item = settings.data?.settings;
    if (!item) return;
    setSystemPrompt(item.systemPrompt || "");
    setAllowedSourceUrls((item.allowedSourceUrls || []).join("\n"));
    setFallbackMessage(item.fallbackMessage || "");
    setTopicFallbackMessage(item.topicFallbackMessage || "");
    setSourceFallbackMessage(item.sourceFallbackMessage || "");
    setModel(item.model || "gemini-2.5-flash");
    setRateLimitPerHour(item.rateLimitPerHour || 20);
  }, [settings.data?.settings]);

  const saveSettings = useMutation({ mutationFn: aiApi.updateSettings, onSuccess: () => { toast.success("تنظیمات هوش مصنوعی ذخیره شد"); qc.invalidateQueries({ queryKey: ["ai-settings"] }); }, onError: (e) => toast.error(getApiError(e)) });
  const createKey = useMutation({ mutationFn: aiApi.createKey, onSuccess: () => { toast.success("API Key اضافه شد"); setKeyName(""); setApiKey(""); qc.invalidateQueries({ queryKey: ["ai-keys"] }); }, onError: (e) => toast.error(getApiError(e)) });
  const updateKey = useMutation({ mutationFn: ({ id, payload }: { id: number; payload: { name?: string | null; apiKey?: string; isActive?: boolean } }) => aiApi.updateKey(id, payload), onSuccess: () => { toast.success("API Key به‌روزرسانی شد"); qc.invalidateQueries({ queryKey: ["ai-keys"] }); }, onError: (e) => toast.error(getApiError(e)) });
  const deleteKey = useMutation({ mutationFn: aiApi.deleteKey, onSuccess: () => { toast.success("API Key حذف شد"); qc.invalidateQueries({ queryKey: ["ai-keys"] }); }, onError: (e) => toast.error(getApiError(e)) });

  const submitSettings = (event: FormEvent) => {
    event.preventDefault();
    saveSettings.mutate({
      systemPrompt: systemPrompt.trim(),
      allowedSourceUrls: allowedSourceUrls.split(/\n+/).map((url) => url.trim()).filter(Boolean),
      fallbackMessage: fallbackMessage.trim(),
      topicFallbackMessage: topicFallbackMessage.trim(),
      sourceFallbackMessage: sourceFallbackMessage.trim(),
      model: model.trim(),
      rateLimitPerHour,
    });
  };

  const submitKey = (event: FormEvent) => {
    event.preventDefault();
    createKey.mutate({ name: keyName.trim() || null, apiKey: apiKey.trim(), isActive: true });
  };

  return <div className="space-y-6">
    <div className="page-header"><div><h1 className="section-title flex items-center gap-2"><Bot className="h-6 w-6" />🤖 هوش مصنوعی پراپ هاب</h1><p className="text-sm text-muted-foreground">مدیریت Prompt، منابع مجاز، پیام‌های fallback و کلیدهای Google Gemini.</p></div></div>

    <Card><CardHeader><h2 className="font-semibold">Admin Panel → Settings → AI Assistant</h2></CardHeader><CardContent><form onSubmit={submitSettings} className="grid gap-4 md:grid-cols-2">
      <Textarea label="System Prompt" className="min-h-40 leading-7 md:col-span-2" value={systemPrompt} onChange={(e: any) => setSystemPrompt(e.target.value)} placeholder="تو یک دستیار تخصصی در حوزه پراپ فرم هستی..." />
      <Textarea label="Allowed Source URLs" dir="ltr" className="min-h-32 text-left md:col-span-2" value={allowedSourceUrls} onChange={(e: any) => setAllowedSourceUrls(e.target.value)} placeholder={"https://prophub.ir\nhttps://trusted-prop.com"} />
      <Input label="Gemini Model" dir="ltr" value={model} onChange={(e: any) => setModel(e.target.value)} />
      <Input label="Rate Limit Per Hour" type="number" min={1} max={200} value={rateLimitPerHour} onChange={(e: any) => setRateLimitPerHour(Number(e.target.value))} />
      <Input label="Fallback Message" value={fallbackMessage} onChange={(e: any) => setFallbackMessage(e.target.value)} />
      <Input label="Topic Restriction Message" value={topicFallbackMessage} onChange={(e: any) => setTopicFallbackMessage(e.target.value)} />
      <Input label="Source Fallback Message" className="md:col-span-2" value={sourceFallbackMessage} onChange={(e: any) => setSourceFallbackMessage(e.target.value)} />
      <div className="md:col-span-2"><Button disabled={saveSettings.isPending}>{saveSettings.isPending ? "در حال ذخیره..." : "ذخیره تنظیمات AI"}</Button></div>
    </form></CardContent></Card>

    <Card><CardHeader><h2 className="flex items-center gap-2 font-semibold"><KeyRound className="h-5 w-5" />Admin Panel → Settings → AI Keys</h2></CardHeader><CardContent className="space-y-5">
      <form onSubmit={submitKey} className="grid gap-3 md:grid-cols-[1fr_2fr_auto]"><Input label="Name" value={keyName} onChange={(e: any) => setKeyName(e.target.value)} placeholder="Main Gemini Key" /><Input label="Google Gemini API Key" dir="ltr" className="text-left" value={apiKey} onChange={(e: any) => setApiKey(e.target.value)} placeholder="AIza..." /><div className="flex items-end"><Button disabled={createKey.isPending}>افزودن کلید</Button></div></form>
      <div className="space-y-3">{keys.data?.items.map((item) => <KeyRow key={item.id} item={item} onToggle={(isActive) => updateKey.mutate({ id: item.id, payload: { isActive } })} onRename={(name) => updateKey.mutate({ id: item.id, payload: { name } })} onDelete={() => deleteKey.mutate(item.id)} />)}{keys.data?.items.length === 0 && <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">هنوز Gemini API Key ثبت نشده است.</p>}</div>
      <p className="text-xs text-muted-foreground">Load balancing به صورت Round Robin با انتخاب کلیدی انجام می‌شود که زودتر استفاده شده یا هنوز استفاده نشده است.</p>
    </CardContent></Card>
  </div>;
}

function KeyRow({ item, onToggle, onRename, onDelete }: { item: AiApiKeyItem; onToggle: (v: boolean) => void; onRename: (name: string | null) => void; onDelete: () => void }) {
  const [name, setName] = useState(item.name || "");
  return <div className="grid gap-3 rounded-xl border border-border bg-background/60 p-4 md:grid-cols-[1fr_auto_auto] md:items-center">
    <div className="space-y-2"><div className="flex flex-wrap items-center gap-2"><Badge variant={item.isActive ? "success" : "warning"}>{item.isActive ? "Active" : "Disabled"}</Badge><span className="font-mono text-sm" dir="ltr">{item.keyPreview}</span><span className="text-xs text-muted-foreground">Last used: {item.lastUsedAt ? new Date(item.lastUsedAt).toLocaleString("fa-IR") : "Never"}</span></div><Input value={name} onChange={(e: any) => setName(e.target.value)} onBlur={() => onRename(name.trim() || null)} placeholder="نام کلید" /></div>
    <Toggle checked={item.isActive} onChange={onToggle} />
    <Button type="button" variant="danger" size="sm" onClick={onDelete}><Trash2 className="h-4 w-4" />حذف</Button>
  </div>;
}
