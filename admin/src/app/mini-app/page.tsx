"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { API_BASE_URL } from "@/services/api";

type TelegramWebAppUser = { id?: number; username?: string; first_name?: string; last_name?: string };

type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: TelegramWebAppUser; auth_date?: number; hash?: string; query_id?: string; start_param?: string };
  version?: string;
  platform?: string;
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
  code?: string;
  debug?: { validation?: boolean; hashValid?: boolean; userReceived?: boolean };
};

type MiniAppDiagnostics = {
  href: string;
  userAgent: string;
  hasTelegramObject: boolean;
  hasWebApp: boolean;
  version?: string;
  platform?: string;
  initData: string;
  initDataSource: string;
  initDataLength: number;
  initDataUnsafe?: unknown;
  launchParams: Record<string, string>;
  launchParamsSource: string;
  urlFragment: string;
  hasInitData: boolean;
  hashPresent: boolean;
  userReceived: boolean;
  validation: boolean | null;
  hashValid: boolean | null;
  authCode?: string;
  authError?: string;
};

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

const numberFormatter = new Intl.NumberFormat("fa-IR");
const DEBUG_MINI_APP = String(process.env.NEXT_PUBLIC_DEBUG_MINI_APP || process.env.DEBUG_MINI_APP || "false").toLowerCase() === "true";
const MAX_INIT_DATA_WAIT_MS = 2500;
const INIT_DATA_RETRY_MS = 250;

function getWebApp() {
  if (typeof window === "undefined") return undefined;
  return window.Telegram?.WebApp;
}

function safeJson(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function paramsToObject(params: URLSearchParams) {
  return Array.from(params.entries()).reduce<Record<string, string>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}

function readLaunchParams() {
  if (typeof window === "undefined") return { params: new URLSearchParams(), source: "none", fragment: "" };

  const fragment = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const hashParams = new URLSearchParams(fragment);
  if (hashParams.has("tgWebAppData") || hashParams.has("tgWebAppVersion") || hashParams.has("tgWebAppPlatform")) {
    return { params: hashParams, source: "url_fragment", fragment };
  }

  const searchParams = new URLSearchParams(window.location.search);
  if (searchParams.has("tgWebAppData") || searchParams.has("tgWebAppVersion") || searchParams.has("tgWebAppPlatform")) {
    return { params: searchParams, source: "url_search", fragment };
  }

  return { params: searchParams, source: searchParams.toString() ? "url_search" : "none", fragment };
}

function getInitDataCandidate(webApp?: TelegramWebApp) {
  const launch = readLaunchParams();
  const launchInitData = launch.params.get("tgWebAppData") || "";
  const explicitDebugInitData = DEBUG_MINI_APP ? launch.params.get("initData") || "" : "";

  if (webApp?.initData) return { initData: webApp.initData, source: "window.Telegram.WebApp.initData", launch };
  if (launchInitData) return { initData: launchInitData, source: launch.source === "url_fragment" ? "URL Fragment tgWebAppData" : "launch parameters tgWebAppData", launch };
  if (explicitDebugInitData) return { initData: explicitDebugInitData, source: "debug initData query parameter", launch };

  return { initData: "", source: "none", launch };
}

function getUnsafeUserId(value: unknown) {
  if (!value || typeof value !== "object" || !("user" in value)) return null;
  return (value as { user?: TelegramWebAppUser }).user?.id || null;
}

function createDiagnostics(): MiniAppDiagnostics {
  const telegramObject = typeof window !== "undefined" ? window.Telegram : undefined;
  const webApp = telegramObject?.WebApp;
  const initDataCandidate = getInitDataCandidate(webApp);
  const initDataUnsafe = webApp?.initDataUnsafe;
  const params = new URLSearchParams(initDataCandidate.initData);
  const urlHash = params.get("hash") || initDataUnsafe?.hash || "";
  const rawUser = params.get("user");
  let userReceivedFromInitData = false;
  try {
    userReceivedFromInitData = Boolean(rawUser && JSON.parse(rawUser)?.id);
  } catch {
    userReceivedFromInitData = false;
  }

  return {
    href: typeof window !== "undefined" ? window.location.href : "",
    userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    hasTelegramObject: Boolean(telegramObject),
    hasWebApp: Boolean(webApp),
    version: webApp?.version || initDataCandidate.launch.params.get("tgWebAppVersion") || undefined,
    platform: webApp?.platform || initDataCandidate.launch.params.get("tgWebAppPlatform") || undefined,
    initData: initDataCandidate.initData,
    initDataSource: initDataCandidate.source,
    initDataLength: initDataCandidate.initData.length,
    initDataUnsafe: safeJson(initDataUnsafe),
    launchParams: paramsToObject(initDataCandidate.launch.params),
    launchParamsSource: initDataCandidate.launch.source,
    urlFragment: initDataCandidate.launch.fragment,
    hasInitData: Boolean(initDataCandidate.initData),
    hashPresent: Boolean(urlHash),
    userReceived: userReceivedFromInitData || Boolean(initDataUnsafe?.user?.id),
    validation: null,
    hashValid: null,
  };
}

async function sendDebugLog(eventType: string, message: string, payload: unknown, telegramId?: number | string | null) {
  const safePayload = DEBUG_MINI_APP ? payload : redactDiagnostics(payload);
  if (DEBUG_MINI_APP) console.log(`[MiniAppDebug] ${eventType}: ${message}`, safePayload);
  try {
    await fetch(`${API_BASE_URL}/api/mini-app/debug-log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ telegramId, eventType, message, payload: safePayload, userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "" }),
    });
  } catch (error) {
    if (DEBUG_MINI_APP) console.warn("[MiniAppDebug] ارسال لاگ به بک‌اند ناموفق بود", error);
  }
}

function redactDiagnostics(payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const copy = { ...(payload as Record<string, unknown>) };
  for (const key of ["initData", "initDataUnsafe", "href", "windowLocationHref", "navigatorUserAgent", "userAgent", "urlFragment", "launchParams"]) {
    if (key in copy) copy[key] = "[redacted]";
  }
  return copy;
}

async function requestProfile(initData: string) {
  const response = await fetch(`${API_BASE_URL}/api/mini-app/profile`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ initData }),
  });
  const data = (await response.json()) as ProfileResponse;
  if (!response.ok || !data.success) {
    const err = new Error(data.error || "خطا در دریافت اطلاعات کاربری") as Error & { code?: string };
    err.code = data.code;
    throw err;
  }
  return data;
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
  const [diagnostics, setDiagnostics] = useState<MiniAppDiagnostics | null>(null);
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
    let cancelled = false;
    let elapsed = 0;
    let lastSnapshot: MiniAppDiagnostics | null = null;

    const bootstrap = async () => {
      const webApp = getWebApp();
      webApp?.ready?.();
      webApp?.expand?.();

      const snapshot = createDiagnostics();
      lastSnapshot = snapshot;
      if (!cancelled) {
        setDiagnostics(snapshot);
        setInitData(snapshot.initData);
      }

      if (!snapshot.initData && elapsed < MAX_INIT_DATA_WAIT_MS) {
        elapsed += INIT_DATA_RETRY_MS;
        window.setTimeout(bootstrap, INIT_DATA_RETRY_MS);
        return;
      }

      void sendDebugLog("MINI_APP_CLIENT_BOOT", "Mini App diagnostics before validation", snapshot, getUnsafeUserId(snapshot.initDataUnsafe));

      if (!snapshot.initData) {
        void sendDebugLog("MINI_APP_CLIENT_NO_INIT_DATA", "Telegram initData is empty in Mini App frontend", snapshot, getUnsafeUserId(snapshot.initDataUnsafe));
        if (!cancelled) {
          setError(DEBUG_MINI_APP ? "initData تلگرام دریافت نشد. اطلاعات تشخیصی زیر را بررسی کنید." : "برای مشاهده پروفایل، لطفاً این صفحه را از دکمه پروفایل داخل چت خصوصی ربات تلگرام باز کنید.");
          setLoading(false);
        }
        return;
      }

      try {
        const response = await requestProfile(snapshot.initData);
        if (cancelled) return;
        setUser(response.user);
        setFirstName(response.user.firstName || "");
        setLastName(response.user.lastName || "");
        setPhoneNumber(response.user.phoneNumber || "");
        setDiagnostics((prev) => prev ? { ...prev, validation: Boolean(response.debug?.validation ?? true), hashValid: Boolean(response.debug?.hashValid ?? true), userReceived: Boolean(response.debug?.userReceived ?? true) } : prev);
      } catch (err) {
        const errorWithCode = err as Error & { code?: string };
        if (cancelled) return;
        setDiagnostics((prev) => prev ? { ...prev, validation: false, hashValid: errorWithCode.code === "MINI_APP_INVALID_HASH" ? false : prev.hashValid, authCode: errorWithCode.code, authError: errorWithCode.message } : prev);
        setError(DEBUG_MINI_APP ? errorWithCode.message || "خطا در دریافت اطلاعات" : "ورود تلگرام شما قابل تأیید نبود. لطفاً Mini App را ببندید و دوباره از داخل ربات باز کنید.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    window.setTimeout(bootstrap, 0);

    return () => {
      cancelled = true;
      if (lastSnapshot && DEBUG_MINI_APP) console.log("[MiniAppDebug] آخرین وضعیت Mini App", lastSnapshot);
    };
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

          {DEBUG_MINI_APP && diagnostics && <DebugCard diagnostics={diagnostics} />}

          {loading ? (
            <div className="space-y-3">
              <div className="h-20 animate-pulse rounded-2xl bg-white/10" />
              <div className="h-48 animate-pulse rounded-2xl bg-white/10" />
            </div>
          ) : error && !user ? (
            DEBUG_MINI_APP ? <FallbackDiagnostics error={error} diagnostics={diagnostics} /> : <FriendlyError error={error} />
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

function StatusLine({ label, ok, unknown = false, trueLabel = "موجود", falseLabel = "موجود نیست" }: { label: string; ok?: boolean | null; unknown?: boolean; trueLabel?: string; falseLabel?: string }) {
  return <div className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 text-xs"><span>{label}</span><span>{unknown || ok === null ? "⏳ در انتظار" : ok ? `✅ ${trueLabel}` : `❌ ${falseLabel}`}</span></div>;
}

function DebugCard({ diagnostics }: { diagnostics: MiniAppDiagnostics }) {
  return (
    <div className="mb-4 space-y-2 rounded-2xl border border-amber-300/30 bg-amber-400/10 p-4 text-amber-50">
      <p className="font-bold">🛠 Debug Mini App</p>
      <StatusLine label="Telegram Object" ok={diagnostics.hasTelegramObject} />
      <StatusLine label="WebApp" ok={diagnostics.hasWebApp} />
      <StatusLine label="initData" ok={diagnostics.hasInitData} trueLabel="دریافت شده" falseLabel="دریافت نشده" />
      <StatusLine label="Hash" ok={diagnostics.hashValid ?? diagnostics.hashPresent} trueLabel="معتبر" falseLabel="نامعتبر" />
      <StatusLine label="User" ok={diagnostics.userReceived} trueLabel="دریافت شد" falseLabel="دریافت نشد" />
      <StatusLine label="Validation" ok={diagnostics.validation} trueLabel="موفق" falseLabel="ناموفق" />
      <pre dir="ltr" className="max-h-72 overflow-auto rounded-xl bg-black/30 p-3 text-left text-[10px] leading-5">
        {JSON.stringify({
          initData: diagnostics.initData,
          initDataSource: diagnostics.initDataSource,
          initDataUnsafe: diagnostics.initDataUnsafe,
          user: (diagnostics.initDataUnsafe as { user?: TelegramWebAppUser } | undefined)?.user,
          hash: new URLSearchParams(diagnostics.initData).get("hash") || (diagnostics.initDataUnsafe as { hash?: string } | undefined)?.hash,
          validation: diagnostics.validation,
          hashValid: diagnostics.hashValid,
          platform: diagnostics.platform,
          version: diagnostics.version,
          launchParams: diagnostics.launchParams,
          launchParamsSource: diagnostics.launchParamsSource,
        }, null, 2)}
      </pre>
    </div>
  );
}

function FallbackDiagnostics({ error, diagnostics }: { error: string; diagnostics: MiniAppDiagnostics | null }) {
  return (
    <div className="space-y-3 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm text-red-100">
      <p className="font-bold">{error}</p>
      <div className="space-y-2 text-xs">
        <StatusLine label="Telegram Object Status" ok={diagnostics?.hasTelegramObject ?? false} />
        <StatusLine label="WebApp Status" ok={diagnostics?.hasWebApp ?? false} />
        <StatusLine label="InitData Status" ok={diagnostics?.hasInitData ?? false} trueLabel="دریافت شده" falseLabel="دریافت نشده" />
        <StatusLine label="Hash Status" ok={diagnostics?.hashValid ?? diagnostics?.hashPresent ?? false} trueLabel="معتبر" falseLabel="نامعتبر" />
        <StatusLine label="User Status" ok={diagnostics?.userReceived ?? false} trueLabel="دریافت شد" falseLabel="دریافت نشد" />
        <StatusLine label="Validation Status" ok={diagnostics?.validation ?? false} trueLabel="موفق" falseLabel="ناموفق" />
      </div>
      <div className="rounded-xl bg-black/20 p-3 text-xs leading-6">
        <p><b>InitData Source:</b> {diagnostics?.initDataSource || "-"}</p>
        <p><b>Launch Params Source:</b> {diagnostics?.launchParamsSource || "-"}</p>
        <p><b>URL فعلی:</b></p>
        <p dir="ltr" className="break-all text-left">{diagnostics?.href || "-"}</p>
        <p className="mt-2"><b>UserAgent:</b></p>
        <p dir="ltr" className="break-all text-left">{diagnostics?.userAgent || "-"}</p>
        {diagnostics?.authCode && <p className="mt-2"><b>Code:</b> {diagnostics.authCode}</p>}
        {diagnostics?.authError && <p className="mt-1"><b>Failure:</b> {diagnostics.authError}</p>}
      </div>
    </div>
  );
}

function FriendlyError({ error }: { error: string }) {
  return (
    <div className="rounded-2xl border border-cyan-300/20 bg-cyan-500/10 p-4 text-sm leading-7 text-cyan-50">
      <p className="font-bold">نمایش پروفایل ممکن نشد</p>
      <p className="mt-2">{error}</p>
    </div>
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
