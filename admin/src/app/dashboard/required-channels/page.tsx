"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, Pencil, RadioTower, RefreshCw, ShieldCheck, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Input, Modal, Skeleton } from "@/components/ui";
import { getApiError, requiredChannelsApi } from "@/services/api";
import type { RequiredChannel } from "@/types";

function syncBackendCache() {
  requiredChannelsApi.refreshCache().catch(() => {});
}

function CardSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-40 w-full rounded-xl" />
      ))}
    </div>
  );
}

function EditModal({ channel, onClose, onSave }: { channel: RequiredChannel; onClose: () => void; onSave: (displayTitle: string, inviteLink: string) => void }) {
  const [displayTitle, setDisplayTitle] = useState(channel.displayTitle ?? channel.title);
  const [inviteLink, setInviteLink] = useState(channel.inviteLink ?? "");

  return (
    <Modal open={true} onClose={onClose} title="ویرایش اطلاعات" size="sm">
      <div className="space-y-4">
        <div>
          <label className="text-sm text-muted-foreground block mb-1">نام کانال/گروه</label>
          <p className="text-sm font-medium">{channel.title}</p>
        </div>
        <div>
          <label className="text-sm text-muted-foreground block mb-1">Chat ID</label>
          <p className="text-sm font-mono" dir="ltr">{channel.chatId || channel.channelId}</p>
        </div>
        <Input label="عنوان نمایشی در ربات" value={displayTitle} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayTitle(e.target.value)} />
        <Input label="لینک دعوت" dir="ltr" value={inviteLink} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInviteLink(e.target.value)} placeholder="https://t.me/..." />
      </div>
      <div className="flex justify-end gap-2 mt-6">
        <Button variant="outline" onClick={onClose}>انصراف</Button>
        <Button onClick={() => onSave(displayTitle, inviteLink)}>ذخیره</Button>
      </div>
    </Modal>
  );
}

export default function RequiredChannelsPage() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<RequiredChannel | null>(null);

  const query = useQuery({ queryKey: ["required-channels"], queryFn: () => requiredChannelsApi.getAll() });

  const update = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Record<string, unknown> }) => requiredChannelsApi.update(id, payload as any),
    onSuccess: () => {
      toast.success("تغییرات ذخیره شد");
      setEditing(null);
      queryClient.invalidateQueries({ queryKey: ["required-channels"] });
      syncBackendCache();
    },
    onError: (error) => toast.error(getApiError(error)),
  });

  const refresh = useMutation({
    mutationFn: requiredChannelsApi.refreshBotStatus,
    onSuccess: () => { toast.success("وضعیت ربات بروزرسانی شد"); queryClient.invalidateQueries({ queryKey: ["required-channels"] }); },
    onError: (error) => toast.error(getApiError(error)),
  });

  const remove = useMutation({
    mutationFn: requiredChannelsApi.delete,
    onSuccess: () => { toast.success("حذف شد"); queryClient.invalidateQueries({ queryKey: ["required-channels"] }); syncBackendCache(); },
  });

  const items = query.data?.items;
  const showEmpty = !query.isLoading && !query.isError && (!items || items.length === 0);

  const statusVariant = (s: string) => s === "APPROVED" ? "success" : s === "PENDING" ? "warning" : s === "DISABLED" ? "danger" : "outline";
  const botVariant = (s: string | null | undefined) => s === "administrator" || s === "creator" ? "success" : s?.includes("ERROR") ? "danger" : "outline";

  return (
    <div className="space-y-6">
      <div className="page-header">
        <div>
          <h1 className="section-title">مدیریت عضویت اجباری</h1>
          <p className="text-sm text-muted-foreground mt-1">
            ربات را در کانال یا گروه موردنظر عضو کرده و به آن دسترسی Administrator بدهید، سپس از بخش پایین روی دکمه «تأیید» کلیک کنید تا وضعیت اتصال و دسترسی ربات بررسی شود.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <h2 className="font-semibold">لیست عضویت اجباری</h2>
        </CardHeader>
        <CardContent>
          {query.isLoading ? (
            <CardSkeleton />
          ) : query.isError ? (
            <div className="p-8 text-center text-red-500">
              <AlertTriangle className="mx-auto h-8 w-8 mb-2" />
              <p>خطا در دریافت لیست. اطمینان حاصل کنید که سرویس عضویت اجباری در تنظیمات فعال است.</p>
            </div>
          ) : showEmpty ? (
            <EmptyState icon={<RadioTower />} title="موردی ثبت نشده" />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items?.map((ch: RequiredChannel) => (
                <div key={ch.id} className="rounded-xl border border-border bg-background/60 p-4 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm truncate">{ch.title}</p>
                      {ch.displayTitle && ch.displayTitle !== ch.title && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">نمایش در ربات: {ch.displayTitle}</p>
                      )}
                    </div>
                    <Badge variant={statusVariant(ch.status)} className="shrink-0 ml-2">{ch.status === "APPROVED" ? "تأیید شده" : ch.status === "PENDING" ? "در انتظار" : ch.status === "DISABLED" ? "غیرفعال" : ch.status}</Badge>
                  </div>

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5">
                      <span className="w-16 shrink-0">شناسه:</span>
                      <span className="font-mono" dir="ltr">{ch.chatId || ch.channelId}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="w-16 shrink-0">نوع:</span>
                      <Badge variant="info" className="text-[10px]">{ch.type === "CHANNEL" ? "کانال" : "گروه"}</Badge>
                    </div>
                    {ch.inviteLink && (
                      <div className="flex items-center gap-1.5">
                        <span className="w-16 shrink-0">دعوت:</span>
                        <a href={ch.inviteLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline truncate">{ch.inviteLink}</a>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                    <Badge variant={botVariant(ch.botStatus)} className="text-[10px]">
                      <span className="inline-block w-1.5 h-1.5 rounded-full mr-1" style={{ backgroundColor: ch.botStatus === "administrator" || ch.botStatus === "creator" ? "#22c55e" : ch.botStatus?.includes("ERROR") ? "#ef4444" : "#a1a1aa" }} />
                      {ch.botStatus || "بررسی نشده"}
                    </Badge>
                    {ch.lastError && (
                      <span className="text-[10px] text-red-500 truncate flex-1" title={ch.lastError}>{ch.lastError}</span>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" loading={refresh.isPending} onClick={() => refresh.mutate(ch.id)}>
                      <RefreshCw className="h-3 w-3" /> بررسی
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => update.mutate({ id: ch.id, payload: { status: "APPROVED" } })}>
                      <Check className="h-3 w-3" /> تأیید
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => update.mutate({ id: ch.id, payload: { status: "REJECTED" } })}>
                      <X className="h-3 w-3" /> رد
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => update.mutate({ id: ch.id, payload: { status: "DISABLED" } })}>
                      <ShieldCheck className="h-3 w-3" /> غیرفعال
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setEditing(ch)}>
                      <Pencil className="h-3 w-3" /> ویرایش
                    </Button>
                    <Button size="sm" variant="danger" className="h-7 text-xs gap-1" loading={remove.isPending} onClick={() => { if (confirm("آیا از حذف این مورد مطمئن هستید؟")) remove.mutate(ch.id); }}>
                      <Trash2 className="h-3 w-3" /> حذف
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editing && (
        <EditModal
          channel={editing}
          onClose={() => setEditing(null)}
          onSave={(displayTitle, inviteLink) => update.mutate({ id: editing.id, payload: { displayTitle, inviteLink } })}
        />
      )}
    </div>
  );
}
