"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Save, Server, Loader2, Key, Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardContent, Input, Button, Badge } from "@/components/ui";
import { aiSettingsApi, getApiError } from "@/services/api";

export default function AiSettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  
  const { data: settings, isLoading } = useQuery({
    queryKey: ["ai-settings"],
    queryFn: aiSettingsApi.get,
  });

  const { data: models, isLoading: isModelsLoading, refetch: refetchModels } = useQuery({
    queryKey: ["openrouter-models"],
    queryFn: aiSettingsApi.getModels,
    enabled: false, // Only fetch on button click
  });

  const update = useMutation({
    mutationFn: aiSettingsApi.update,
    onSuccess: () => {
      toast.success("تنظیمات با موفقیت ذخیره شد");
      qc.invalidateQueries({ queryKey: ["ai-settings"] });
    },
    onError: (e) => toast.error(getApiError(e)),
  });

  // Init form from loaded settings
  if (settings && Object.keys(form).length === 0) {
    setForm(settings);
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSave = () => {
    update.mutate(form);
  };

  const loadModels = async () => {
    if (!settings?.openrouterApiKey && !form.openrouterApiKey) {
      toast.error("ابتدا کلید OpenRouter را وارد و ذخیره کنید");
      return;
    }
    toast.promise(refetchModels(), {
      loading: "در حال دریافت لیست مدل‌ها...",
      success: "لیست مدل‌ها به‌روز شد",
      error: (e) => getApiError(e),
    });
  };

  if (isLoading) {
    return <div className="flex h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="section-title flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            تنظیمات دستیار هوشمند
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            پیکربندی هوش مصنوعی، مدل‌ها و اتصال به منبع داده Google Sheets
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* OpenRouter Config */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold flex items-center gap-2">
              <Server className="h-5 w-5 text-blue-500" />
              تنظیمات OpenRouter
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">کلید API (API Key)</label>
              <Input
                name="openrouterApiKey"
                type="password"
                dir="ltr"
                placeholder="sk-or-..."
                value={form.openrouterApiKey || ""}
                onChange={handleChange}
              />
              <p className="text-xs text-muted-foreground">
                کلید API خود را از سایت openrouter.ai دریافت کنید.
              </p>
            </div>

            <Button onClick={handleSave} loading={update.isPending} className="w-full">
              <Save className="h-4 w-4 ml-2" />
              ذخیره تنظیمات
            </Button>
          </CardContent>
        </Card>

        {/* Google Sheets Config */}
        <Card>
          <CardHeader>
            <h2 className="font-semibold flex items-center gap-2">
              <Database className="h-5 w-5 text-green-500" />
              منبع داده (Google Sheets)
            </h2>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              label="آیدی شیت (Sheet ID)"
              name="googleSheetId"
              dir="ltr"
              placeholder="1A2B3C..."
              value={form.googleSheetId || ""}
              onChange={handleChange}
            />
            
            <Input
              label="ایمیل سرویس اکانت (Service Account Email)"
              name="googleServiceAccountEmail"
              dir="ltr"
              placeholder="example@project.iam.gserviceaccount.com"
              value={form.googleServiceAccountEmail || ""}
              onChange={handleChange}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium">کلید خصوصی یا محتوای فایل JSON</label>
              <textarea
                name="googlePrivateKey"
                dir="ltr"
                rows={5}
                className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                placeholder='{"type": "service_account", "private_key": "...", "client_email": "..."}'
                value={form.googlePrivateKey || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  try {
                    const parsed = JSON.parse(val);
                    if (parsed.client_email && parsed.private_key) {
                      setForm({
                        ...form,
                        googleServiceAccountEmail: parsed.client_email,
                        googlePrivateKey: parsed.private_key,
                      });
                      toast.success("اطلاعات فایل JSON با موفقیت استخراج شد");
                      return;
                    }
                  } catch (err) {
                    // Ignore parse errors, they might just be typing the key directly
                  }
                  handleChange(e as any);
                }}
              />
              <p className="text-xs text-muted-foreground">
                محتوای فایل JSON کلید خود را اینجا کپی کنید (ایمیل و کلید خصوصی به صورت خودکار استخراج می‌شوند) و یا فقط کلید خصوصی را وارد کنید.
              </p>
            </div>
            
            <Button onClick={handleSave} loading={update.isPending} className="w-full">
              <Save className="h-4 w-4 ml-2" />
              ذخیره تنظیمات منبع داده
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Model Selection */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between border-b pb-4 mb-4">
          <div>
            <h2 className="font-semibold flex items-center gap-2">
              <Bot className="h-5 w-5 text-purple-500" />
              انتخاب مدل هوش مصنوعی
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              مدلی که پاسخ‌های کاربران را تولید می‌کند.
            </p>
          </div>
          <Button variant="outline" onClick={loadModels} disabled={isModelsLoading}>
            <RefreshCw className={`h-4 w-4 ml-2 ${isModelsLoading ? "animate-spin" : ""}`} />
            دریافت لیست مدل‌ها
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6 p-4 bg-muted/50 rounded-lg border">
            <span className="text-sm font-medium">مدل فعال فعلی:</span>
            {form.selectedModel ? (
              <Badge variant="success" className="font-mono">{form.selectedModel}</Badge>
            ) : (
              <Badge variant="warning">انتخاب نشده</Badge>
            )}
          </div>

          {!models?.length && !isModelsLoading && (
            <div className="text-center p-8 border border-dashed rounded-xl">
              <Server className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                لیست مدل‌ها هنوز دریافت نشده است. لطفاً کلید OpenRouter را ذخیره کرده و روی دکمه دریافت لیست کلیک کنید.
              </p>
            </div>
          )}

          {models && models.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-[500px] overflow-y-auto p-1">
              {models.map((model) => {
                const isSelected = form.selectedModel === model.id;
                return (
                  <div 
                    key={model.id}
                    onClick={() => {
                      setForm({ ...form, selectedModel: model.id });
                    }}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      isSelected 
                        ? "border-primary bg-primary/5 ring-1 ring-primary/20" 
                        : "hover:border-primary/50 hover:bg-muted/30"
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-semibold text-sm line-clamp-1" title={model.name}>{model.name}</h3>
                      {isSelected && <Badge variant="success" className="text-[10px] px-1.5 h-5">فعال</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground font-mono" dir="ltr">{model.id}</p>
                    <div className="mt-3 flex gap-2 text-[10px] text-muted-foreground">
                      <span className="bg-muted px-2 py-1 rounded-md">
                        {Math.round(model.context_length / 1000)}k Context
                      </span>
                      {model.pricing && (
                        <span className="bg-muted px-2 py-1 rounded-md" dir="ltr">
                          ${Number(model.pricing.prompt).toFixed(5)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          
          {models && models.length > 0 && (
            <div className="mt-6">
              <Button onClick={handleSave} loading={update.isPending}>
                <Save className="h-4 w-4 ml-2" />
                تایید مدل انتخاب شده
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
