"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent, EmptyState, StatCardSkeleton } from "@/components/ui";
import { attributionApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import { Shield, ShieldCheck, ShieldAlert, Clock, Users, Activity, Zap, Calendar, ArrowRight } from "lucide-react";

// ─── Persian Date Helpers ───────────────────────────────────
const PERSIAN_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gy;
  if (gm > 2) gy2 += 1;
  let days = 355666 + 365 * gy2 + Math.floor(gy2 / 4) - Math.floor(gy2 / 100) + Math.floor(gy2 / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let jm: number, jd: number;
  if (days < 186) { jm = 1 + Math.floor(days / 31); jd = 1 + (days % 31); }
  else { jm = 7 + Math.floor((days - 186) / 30); jd = 1 + ((days - 186) % 30); }
  return [jy, jm, jd];
}

function isoToJalaliFull(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
  } catch { return iso; }
}

function isoToJalaliDateTime(iso: string | null): string {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    const hours = String(d.getUTCHours()).padStart(2, "0");
    const mins = String(d.getUTCMinutes()).padStart(2, "0");
    return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")} ${hours}:${mins}`;
  } catch { return iso; }
}

const SOURCE_LABELS: Record<string, string> = {
  referral: "دعوت دوستان",
  direct: "استارت مستقیم",
  ads: "تبلیغات",
  website: "سایت",
  telegram: "تلگرام",
  utm: "کمپین",
  returning: "بازگشتی",
  unknown: "ناشناس",
};

const EVENT_LABELS: Record<string, string> = {
  BOT_STARTED: "شروع ربات",
  BOT_RESTARTED: "شروع مجدد",
  FIRST_ACTIVITY: "اولین فعالیت",
  REFERRAL_DETECTED: "تشخیص دعوت",
  REGISTRATION_COMPLETE: "تکمیل ثبت‌نام",
};

// ─── Confidence Badge ───────────────────────────────────────
function ConfidenceBadge({ score }: { score: number }) {
  if (score >= 80) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-600">
      <ShieldCheck className="h-3.5 w-3.5" /> {score}%
    </span>
  );
  if (score >= 50) return (
    <span className="inline-flex items-center gap-1 rounded-full bg-yellow-500/10 px-2.5 py-1 text-xs font-medium text-yellow-600">
      <Shield className="h-3.5 w-3.5" /> {score}%
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-600">
      <ShieldAlert className="h-3.5 w-3.5" /> {score}%
    </span>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function AttributionPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"userId" | "telegramId">("telegramId");

  const searchEnabled = searchQuery.trim().length > 0;

  const query = useQuery({
    queryKey: ["attribution", searchType, searchQuery],
    queryFn: () => searchType === "userId"
      ? attributionApi.getUser(parseInt(searchQuery))
      : attributionApi.getByTelegramId(searchQuery),
    enabled: searchEnabled,
  });

  const lowConfQuery = useQuery({
    queryKey: ["attribution-low-confidence"],
    queryFn: () => attributionApi.getLowConfidence(80, 20),
  });

  const d = query.data?.data;
  const lowConfUsers = lowConfQuery.data?.data ?? [];

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title">Attribution کاربران</h1>
          <p className="text-sm text-muted-foreground">ردیابی مسیر جذب و تاریخچه فعالیت کاربران</p>
        </div>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-3">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as any)}
              className="rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="telegramId">Telegram ID</option>
              <option value="userId">User ID</option>
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchType === "telegramId" ? "شناسه تلگرام کاربر را وارد کنید..." : "شناسه داخلی کاربر را وارد کنید..."}
              className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </CardContent>
      </Card>

      {/* Attribution Detail */}
      {query.isLoading && searchEnabled && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      )}

      {query.isError && searchEnabled && (
        <Card>
          <CardContent className="pt-6">
            <EmptyState title="کاربر یافت نشد" description="شناسه وارد شده معتبر نیست یا هنوز Attribution ثبت نشده است." />
          </CardContent>
        </Card>
      )}

      {d && (
        <>
          {/* Confidence Score */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                    <Shield className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Attribution Confidence</p>
                    <div className="flex items-center gap-3">
                      <p className="text-3xl font-bold">{d.confidenceScore}%</p>
                      <ConfidenceBadge score={d.confidenceScore} />
                    </div>
                  </div>
                </div>
                {d.confidenceScore < 80 && (
                  <div className="rounded-lg bg-yellow-500/10 border border-yellow-500/20 px-4 py-2 text-sm text-yellow-700">
                    ⚠️ داده ناقص — بررسی کنید
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-500"><Zap className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">منبع جذب</p>
                  <p className="text-lg font-bold">{SOURCE_LABELS[d.acquisitionSource] ?? d.acquisitionSource}</p>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-green-500/10 text-green-500"><Activity className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">دفعات ورود</p>
                  <p className="text-2xl font-bold">{formatNumber(d.startCount)}</p>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-500/10 text-purple-500"><Users className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">دعوت‌های موفق</p>
                  <p className="text-2xl font-bold">{formatNumber(d.successfulReferrals)}</p>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/10 text-amber-500"><Clock className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs text-muted-foreground">فعالیت‌ها</p>
                  <p className="text-2xl font-bold">{formatNumber(d.activitiesCount)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Detail Info */}
          <Card>
            <div className="p-5 border-b border-border">
              <h2 className="font-semibold text-foreground">اطلاعات جذب</h2>
            </div>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <InfoRow label="شناسه تلگرام" value={d.telegramId} />
              <InfoRow label="منبع جذب" value={SOURCE_LABELS[d.acquisitionSource] ?? d.acquisitionSource} />
              <InfoRow label="کد دعوت" value={d.referralCode ?? "-"} />
              <InfoRow label="دعوت‌کننده" value={d.inviterUserId ? `#${d.inviterUserId}` : "-"} />
              <InfoRow label="شناسه کمپین" value={d.campaignId ?? "-"} />
              <InfoRow label="شناسه لینک دعوت" value={d.inviteLinkId ?? "-"} />
              <InfoRow label="Payload عمیق" value={d.deepLinkPayload ?? "-"} />
              <InfoRow label="اولین Payload" value={d.firstStartPayload ?? "-"} />
              <InfoRow label="نوع دستگاه" value={d.lastDeviceType ?? "-"} />
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card>
            <div className="p-5 border-b border-border">
              <h2 className="font-semibold text-foreground">تاریخچه Attribution</h2>
            </div>
            <CardContent>
              <div className="space-y-4">
                <TimelineItem
                  icon={<Calendar className="h-4 w-4" />}
                  label="عضویت"
                  value={isoToJalaliDateTime(d.registrationDate)}
                  color="bg-blue-500"
                />
                <TimelineItem
                  icon={<Zap className="h-4 w-4" />}
                  label="اولین شروع ربات"
                  value={isoToJalaliDateTime(d.startedAt)}
                  color="bg-green-500"
                />
                {d.referralCode && (
                  <TimelineItem
                    icon={<Users className="h-4 w-4" />}
                    label="تشخیص دعوت"
                    value={`کد: ${d.referralCode}`}
                    color="bg-purple-500"
                  />
                )}
                <TimelineItem
                  icon={<Activity className="h-4 w-4" />}
                  label="اولین فعالیت"
                  value={isoToJalaliDateTime(d.firstActivityAt)}
                  color="bg-amber-500"
                />
                <TimelineItem
                  icon={<Clock className="h-4 w-4" />}
                  label="آخرین فعالیت"
                  value={isoToJalaliDateTime(d.lastActivityAt)}
                  color="bg-red-500"
                />
              </div>
            </CardContent>
          </Card>

          {/* Events */}
          {d.events.length > 0 && (
            <Card>
              <div className="p-5 border-b border-border">
                <h2 className="font-semibold text-foreground">رویدادهای اخیر ({d.events.length})</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">زمان</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">نوع</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">منبع</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">کد دعوت</th>
                      <th className="px-4 py-3 text-right font-medium text-muted-foreground">Session</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.events.map((event) => (
                      <tr key={event.id} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="px-4 py-3">{isoToJalaliDateTime(event.createdAt)}</td>
                        <td className="px-4 py-3 font-medium">{EVENT_LABELS[event.eventType] ?? event.eventType}</td>
                        <td className="px-4 py-3">{event.source ?? "-"}</td>
                        <td className="px-4 py-3">{event.referralCode ?? "-"}</td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{event.sessionId ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}

      {/* Low Confidence Users */}
      {lowConfUsers.length > 0 && (
        <Card>
          <div className="p-5 border-b border-border flex items-center justify-between">
            <h2 className="font-semibold text-foreground">کاربران با Attribution کم اعتماد ({lowConfUsers.length})</h2>
            <span className="text-xs text-muted-foreground">Confidence &lt; 80%</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">شناسه</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">منبع</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-confidence">اعتماد</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">تاریخ شروع</th>
                </tr>
              </thead>
              <tbody>
                {lowConfUsers.map((user) => (
                  <tr key={user.userId} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer"
                    onClick={() => { setSearchType("userId"); setSearchQuery(String(user.userId)); }}>
                    <td className="px-4 py-3 font-medium">#{user.userId}</td>
                    <td className="px-4 py-3">{SOURCE_LABELS[user.acquisitionSource] ?? user.acquisitionSource}</td>
                    <td className="px-4 py-3"><ConfidenceBadge score={user.confidenceScore} /></td>
                    <td className="px-4 py-3">{isoToJalaliFull(user.startedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground truncate" title={value}>{value}</p>
    </div>
  );
}

function TimelineItem({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-4">
      <div className={`flex h-8 w-8 items-center justify-center rounded-full ${color} text-white shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-sm font-medium text-foreground">{value}</span>
      </div>
    </div>
  );
}
