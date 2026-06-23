"use client";

import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui";
import { broadcastTraceApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import { CheckCircle, XCircle, ArrowRight, Zap, Search, Send } from "lucide-react";
import Link from "next/link";

function TraceCard({ label, dbValue, runtimeValue, request, response }: {
  label: string;
  dbValue: string;
  runtimeValue: string;
  request: any;
  response: any;
}) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <p className="text-sm font-semibold text-foreground">{label}</p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-muted-foreground">Database Value:</p>
          <p className="font-mono bg-muted/50 rounded px-2 py-1 mt-1 break-all">{dbValue}</p>
        </div>
        <div>
          <p className="text-muted-foreground">Runtime Value:</p>
          <p className="font-mono bg-muted/50 rounded px-2 py-1 mt-1 break-all">{runtimeValue}</p>
        </div>
      </div>
      {request && (
        <div>
          <p className="text-muted-foreground text-xs">Telegram Request:</p>
          <pre className="text-xs bg-black/5 dark:bg-white/5 rounded p-2 mt-1 overflow-x-auto max-h-40">
            {typeof request === "string" ? request : JSON.stringify(request, null, 2)}
          </pre>
        </div>
      )}
      {response && (
        <div>
          <p className="text-muted-foreground text-xs">Telegram Response:</p>
          <pre className="text-xs bg-black/5 dark:bg-white/5 rounded p-2 mt-1 overflow-x-auto max-h-40">
            {typeof response === "string" ? response : JSON.stringify(response, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function ResultSection({ title, users, type }: { title: string; users: any[]; type: "success" | "failed" }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <h3 className="font-medium text-foreground flex items-center gap-2">
        {type === "success" ? <CheckCircle className="h-4 w-4 text-green-500" /> : <XCircle className="h-4 w-4 text-red-500" />}
        {title} ({users.length})
      </h3>
      {users.map((user, i) => (
        <div key={i} className="rounded-lg border border-border overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === i ? null : i)}
            className="w-full flex items-center justify-between p-3 text-sm hover:bg-muted/20 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="font-medium">#{user.userId}</span>
              <span className="text-muted-foreground">@{user.databaseUsername ?? "-"}</span>
              <span className="text-xs text-muted-foreground">ChatId: {user.resolvedChatId}</span>
            </div>
            <div className="flex items-center gap-2">
              {user.success ? (
                <span className="text-xs text-green-500 font-medium">SUCCESS</span>
              ) : (
                <span className="text-xs text-red-500 font-medium">{user.telegramDescription ?? user.error ?? "FAILED"}</span>
              )}
              <ArrowRight className={`h-4 w-4 transition-transform ${expanded === i ? "rotate-90" : ""}`} />
            </div>
          </button>
          {expanded === i && (
            <div className="p-4 border-t border-border bg-muted/10 space-y-4">
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <p className="text-muted-foreground">Database TelegramId:</p>
                  <p className="font-mono mt-1">{user.databaseTelegramId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Database ChatId:</p>
                  <p className="font-mono mt-1">{user.databaseChatId ?? "NULL"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Resolved ChatId:</p>
                  <p className="font-mono mt-1">{user.resolvedChatId}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Bot Token Fingerprint:</p>
                  <p className="font-mono mt-1">...{user.botTokenFingerprint}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">HTTP Status:</p>
                  <p className="font-mono mt-1">{user.httpStatus ?? "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Telegram Error Code:</p>
                  <p className="font-mono mt-1">{user.telegramErrorCode ?? "-"}</p>
                </div>
              </div>
              <TraceCard
                label="API Call"
                dbValue={user.databaseTelegramId}
                runtimeValue={user.resolvedChatId}
                request={user.rawRequestPayload}
                response={user.rawResponse}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function BroadcastTracePage() {
  const [testUserId, setTestUserId] = useState("");
  const [chatUserId, setChatUserId] = useState("");

  const liveTestMutation = useMutation({
    mutationFn: (userId: number) => broadcastTraceApi.liveTest(userId),
  });

  const getChatMutation = useMutation({
    mutationFn: (userId: number) => broadcastTraceApi.getChat(userId),
  });

  const batchTraceMutation = useMutation({
    mutationFn: () => broadcastTraceApi.batchTrace(),
  });

  const batchResult = batchTraceMutation.data?.data;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/broadcast-diagnostics" className="text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="section-title">Broadcast Delivery Trace</h1>
            <p className="text-sm text-muted-foreground">آزمایش زنده ارسال — بدون فرض، فقط داده خام</p>
          </div>
        </div>
      </div>

      {/* Single User Tests */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="p-5 border-b border-border">
            <h2 className="flex items-center gap-2 font-semibold text-foreground">
              <Send className="h-4 w-4" /> Live Test — ارسال پیام واقعی
            </h2>
          </div>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">پیام تستی ارسال می‌شود و بلافاصله حذف می‌شود. تمام پاسخ خام تلگرام ذخیره می‌شود.</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={testUserId}
                onChange={(e) => setTestUserId(e.target.value)}
                placeholder="User ID"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={() => {
                  const id = parseInt(testUserId);
                  if (!isNaN(id)) liveTestMutation.mutate(id);
                }}
                disabled={!testUserId || liveTestMutation.isPending}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {liveTestMutation.isPending ? "در حال ارسال..." : "ارسال تست"}
              </button>
            </div>
            {liveTestMutation.data?.data && (
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {liveTestMutation.data.data.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="font-medium">{liveTestMutation.data.data.success ? "موفق" : "ناموفق"}</span>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Database:</span> <span className="font-mono">{liveTestMutation.data.data.databaseTelegramId}</span></div>
                  <div><span className="text-muted-foreground">Runtime:</span> <span className="font-mono">{liveTestMutation.data.data.resolvedChatId}</span></div>
                  <div><span className="text-muted-foreground">HTTP:</span> <span className="font-mono">{liveTestMutation.data.data.httpStatus ?? "-"}</span></div>
                  <div><span className="text-muted-foreground">Error Code:</span> <span className="font-mono">{liveTestMutation.data.data.telegramErrorCode ?? "-"}</span></div>
                </div>
                {liveTestMutation.data.data.rawResponse && (
                  <pre className="text-xs bg-black/5 dark:bg-white/5 rounded p-2 overflow-x-auto max-h-48">
                    {JSON.stringify(liveTestMutation.data.data.rawResponse, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <div className="p-5 border-b border-border">
            <h2 className="flex items-center gap-2 font-semibold text-foreground">
              <Search className="h-4 w-4" /> getChat — بررسی وجود کاربر
            </h2>
          </div>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">درخواست getChat به تلگرام ارسال می‌شود تا مشخص شود آیا کاربر واقعاً وجود دارد.</p>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatUserId}
                onChange={(e) => setChatUserId(e.target.value)}
                placeholder="User ID"
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
              <button
                onClick={() => {
                  const id = parseInt(chatUserId);
                  if (!isNaN(id)) getChatMutation.mutate(id);
                }}
                disabled={!chatUserId || getChatMutation.isPending}
                className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {getChatMutation.isPending ? "در حال بررسی..." : "بررسی"}
              </button>
            </div>
            {getChatMutation.data?.data && (
              <div className="rounded-lg border border-border p-4 space-y-2">
                <div className="flex items-center gap-2">
                  {getChatMutation.data.data.success ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                  <span className="font-medium">{getChatMutation.data.data.success ? "کاربر یافت شد" : "کاربر یافت نشد"}</span>
                </div>
                {getChatMutation.data.data.getChatResponse && (
                  <pre className="text-xs bg-black/5 dark:bg-white/5 rounded p-2 overflow-x-auto max-h-48">
                    {JSON.stringify(getChatMutation.data.data.getChatResponse, null, 2)}
                  </pre>
                )}
                {getChatMutation.data.data.rawResponse && !getChatMutation.data.data.success && (
                  <pre className="text-xs bg-black/5 dark:bg-white/5 rounded p-2 overflow-x-auto max-h-48">
                    {JSON.stringify(getChatMutation.data.data.rawResponse, null, 2)}
                  </pre>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Batch Trace */}
      <Card>
        <div className="p-5 border-b border-border flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-foreground">
            <Zap className="h-4 w-4" /> Batch Trace — ۱۰ موفق + ۱۰ ناموفق
          </h2>
          <button
            onClick={() => batchTraceMutation.mutate()}
            disabled={batchTraceMutation.isPending}
            className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {batchTraceMutation.isPending ? "در حال اجرای batch..." : "اجرای Batch Test"}
          </button>
        </div>
        <CardContent className="space-y-6">
          <p className="text-xs text-muted-foreground">
            ۱۰ کاربر موفق و ۱۰ کاربر ناموفق قبلی انتخاب شده و پیام تست واقعی ارسال می‌شود.
            مقایسه Database Value vs Runtime Value vs Telegram Response.
          </p>

          {batchResult && (
            <>
              {/* Summary */}
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg bg-muted/40 p-4">
                  <p className="text-xs text-muted-foreground">تعداد تست شده</p>
                  <p className="text-xl font-bold">{batchResult.summary.totalTested}</p>
                </div>
                <div className="rounded-lg bg-green-500/10 p-4">
                  <p className="text-xs text-green-600">موفق</p>
                  <p className="text-xl font-bold text-green-600">{batchResult.summary.successCount}</p>
                </div>
                <div className="rounded-lg bg-red-500/10 p-4">
                  <p className="text-xs text-red-600">ناموفق</p>
                  <p className="text-xl font-bold text-red-600">{batchResult.summary.failCount}</p>
                </div>
              </div>

              {batchResult.summary.commonFailures.length > 0 && (
                <div className="rounded-lg border border-border p-4">
                  <p className="text-sm font-medium text-foreground mb-2">常见 خطاها:</p>
                  {batchResult.summary.commonFailures.map((f, i) => (
                    <div key={i} className="flex items-center justify-between text-sm py-1">
                      <span className="text-muted-foreground">{f.description}</span>
                      <span className="font-medium">{f.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Results */}
              <ResultSection title="کاربران موفق (قبلی)" users={batchResult.successfulUsers} type="success" />
              <ResultSection title="کاربران ناموفق (قبلی)" users={batchResult.failedUsers} type="failed" />
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
