"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@/services/api";

type TelegramWebApp = {
  initData: string;
  ready: () => void;
  expand: () => void;
  close: () => void;
  requestContact?: (callback?: (shared: boolean, result?: { response?: string }) => void) => void;
  MainButton?: { setText: (text: string) => void; show: () => void; hide: () => void; onClick: (fn: () => void) => void; offClick: (fn: () => void) => void };
};

type MiniAppUser = {
  id: number;
  telegramId: string;
  username?: string | null;
  firstName: string;
  lastName?: string | null;
  phoneNumber?: string | null;
  profileCompleted: boolean;
  profileCompletedAt?: string | null;
  points: number;
  totalReferrals: number;
};

type ProfileResponse = {
  success: boolean;
  user: MiniAppUser;
  rewardPoints?: number;
  error?: string;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const numberFormatter = new Intl.NumberFormat("fa-IR");

function getWebApp() {
  if (typeof window === "undefined") return undefined;
  return window.Telegram?.WebApp;
}

async function requestProfile(initData: string) {
  const response = await fetch(`${API_BASE_URL}/api/mini-app/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  const data = (await response.json()) as ProfileResponse;
  if (!response.ok || !data.success) throw new Error(data.error || "خطا در دریافت اطلاعات کاربری");
  return data.user;
}

async function saveProfile(initData: string, payload: { firstName: string; lastName: string; phoneNumber: string }) {
  const response = await fetch(`${API_BASE_URL}/api/mini-app/profile`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData, ...payload }),
  });
  const data = (await response.json()) as ProfileResponse;
  if (!response.ok || !data.success) throw new Error(data.error || "خطا در ذخیره اطلاعات کاربری");
  return data;
}

export default function TelegramMiniAppPage() {
  const [initData, setInitData] = useState("");
  const [user, setUser] = useState<MiniAppUser | null>(null);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ text: string; reward: number } | null>(null);

  const isComplete = useMemo(() => Boolean(user?.profileCompleted), [user]);

  useEffect(() => {
    const webApp = getWebApp();
    webApp?.ready();
    webApp?.expand();

    const telegramInitData = webApp?.initData || (process.env.NODE_ENV === "development" ? new URLSearchParams(window.location.search).get("initData") || "" : "");
    setInitData(telegramInitData);

    if (!telegramInitData) {
      setError("برای استفاده امن، این صفحه را از داخل ربات تلگرام باز کنید.");
      setLoading(false);
      return;
    }

    requestProfile(telegramInitData)
      .then((profile) => {
        setUser(profile);
        setFirstName(profile.firstName || "");
        setLastName(profile.lastName || "");
        setPhoneNumber(profile.phoneNumber || "");
      })
      .catch((err) => setError(err instanceof Error ? err.message : "خطا در دریافت اطلاعات"))
      .finally(() => setLoading(false));
  }, []);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!initData) return;
    setSaving(true);
    setError("");
    setSuccess(null);
    try {
      const response = await saveProfile(initData, { firstName, lastName, phoneNumber });
      setUser(response.user);
      setSuccess({
        text: "🎉 اطلاعات شما با موفقیت ثبت شد.",
        reward: response.rewardPoints || 0,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در ذخیره اطلاعات");
    } finally {
      setSaving(false);
    }
  };

  const requestTelegramContact = () => {
    const webApp = getWebApp();
    if (!webApp?.requestContact) {
      setError("نسخه تلگرام شما از اشتراک مستقیم شماره پشتیبانی نمی‌کند؛ شماره را دستی وارد کنید.");
      return;
    }
    webApp.requestContact((shared, result) => {
      if (!shared) return;
      try {
        const contact = result?.response ? JSON.parse(result.response) : null;
        if (contact?.phone_number) setPhoneNumber(contact.phone_number);
      } catch {
        setError("شماره دریافت شد اما قابل پردازش نبود؛ لطفاً دستی وارد کنید.");
      }
    });
  };

  return (
    <main dir="rtl" className="min-h-screen overflow-hidden bg-[#070b18] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#25d4ff33,transparent_35%),radial-gradient(circle_at_bottom_left,#7c3aed33,transparent_30%)]" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 py-6">
        <div className="mb-5 rounded-[2rem] border border-white/10 bg-white/10 p-5 shadow-2xl shadow-cyan-500/10 backdrop-blur">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-cyan-200">Propchi Mini App</p>
              <h1 className="mt-1 text-2xl font-black">🚀 پروفایل من</h1>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-violet-500 text-2xl shadow-lg">👤</div>
          </div>

          {loading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-2xl bg-white/10" />
              <div className="h-48 animate-pulse rounded-2xl bg-white/10" />
            </div>
          ) : error && !user ? (
            <div className="rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>
          ) : user ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Info label="نام" value={user.firstName || "-"} />
                <Info label="نام خانوادگی" value={user.lastName || "-"} />
                <Info label="یوزرنیم" value={user.username ? `@${user.username}` : "-"} />
                <Info label="آیدی تلگرام" value={user.telegramId} ltr />
                <Info label="شماره موبایل" value={user.phoneNumber || "ثبت نشده"} ltr />
                <Info label="دعوت دوستان" value={`${numberFormatter.format(user.totalReferrals)} نفر`} />
              </div>

              <div className="my-4 rounded-3xl border border-cyan-300/20 bg-gradient-to-l from-cyan-500/20 to-violet-500/20 p-4">
                <p className="text-sm text-cyan-100">امتیاز فعلی</p>
                <p className="mt-1 text-4xl font-black text-cyan-200">{numberFormatter.format(user.points)}</p>
                <p className="mt-2 text-sm">{isComplete ? "✅ پروفایل تکمیل شده" : "❌ پروفایل ناقص است"}</p>
              </div>

              {success && (
                <div className="mb-4 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
                  <p>{success.text}</p>
                  <p className="mt-1">🏆 {numberFormatter.format(success.reward)} امتیاز به حساب شما اضافه شد.</p>
                </div>
              )}
              {error && <div className="mb-4 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">{error}</div>}

              <form className="space-y-3" onSubmit={submit}>
                <label className="block text-sm">
                  نام
                  <input className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 outline-none ring-cyan-300 transition focus:ring-2" value={firstName} onChange={(e) => setFirstName(e.target.value)} minLength={2} required />
                </label>
                <label className="block text-sm">
                  نام خانوادگی
                  <input className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 outline-none ring-cyan-300 transition focus:ring-2" value={lastName} onChange={(e) => setLastName(e.target.value)} minLength={2} required />
                </label>
                <label className="block text-sm">
                  شماره موبایل
                  <input dir="ltr" className="mt-1 w-full rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-right outline-none ring-cyan-300 transition focus:ring-2" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} inputMode="tel" placeholder="09123456789" required />
                </label>
                <button type="button" onClick={requestTelegramContact} className="w-full rounded-2xl border border-cyan-300/30 bg-cyan-300/10 py-3 font-bold text-cyan-100">
                  📱 اشتراک شماره تلگرام
                </button>
                <button disabled={saving} className="w-full rounded-2xl bg-gradient-to-l from-cyan-400 to-violet-500 py-4 font-black text-white shadow-lg shadow-cyan-500/20 disabled:opacity-60">
                  {saving ? "در حال ذخیره..." : isComplete ? "ذخیره تغییرات" : "تکمیل پروفایل و دریافت امتیاز"}
                </button>
              </form>
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

function Info({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
      <p className="text-[11px] text-white/60">{label}</p>
      <p dir={ltr ? "ltr" : "rtl"} className="mt-1 truncate text-sm font-bold">{value}</p>
    </div>
  );
}
