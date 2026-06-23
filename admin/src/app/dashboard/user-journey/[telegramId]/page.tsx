"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, EmptyState } from "@/components/ui";
import { userEventApi, usersApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import { Clock, MessageSquare, Zap, ArrowRight, Filter } from "lucide-react";
import Link from "next/link";

const EVENT_TYPE_LABELS: Record<string, string> = {
  BOT_START: 'شروع ربات',
  BOT_RESTARTED: 'شروع مجدد',
  BUTTON_CLICK: 'کلیک دکمه',
  INLINE_BUTTON_CLICK: 'کلیک دکمه اینلاین',
  MENU_OPEN: 'باز کردن منو',
  MESSAGE_SENT: 'ارسال پیام',
  TEXT_MESSAGE: 'پیام متنی',
  PHOTO_MESSAGE: 'پیام عکس',
  VIDEO_MESSAGE: 'پیام ویدیو',
  VOICE_MESSAGE: 'پیام صوتی',
  DOCUMENT_MESSAGE: 'پیام فایل',
  CONTACT_SHARED: 'اشتراک‌گذاری مخاطب',
  LOCATION_SHARED: 'اشتراک‌گذاری موقعیت',
  PROFILE_VIEW: 'مشاهده پروفایل',
  POST_VIEW: 'مشاهده پست',
  LOTTERY_VIEW: 'مشاهده قرعه‌کشی',
  LOTTERY_JOIN: 'شرکت در قرعه‌کشی',
  REFERRAL_CREATED: 'ایجاد دعوت',
  REFERRAL_SUCCESS: 'دعوت موفق',
  SETTINGS_OPEN: 'باز کردن تنظیمات',
  UNKNOWN_ACTION: 'عملیات ناشناخته',
};

const EVENT_COLORS: Record<string, string> = {
  BOT_START: 'bg-green-500',
  BOT_RESTARTED: 'bg-green-500',
  BUTTON_CLICK: 'bg-blue-500',
  MESSAGE_SENT: 'bg-purple-500',
  POST_VIEW: 'bg-amber-500',
  LOTTERY_JOIN: 'bg-pink-500',
  REFERRAL_SUCCESS: 'bg-teal-500',
};

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gy; if (gm > 2) gy2 += 1;
  let days = 355666 + 365 * gy2 + Math.floor(gy2 / 4) - Math.floor(gy2 / 100) + Math.floor(gy2 / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053); days %= 12053;
  jy += 4 * Math.floor(days / 1461); days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let jm: number, jd: number;
  if (days < 186) { jm = 1 + Math.floor(days / 31); jd = 1 + (days % 31); }
  else { jm = 7 + Math.floor((days - 186) / 30); jd = 1 + ((days - 186) % 30); }
  return [jy, jm, jd];
}

function isoToJalaliDateTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "-";
    const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")} ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
  } catch { return "-"; }
}

export default function UserJourneyPage() {
  const params = useParams();
  const telegramId = params.telegramId as string;

  const [tab, setTab] = useState<'timeline' | 'events' | 'messages'>('timeline');
  const [eventFilter, setEventFilter] = useState('');
  const [messageFilter, setMessageFilter] = useState('');

  // Get user info by telegramId
  const userQuery = useQuery({
    queryKey: ["user-journey-user", telegramId],
    queryFn: () => usersApi.getByTelegramId(telegramId),
    enabled: Boolean(telegramId),
  });

  const user = userQuery.data;
  const userId = user?.id;

  // Timeline
  const timelineQuery = useQuery({
    queryKey: ["user-timeline", userId],
    queryFn: () => userEventApi.getTimeline(userId!, 200),
    enabled: Boolean(userId),
  });

  // Events
  const eventsQuery = useQuery({
    queryKey: ["user-events", userId, eventFilter],
    queryFn: () => userEventApi.getEvents(userId!, { limit: 100, eventType: eventFilter || undefined }),
    enabled: Boolean(userId) && tab === 'events',
  });

  // Messages
  const messagesQuery = useQuery({
    queryKey: ["user-messages", userId, messageFilter],
    queryFn: () => userEventApi.getMessages(userId!, { limit: 100, messageType: messageFilter || undefined }),
    enabled: Boolean(userId) && tab === 'messages',
  });

  const timeline = timelineQuery.data?.data ?? [];
  const events = eventsQuery.data?.data?.items ?? [];
  const messages = messagesQuery.data?.data?.items ?? [];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/users" className="text-muted-foreground hover:text-foreground">
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="section-title">سفر کاربر</h1>
            <p className="text-sm text-muted-foreground">
              Telegram ID: <span className="font-mono">{telegramId}</span>
              {user && <> — {user.firstName} @{user.username ?? "-"}</>}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-1">
        {[
          { key: 'timeline', label: 'Timeline', icon: Clock },
          { key: 'events', label: 'رویدادها', icon: Zap },
          { key: 'messages', label: 'پیام‌ها', icon: MessageSquare },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-all ${
              tab === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Timeline Tab */}
      {tab === 'timeline' && (
        <Card>
          <CardContent className="pt-6">
            {timelineQuery.isLoading ? (
              <div className="text-center py-8 text-muted-foreground">در حال بارگذاری...</div>
            ) : timeline.length === 0 ? (
              <EmptyState title="هنوز رویدادی ثبت نشده" />
            ) : (
              <div className="space-y-4">
                {timeline.map((item, i) => (
                  <div key={`${item.type}-${item.id}`} className="flex items-start gap-4">
                    <div className="relative">
                      <div className={`h-3 w-3 rounded-full ${EVENT_COLORS[item.label] ?? 'bg-gray-400'} mt-1.5`} />
                      {i < timeline.length - 1 && <div className="absolute left-1.5 top-4 h-full w-0.5 bg-border" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-foreground">
                          {EVENT_TYPE_LABELS[item.label] ?? item.label}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {isoToJalaliDateTime(item.timestamp)}
                        </span>
                      </div>
                      {item.detail && item.detail !== '{}' && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{item.detail}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Events Tab */}
      {tab === 'events' && (
        <Card>
          <div className="p-5 border-b border-border flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="">همه رویدادها</option>
              {Object.entries(EVENT_TYPE_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">زمان</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">نوع</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">جزئیات</th>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <tr key={event.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs">{isoToJalaliDateTime(event.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        {EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[300px] truncate" title={JSON.stringify(event.eventData)}>
                      {event.eventData ? JSON.stringify(event.eventData) : "-"}
                    </td>
                  </tr>
                ))}
                {events.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">رویدادی یافت نشد</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Messages Tab */}
      {tab === 'messages' && (
        <Card>
          <div className="p-5 border-b border-border flex items-center gap-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <select
              value={messageFilter}
              onChange={(e) => setMessageFilter(e.target.value)}
              className="rounded-lg border border-input bg-background px-3 py-1.5 text-sm"
            >
              <option value="">همه پیام‌ها</option>
              <option value="text">متنی</option>
              <option value="photo">عکس</option>
              <option value="video">ویدیو</option>
              <option value="voice">صوتی</option>
              <option value="document">فایل</option>
              <option value="contact">مخاطب</option>
              <option value="location">موقعیت</option>
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">زمان</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">نوع</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">متن</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Message ID</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => (
                  <tr key={msg.id} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="px-4 py-3 text-xs">{isoToJalaliDateTime(msg.createdAt)}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-600">
                        {msg.messageType}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-[300px] truncate" title={msg.text ?? ""}>
                      {msg.text ?? "-"}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{msg.messageId ?? "-"}</td>
                  </tr>
                ))}
                {messages.length === 0 && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">پیامی یافت نشد</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
