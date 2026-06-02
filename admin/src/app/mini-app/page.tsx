"use client";

import Image from "next/image";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, Copy, ExternalLink, Gift, Globe2, Info, Loader2, Share2, ShoppingBag, Sparkles, TicketPercent, User, X } from "lucide-react";
import { API_BASE_URL } from "@/services/api";

type TelegramWebAppUser = { id?: number; username?: string; first_name?: string; last_name?: string };
type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: TelegramWebAppUser; auth_date?: number; hash?: string; query_id?: string; start_param?: string };
  ready: () => void;
  expand: () => void;
  close: () => void;
  requestContact?: (callback?: (shared: boolean, result?: { response?: string }) => void) => void;
  openTelegramLink?: (url: string) => void;
};

type MiniAppUser = { id: number; telegramId: string; username?: string | null; firstName: string; lastName?: string | null; phoneNumber?: string | null; profileCompleted: boolean; points: number; totalReferrals: number };
type ReferralStats = { referralLink: string; inviteCount: number; totalRewardPoints: number; successfulInvites: number; rank?: number | null };
type PropFirm = { id: number; name: string; slug: string; description?: string | null; logoUrl?: string | null; websiteUrl?: string | null; reviewLink?: string | null; isActive: boolean; discountCodes?: DiscountCode[] };
type DiscountCode = { id: number; title: string; code: string; discountPercent: number; affiliateLink?: string | null; expiresAt?: string | null; isFeatured: boolean; propFirm?: PropFirm };
type MiniAppSettings = { siteUrl: string; aboutText?: string; profileCompletionPoints: number };
type ProfileResponse = { success: boolean; user: MiniAppUser; referralStats?: ReferralStats | null; rewardPoints?: number; error?: string };
type AppDataResponse = { success: boolean; settings: MiniAppSettings; propFirms: PropFirm[]; error?: string };
type DiscountsResponse = { success: boolean; items: DiscountCode[]; error?: string };
type TabKey = "profile" | "firms" | "invite" | "site";

declare global { interface Window { Telegram?: { WebApp?: TelegramWebApp }; } }

const DEBUG_MINI_APP = process.env.NEXT_PUBLIC_MINI_APP_DEBUG === "true";
const INIT_DATA_RETRY_MS = 150;
const MAX_INIT_DATA_WAIT_MS = 1800;
const numberFormatter = new Intl.NumberFormat("fa-IR");
const defaultLogo = "https://api.dicebear.com/9.x/shapes/svg?seed=propchi";

function getWebApp() {
  if (typeof window === "undefined") return undefined;
  return window.Telegram?.WebApp;
}

function getLaunchParams() {
  const hash = typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "";
  const search = typeof window !== "undefined" ? window.location.search.replace(/^\?/, "") : "";
  for (const value of [hash, search].filter(Boolean)) {
    const params = new URLSearchParams(value);
    const tgWebAppData = params.get("tgWebAppData");
    if (tgWebAppData) return decodeURIComponent(tgWebAppData);
  }
  return "";
}

function getInitDataCandidate(webApp?: TelegramWebApp) { return webApp?.initData || getLaunchParams(); }

async function jsonFetch<T>(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = (await response.json()) as T & { error?: string; success?: boolean };
  if (!response.ok || data.success === false) throw new Error(data.error || "خطا در دریافت اطلاعات");
  return data;
}

async function requestProfile(initData: string) {
  return jsonFetch<ProfileResponse>(`${API_BASE_URL}/api/mini-app/profile`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData }) });
}
async function saveProfile(initData: string, payload: { firstName: string; lastName: string; phoneNumber: string }) {
  return jsonFetch<ProfileResponse>(`${API_BASE_URL}/api/mini-app/profile`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData, ...payload }) });
}
async function requestAppData() { return jsonFetch<AppDataResponse>(`${API_BASE_URL}/api/mini-app/app-data`); }
async function requestDiscounts(propFirmId: number) { return jsonFetch<DiscountsResponse>(`${API_BASE_URL}/api/mini-app/prop-firms/${propFirmId}/discounts`); }
async function registerDiscountClick(initData: string, discountCodeId: number) {
  return jsonFetch<{ success: boolean; discount: DiscountCode }>(`${API_BASE_URL}/api/mini-app/discount-click`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ initData, discountCodeId }) });
}

function normalizeIranPhone(value: string) {
  const compact = value.trim().replace(/[\s\-()]/g, "");
  if (compact.startsWith("+98")) return `0${compact.slice(3)}`;
  if (compact.startsWith("0098")) return `0${compact.slice(4)}`;
  if (compact.startsWith("98")) return `0${compact.slice(2)}`;
  return compact;
}

export default function TelegramMiniAppPage() {
  const [initData, setInitData] = useState("");
  const [user, setUser] = useState<MiniAppUser | null>(null);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [settings, setSettings] = useState<MiniAppSettings>({ siteUrl: "", profileCompletionPoints: 50 });
  const [propFirms, setPropFirms] = useState<PropFirm[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("profile");
  const [selectedFirm, setSelectedFirm] = useState<PropFirm | null>(null);
  const [discounts, setDiscounts] = useState<DiscountCode[]>([]);
  const [discountLoading, setDiscountLoading] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState<{ text: string; reward: number } | null>(null);
  const [toast, setToast] = useState("");

  const navItems = useMemo(() => [
    { key: "profile" as const, label: "پروفایل", icon: User, visible: true },
    { key: "firms" as const, label: "پراپ فرم‌ها", icon: Building2, visible: true },
    { key: "invite" as const, label: "دعوت دوستان", icon: Gift, visible: true },
    { key: "site" as const, label: "سایت", icon: Globe2, visible: Boolean(settings.siteUrl) },
  ].filter((item) => item.visible), [settings.siteUrl]);
  const isComplete = Boolean(user?.profileCompleted);

  useEffect(() => {
    let cancelled = false;
    let elapsed = 0;
    const bootstrap = async () => {
      const webApp = getWebApp();
      webApp?.ready?.(); webApp?.expand?.();
      const candidate = getInitDataCandidate(webApp);
      if (!candidate && elapsed < MAX_INIT_DATA_WAIT_MS) { elapsed += INIT_DATA_RETRY_MS; window.setTimeout(bootstrap, INIT_DATA_RETRY_MS); return; }
      if (!candidate) { if (!cancelled) { setError(DEBUG_MINI_APP ? "initData تلگرام دریافت نشد." : "لطفاً Mini App را از داخل ربات تلگرام باز کنید."); setLoading(false); } return; }
      try {
        const [profile, appData] = await Promise.all([requestProfile(candidate), requestAppData()]);
        if (cancelled) return;
        setInitData(candidate); setUser(profile.user); setReferralStats(profile.referralStats || null);
        setFirstName(profile.user.profileCompleted ? profile.user.firstName || "" : "");
        setLastName(profile.user.profileCompleted ? profile.user.lastName || "" : "");
        setPhoneNumber(profile.user.phoneNumber || "");
        setSettings(appData.settings); setPropFirms(appData.propFirms);
      } catch (err) { if (!cancelled) setError(err instanceof Error ? err.message : "خطا در دریافت اطلاعات"); }
      finally { if (!cancelled) setLoading(false); }
    };
    window.setTimeout(bootstrap, 0);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { if (activeTab === "site" && !settings.siteUrl) setActiveTab("profile"); }, [activeTab, settings.siteUrl]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(""), 2200); return () => window.clearTimeout(t); }, [toast]);

  const submit = async (event?: FormEvent) => {
    event?.preventDefault(); if (!initData) return;
    setSaving(true); setError(""); setSuccess(null);
    try {
      const response = await saveProfile(initData, { firstName, lastName, phoneNumber: normalizeIranPhone(phoneNumber) });
      setUser(response.user); setReferralStats(response.referralStats || referralStats); setPhoneNumber(response.user.phoneNumber || normalizeIranPhone(phoneNumber)); setIsEditingProfile(false);
      setSuccess({ text: "اطلاعات شما با موفقیت ثبت شد.", reward: response.rewardPoints || 0 });
    } catch (err) { setError(err instanceof Error ? err.message : "خطا در ذخیره اطلاعات"); }
    finally { setSaving(false); }
  };

  const requestTelegramContact = () => {
    const webApp = getWebApp();
    if (!webApp?.requestContact) { setError("نسخه تلگرام شما از اشتراک مستقیم شماره پشتیبانی نمی‌کند؛ شماره را دستی وارد کنید."); return; }
    webApp.requestContact((shared, result) => {
      if (!shared) return;
      try { const contact = result?.response ? JSON.parse(result.response) : null; if (contact?.phone_number) setPhoneNumber(normalizeIranPhone(contact.phone_number)); }
      catch { setError("شماره دریافت شد اما قابل پردازش نبود؛ لطفاً دستی وارد کنید."); }
    });
  };

  const openDiscounts = async (firm: PropFirm) => {
    setSelectedFirm(firm); setDiscounts([]); setDiscountLoading(true);
    try { setDiscounts((await requestDiscounts(firm.id)).items); }
    catch (err) { setError(err instanceof Error ? err.message : "خطا در دریافت تخفیف‌ها"); }
    finally { setDiscountLoading(false); }
  };

  const openDiscount = async (discount: DiscountCode) => {
    try { await registerDiscountClick(initData, discount.id); } catch {}
    if (discount.affiliateLink) window.open(discount.affiliateLink, "_blank", "noopener,noreferrer");
  };

  const copyText = async (text: string, message: string) => { await navigator.clipboard.writeText(text); setToast(message); };

  return (
    <main dir="rtl" className="min-h-screen overflow-hidden bg-[color:var(--tg-theme-bg-color,#f4f7fb)] text-[color:var(--tg-theme-text-color,#0f172a)] transition-colors dark:bg-[#07111f] dark:text-white">
      <div className="fixed inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(56,189,248,.30),transparent_32%),radial-gradient(circle_at_100%_10%,rgba(168,85,247,.24),transparent_30%),radial-gradient(circle_at_0%_100%,rgba(16,185,129,.20),transparent_26%)]" />
      <div className="fixed inset-0 backdrop-blur-[1.5px]" />
      <section className="relative mx-auto flex min-h-screen w-full max-w-md flex-col px-4 pb-28 pt-5">
        <header className="glass-card mb-4 flex items-center justify-between p-4">
          <div><p className="flex items-center gap-1 text-xs font-bold text-sky-500 dark:text-sky-200"><Sparkles className="h-4 w-4" /> Propchi Mini App</p><h1 className="mt-1 text-2xl font-black">پراپچی پریمیوم</h1></div>
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-sky-300/80 to-violet-400/80 text-white shadow-2xl shadow-sky-500/30"><Sparkles className="h-7 w-7" /></div>
        </header>
        {loading ? <Skeleton /> : error && !user ? <FriendlyError error={error} /> : user ? (
          <div className="animate-soft-in">
            {activeTab === "profile" && <ProfileView user={user} firstName={firstName} lastName={lastName} phoneNumber={phoneNumber} saving={saving} isComplete={isComplete} success={success} error={error} isEditing={isEditingProfile} profileCompletionPoints={settings.profileCompletionPoints} onEdit={() => setIsEditingProfile(true)} onFirstName={setFirstName} onLastName={setLastName} onPhone={setPhoneNumber} onSubmit={submit} onContact={requestTelegramContact} />}
            {activeTab === "firms" && <PropFirmsView propFirms={propFirms} onCopyDiscount={(code) => copyText(code, "کد تخفیف کپی شد")} />}
            {activeTab === "invite" && <InviteView stats={referralStats} user={user} onCopy={(link) => copyText(link, "لینک دعوت کپی شد")} />}
            {activeTab === "site" && settings.siteUrl && <SiteView siteUrl={settings.siteUrl} />}
          </div>
        ) : null}
      </section>
      <nav className="fixed inset-x-0 bottom-0 z-20 mx-auto max-w-md px-4 pb-4"><div className="glass-nav grid gap-2 p-2" style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}>{navItems.map((item) => { const Icon = item.icon; const active = activeTab === item.key; return <button key={item.key} onClick={() => setActiveTab(item.key)} className={`rounded-2xl px-2 py-3 text-[11px] font-black transition ${active ? "bg-white/45 text-sky-700 shadow-lg shadow-sky-500/20 dark:bg-white/20 dark:text-sky-100" : "text-slate-500 dark:text-white/65"}`}><Icon className="mx-auto mb-1 h-5 w-5" />{item.label}</button>; })}</div></nav>
      {selectedFirm && <DiscountSheet firm={selectedFirm} discounts={discounts} loading={discountLoading} onClose={() => setSelectedFirm(null)} onOpen={openDiscount} />}
      {toast && <div className="fixed inset-x-4 bottom-24 z-40 mx-auto max-w-sm rounded-3xl bg-slate-950/85 px-4 py-3 text-center text-sm font-black text-white shadow-2xl backdrop-blur-xl">{toast}</div>}
    </main>
  );
}

function ProfileView(props: { user: MiniAppUser; firstName: string; lastName: string; phoneNumber: string; saving: boolean; isComplete: boolean; success: { text: string; reward: number } | null; error: string; isEditing: boolean; profileCompletionPoints: number; onEdit: () => void; onFirstName: (v: string) => void; onLastName: (v: string) => void; onPhone: (v: string) => void; onSubmit: (e?: FormEvent) => void; onContact: () => void }) {
  return <div className="space-y-4"><div className="glass-card p-4"><div className="grid grid-cols-2 gap-3"><Metric label="نام" value={props.user.firstName || "ثبت نشده"} /><Metric label="نام خانوادگی" value={props.user.lastName || "ثبت نشده"} /><Metric label="شماره موبایل" value={props.user.phoneNumber || "ثبت نشده"} ltr /><Metric label="دعوت‌ها" value={`${numberFormatter.format(props.user.totalReferrals)} نفر`} /></div><div className="mt-4 rounded-[1.7rem] border border-white/25 bg-gradient-to-l from-sky-400/25 to-violet-500/25 p-4"><p className="text-sm text-sky-700 dark:text-sky-100">امتیاز فعلی</p><p className="mt-1 text-4xl font-black">{numberFormatter.format(props.user.points)}</p><p className="mt-2 text-sm font-bold">{props.isComplete ? "پروفایل تکمیل شده است" : "برای دریافت پاداش، پروفایل را تکمیل کنید"}</p></div></div>{!props.isComplete && <div className="glass-card border-amber-200/60 bg-amber-300/20 p-4"><Gift className="mb-2 h-6 w-6 text-amber-500" /><p className="text-lg font-black">با تکمیل پروفایل</p><p className="mt-1 text-sm font-bold text-slate-600 dark:text-white/70">{numberFormatter.format(props.profileCompletionPoints)} امتیاز دریافت می‌کنید</p></div>}{props.success && <div className="glass-card border-emerald-300/50 bg-emerald-400/15 p-4 text-sm font-bold text-emerald-700 dark:text-emerald-100"><CheckCircle2 className="mb-2 h-5 w-5" />{props.success.text}{props.success.reward > 0 && <p className="mt-1">🏆 {numberFormatter.format(props.success.reward)} امتیاز اضافه شد.</p>}</div>}{props.error && <div className="glass-card border-red-300/50 bg-red-400/15 p-4 text-sm font-bold text-red-700 dark:text-red-100">{props.error}</div>}<button type="button" onClick={props.onEdit} className="liquid-button w-full">ویرایش پروفایل</button>{props.isEditing && <form onSubmit={props.onSubmit} className="glass-card space-y-3 p-4"><Input label="نام" value={props.firstName} onChange={props.onFirstName} placeholder="مثلاً علی" /><Input label="نام خانوادگی" value={props.lastName} onChange={props.onLastName} placeholder="مثلاً رضایی" /><Input label="شماره موبایل ایران" value={props.phoneNumber} onChange={props.onPhone} placeholder="09123456789" ltr inputMode="tel" /><button type="button" onClick={props.onContact} className="liquid-button-secondary w-full">اشتراک شماره تلگرام</button><button disabled={props.saving} className="liquid-button w-full">{props.saving ? <Loader2 className="mx-auto h-5 w-5 animate-spin" /> : "ذخیره پروفایل"}</button></form>}</div>;
}

function InviteView({ stats, user, onCopy }: { stats: ReferralStats | null; user: MiniAppUser; onCopy: (link: string) => void }) {
  const link = stats?.referralLink || `https://t.me/BOT_USERNAME?start=${user.id}`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent("با لینک من وارد پراپچی شو و امتیاز بگیر 🎁")}`;
  return <div className="space-y-4"><SectionTitle icon={Gift} title="دعوت دوستان" subtitle="لینک اختصاصی خود را کپی یا مستقیم در تلگرام اشتراک‌گذاری کنید." /><div className="glass-card p-5"><p className="text-xs font-bold text-slate-500 dark:text-white/60">لینک دعوت</p><p dir="ltr" className="mt-2 break-all rounded-3xl border border-dashed border-white/40 bg-white/35 px-3 py-3 text-sm font-black dark:bg-black/15">{link}</p><button onClick={() => onCopy(link)} className="liquid-button mt-4 w-full"><Copy className="h-5 w-5" /> کپی لینک</button></div><div className="grid grid-cols-2 gap-3"><Metric label="تعداد کل دعوت‌ها" value={numberFormatter.format(stats?.inviteCount ?? user.totalReferrals ?? 0)} /><Metric label="امتیاز دعوت" value={numberFormatter.format(stats?.totalRewardPoints ?? 0)} /><Metric label="دعوت موفق" value={numberFormatter.format(stats?.successfulInvites ?? stats?.inviteCount ?? 0)} /><Metric label="رتبه کاربر" value={stats?.rank ? numberFormatter.format(stats.rank) : "—"} /></div><a href={shareUrl} target="_blank" rel="noreferrer" className="liquid-button w-full"><Share2 className="h-5 w-5" /> دعوت از دوستان</a></div>;
}

function PropFirmLogo({ firm }: { firm: PropFirm }) {
  const [src, setSrc] = useState(firm.logoUrl || defaultLogo);
  return <Image src={src} alt={firm.name} width={72} height={72} className="h-full w-full object-cover" unoptimized onError={() => setSrc(defaultLogo)} />;
}

function PropFirmsView({ propFirms, onCopyDiscount }: { propFirms: PropFirm[]; onCopyDiscount: (code: string) => void }) {
  return <div className="space-y-4"><SectionTitle icon={Building2} title="پراپ فرم‌های تایید شده" subtitle="لوگو، توضیحات و دکمه‌های هر پراپ هوشمند نمایش داده می‌شوند." />{propFirms.length ? propFirms.map((firm) => { const featured = firm.discountCodes?.[0]; return <article key={firm.id} className="glass-card overflow-hidden p-4"><div className="flex gap-3"><div className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-3xl border border-white/30 bg-white/35 dark:bg-white/10"><PropFirmLogo firm={firm} /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h3 className="truncate text-lg font-black">{firm.name}</h3><span className="rounded-full bg-emerald-400/20 px-3 py-1 text-[11px] font-black text-emerald-600 dark:text-emerald-200">تایید شده</span></div><p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600 dark:text-white/70">{firm.description || "توضیح کوتاه برای این پراپ فرم ثبت نشده است."}</p></div></div><div className="mt-4 grid gap-2">{firm.websiteUrl && <a href={firm.websiteUrl} target="_blank" rel="noreferrer" className="liquid-button"><ShoppingBag className="h-4 w-4" /> خرید پراپ</a>}{featured?.code && <button onClick={() => onCopyDiscount(featured.code)} className="liquid-button-secondary"><TicketPercent className="h-4 w-4" /> کد تخفیف</button>}{firm.reviewLink && <a href={firm.reviewLink} target="_blank" rel="noreferrer" className="liquid-button-secondary text-center"><ExternalLink className="h-4 w-4" /> بررسی پراپ</a>}</div></article>; }) : <EmptyState text="هنوز پراپ فرم فعالی ثبت نشده است." />}</div>;
}

function SiteView({ siteUrl }: { siteUrl: string }) { return <div className="space-y-4"><SectionTitle icon={Globe2} title="سایت پراپچی" subtitle="آدرس این بخش از تنظیمات پنل ادمین خوانده می‌شود." /><div className="glass-card p-5 text-center"><Globe2 className="mx-auto h-14 w-14 text-sky-500" /><h2 className="mt-3 text-xl font-black">ورود به سایت</h2><p dir="ltr" className="mt-2 break-all text-sm text-slate-500 dark:text-white/60">{siteUrl}</p><a href={siteUrl} target="_blank" rel="noreferrer" className="liquid-button mt-5 w-full"><ExternalLink className="h-5 w-5" /> باز کردن سایت</a></div></div>; }

function DiscountSheet({ firm, discounts, loading, onClose, onOpen }: { firm: PropFirm; discounts: DiscountCode[]; loading: boolean; onClose: () => void; onOpen: (discount: DiscountCode) => void }) { return <div className="fixed inset-0 z-30 flex items-end bg-slate-950/45 p-3 backdrop-blur-sm"><div className="glass-sheet max-h-[82vh] w-full overflow-auto p-4"><div className="mb-4 flex items-center justify-between"><div><p className="text-xs font-bold text-sky-500 dark:text-sky-200">کدهای تخفیف</p><h2 className="text-xl font-black">{firm.name}</h2></div><button onClick={onClose} className="rounded-2xl bg-white/30 p-2 dark:bg-white/10"><X className="h-5 w-5" /></button></div>{loading ? <Skeleton compact /> : discounts.length ? <div className="space-y-3">{discounts.map((discount) => <div key={discount.id} className="rounded-3xl border border-white/25 bg-white/35 p-4 dark:bg-white/10"><div className="flex items-center justify-between"><h3 className="font-black">{discount.title}</h3><span className="rounded-full bg-sky-400/20 px-3 py-1 text-xs font-black text-sky-700 dark:text-sky-100">{numberFormatter.format(discount.discountPercent)}٪</span></div><p dir="ltr" className="mt-3 rounded-2xl border border-dashed border-white/40 bg-white/30 px-3 py-2 text-center font-mono text-lg font-black tracking-widest dark:bg-black/20">{discount.code}</p><button onClick={() => onOpen(discount)} className="liquid-button mt-3 w-full" disabled={!discount.affiliateLink}>{discount.affiliateLink ? "خرید با این کد" : "لینک خرید ثبت نشده"}</button></div>)}</div> : <EmptyState text="برای این پراپ فرم کد تخفیف فعالی وجود ندارد." />}</div></div>; }
function SectionTitle({ icon: Icon, title, subtitle }: { icon: typeof User; title: string; subtitle: string }) { return <div className="glass-card p-4"><div className="flex items-center gap-3"><div className="rounded-2xl bg-sky-400/20 p-3 text-sky-600 dark:text-sky-100"><Icon className="h-6 w-6" /></div><div><h2 className="text-xl font-black">{title}</h2><p className="mt-1 text-xs leading-5 text-slate-500 dark:text-white/60">{subtitle}</p></div></div></div>; }
function Metric({ label, value, ltr = false }: { label: string; value: string; ltr?: boolean }) { return <div className="rounded-3xl border border-white/25 bg-white/35 p-3 dark:bg-white/10"><p className="text-[11px] font-bold text-slate-500 dark:text-white/55">{label}</p><p dir={ltr ? "ltr" : "rtl"} className="mt-1 min-h-5 truncate text-sm font-black">{value || "—"}</p></div>; }
function Input({ label, value, onChange, placeholder, ltr = false, inputMode }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; ltr?: boolean; inputMode?: "tel" }) { return <label className="block text-sm font-bold"><span>{label}</span><input dir={ltr ? "ltr" : "rtl"} className="mt-2 w-full rounded-3xl border border-white/25 bg-white/45 px-4 py-3 text-slate-900 outline-none ring-sky-300 transition placeholder:text-slate-400 focus:ring-2 dark:bg-white/10 dark:text-white" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} inputMode={inputMode} required /></label>; }
function Skeleton({ compact = false }: { compact?: boolean }) { return <div className="space-y-3">{Array.from({ length: compact ? 2 : 4 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded-[2rem] border border-white/20 bg-white/25 dark:bg-white/10" />)}</div>; }
function FriendlyError({ error }: { error: string }) { return <div className="glass-card p-5 text-center"><Info className="mx-auto h-12 w-12 text-sky-500" /><h2 className="mt-3 text-xl font-black">نمایش Mini App ممکن نشد</h2><p className="mt-3 text-sm leading-7 text-slate-600 dark:text-white/70">{error}</p></div>; }
function EmptyState({ text }: { text: string }) { return <div className="glass-card p-5 text-center text-sm font-bold text-slate-500 dark:text-white/60">{text}</div>; }
