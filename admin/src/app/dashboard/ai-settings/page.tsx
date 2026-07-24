"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Bot, Save, Server, Loader2, Key, Database, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardHeader, CardContent, Input, Button, Badge } from "@/components/ui";
import { aiSettingsApi, postsApi, getApiError } from "@/services/api";

export default function AiSettingsPage() {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>({});
  const [searchQuery, setSearchQuery] = useState("");
  
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

  const { data: sheetHeaders, isLoading: isHeadersLoading, refetch: refetchHeaders } = useQuery({
    queryKey: ["sheet-headers"],
    queryFn: aiSettingsApi.getSheetHeaders,
    enabled: false,
  });

  const { data: allPosts } = useQuery({
    queryKey: ["all-posts-for-ai"],
    queryFn: () => postsApi.getAllComplete({ status: "PUBLISHED" }),
  });

  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [discountPostIds, setDiscountPostIds] = useState<number[]>([]);

  // Init form from loaded settings
  if (settings && Object.keys(form).length === 0) {
    setForm(settings);
    if (settings.googleSheetMapping) {
      setMapping(settings.googleSheetMapping);
    }
    if (settings.discountPostIds) {
      setDiscountPostIds(settings.discountPostIds);
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSaveOpenRouter = () => {
    update.mutate({ openrouterApiKey: form.openrouterApiKey });
  };

  const handleSaveDiscountPosts = () => {
    update.mutate({ discountPostIds });
  };

  const handleSaveGoogle = () => {
    update.mutate({
      googleSheetId: form.googleSheetId,
      googleServiceAccountEmail: form.googleServiceAccountEmail,
      googlePrivateKey: form.googlePrivateKey,
      googleSheetMapping: mapping,
    });
  };

  const loadHeaders = async () => {
    if (!form.googleSheetId || !form.googleServiceAccountEmail) {
      toast.error("ابتدا تنظیمات منبع داده را کامل و ذخیره کنید");
      return;
    }
    toast.promise(
      refetchHeaders().then((res) => {
        if (res.error) throw res.error;
        if (!res.data || res.data.length === 0) throw new Error("هیچ ستونی در فایل یافت نشد.");
        return res.data;
      }),
      {
        loading: "در حال واکشی ستون‌ها از گوگل شیت...",
        success: "ستون‌ها با موفقیت دریافت شدند",
        error: (e) => getApiError(e),
      }
    );
  };

  const handleSaveModel = () => {
    update.mutate({ selectedModel: form.selectedModel });
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

            <Button onClick={handleSaveOpenRouter} loading={update.isPending} className="w-full">
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
                    // Ignore parse errors
                  }
                  handleChange(e as any);
                }}
              />
              <p className="text-xs text-muted-foreground">
                محتوای فایل JSON کلید خود را اینجا کپی کنید (ایمیل و کلید خصوصی به صورت خودکار استخراج می‌شوند) و یا فقط کلید خصوصی را وارد کنید.
              </p>
            </div>

            <div className="border-t pt-4 mt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold">نگاشت ستون‌ها (Column Mapping)</h3>
                  <p className="text-xs text-muted-foreground mt-1">ستون‌های فایل گوگل شیت را به فیلدهای مورد نیاز ربات متصل کنید.</p>
                </div>
                <Button variant="outline" size="sm" onClick={loadHeaders} disabled={isHeadersLoading}>
                  <RefreshCw className={`h-4 w-4 ml-2 ${isHeadersLoading ? "animate-spin" : ""}`} />
                  دریافت ستون‌های شیت
                </Button>
              </div>

              {sheetHeaders && sheetHeaders.length > 0 ? (
                <div className="space-y-3 bg-muted/30 p-4 rounded-lg border">
                  {[
                    { key: "id", label: "شناسه (id)" },
                    { key: "name", label: "نام پراپ‌فرم (name)" },
                    { key: "aliases", label: "نام‌های جایگزین (aliases)" },
                    { key: "summary", label: "توضیحات کوتاه (summary)" },
                    { key: "rules_summary", label: "خلاصه قوانین (rules_summary)" },
                    { key: "website", label: "لینک ثبت‌نام (website)" },
                    { key: "discount_code", label: "کد تخفیف (discount_code)" },
                    { key: "discount_percent", label: "درصد تخفیف (discount_percent)" },
                    { key: "valid_until", label: "تاریخ انقضا (valid_until)" },
                    { key: "related_post_id", label: "آیدی پست مرتبط (related_post_id)" },
                    { key: "active", label: "وضعیت فعالیت (active)" },
                  ].map((field) => (
                    <div key={field.key} className="flex items-center justify-between gap-4">
                      <label className="text-sm font-medium min-w-[200px]">{field.label}</label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        value={mapping[field.key] || ""}
                        onChange={(e) => setMapping({ ...mapping, [field.key]: e.target.value })}
                        dir="ltr"
                      >
                        <option value="">-- انتخاب ستون --</option>
                        {sheetHeaders.map((header) => (
                          <option key={header} value={header}>{header}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-center p-4 border border-dashed rounded-lg text-muted-foreground">
                  برای اتصال ستون‌ها، ابتدا روی دکمه «دریافت ستون‌های شیت» کلیک کنید.
                </div>
              )}
            </div>
            
            <Button onClick={handleSaveGoogle} loading={update.isPending} className="w-full mt-4">
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
            <>
              <div className="mb-4">
                <Input
                  placeholder="جستجوی مدل (مثلاً gpt-4)..."
                  value={searchQuery}
                  onChange={(e: any) => setSearchQuery(e.target.value)}
                  dir="ltr"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 max-h-[500px] overflow-y-auto p-1">
                {models.filter((m: any) => m.id.toLowerCase().includes(searchQuery.toLowerCase()) || m.name.toLowerCase().includes(searchQuery.toLowerCase())).map((model: any) => {
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
            </>
          )}
          
          {models && models.length > 0 && (
            <div className="mt-6">
              <Button onClick={handleSaveModel} loading={update.isPending}>
                <Save className="h-4 w-4 ml-2" />
                تایید مدل انتخاب شده
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Discount Code Posts */}
      <Card>
        <CardHeader>
          <h2 className="font-semibold flex items-center gap-2">
            <Bot className="h-5 w-5 text-blue-500" />
            پست‌های کدهای تخفیف مرجع
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            پست‌هایی که حاوی کدهای تخفیف هستند را در اینجا انتخاب کنید تا هوش مصنوعی بتواند محتوای آن‌ها را دقیقاً بخواند.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {!allPosts ? (
            <div className="flex justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid gap-2 max-h-[300px] overflow-y-auto p-1 border rounded-md">
              {allPosts.items.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">هیچ پستی یافت نشد.</p>
              ) : (
                allPosts.items.map((post: any) => (
                  <label key={post.id} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/30 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={discountPostIds.includes(post.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setDiscountPostIds([...discountPostIds, post.id]);
                        } else {
                          setDiscountPostIds(discountPostIds.filter((id) => id !== post.id));
                        }
                      }}
                    />
                    <span className="text-sm font-medium">{post.title || `پست #${post.id}`}</span>
                  </label>
                ))
              )}
            </div>
          )}
          
          <Button onClick={handleSaveDiscountPosts} loading={update.isPending} className="w-full mt-4">
            <Save className="h-4 w-4 ml-2" />
            ذخیره پست‌های کدهای تخفیف
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
