"use client";

import { BRAND_NAME } from "@/config/brand";
import Link from "next/link";
import { motion, useInView, useMotionValue, useSpring, useTransform, animate } from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  BarChart3,
  Bot,
  BrainCircuit,
  CheckCircle2,
  Clock3,
  FileSearch,
  Gauge,
  Globe2,
  Layers3,
  LockKeyhole,
  MessageSquareText,
  Radar,
  SearchCheck,
  ShieldCheck,
  Sparkles,
  TimerReset,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useEffect, useRef, type ElementType } from "react";

const fadeUp = {
  hidden: { opacity: 0, y: 36 },
  visible: { opacity: 1, y: 0 },
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1, delayChildren: 0.12 } },
};

const trustCards = [
  { title: "تحلیل هوشمند قوانین", text: "قوانین پیچیده را به نکات قابل تصمیم‌گیری تبدیل کنید.", icon: BrainCircuit },
  { title: "مقایسه پراپ فرم‌ها", text: "برنامه‌ها را با معیارهای مهم معامله‌گری کنار هم ببینید.", icon: BarChart3 },
  { title: "تحلیل PDF", text: "اسناد طولانی را بارگذاری کنید و خلاصه دقیق بگیرید.", icon: FileSearch },
  { title: "استخراج اطلاعات سایت‌ها", text: "از صفحات پراپ فرم‌ها داده ساختاریافته استخراج کنید.", icon: Globe2 },
  { title: "پاسخ‌گویی هوشمند", text: "سوال‌های تخصصی خود را با زبان ساده بپرسید.", icon: MessageSquareText },
];

const features = [
  { title: "تحلیل قوانین", text: "حد ضرر روزانه، تارگت، قوانین خبر و شرایط برداشت را به شکل ساختاریافته بررسی کنید.", icon: ShieldCheck },
  { title: "مقایسه پراپ فرم‌ها", text: "چند شرکت را بر اساس تقسیم سود، دراودان، محدودیت‌ها و کیفیت چالش مقایسه کنید.", icon: Layers3 },
  { title: "تحلیل PDF", text: "قوانین فایل‌های طولانی را بدون خواندن دستی استخراج، خلاصه و قابل جست‌وجو کنید.", icon: FileSearch },
  { title: "استخراج اطلاعات وب‌سایت", text: "از صفحات قوانین و پرسش‌های پرتکرار، داده دقیق و قابل استناد دریافت کنید.", icon: Globe2 },
  { title: "پاسخ‌گویی هوشمند", text: "از دستیار هوشمند بپرسید کدام قانون برای سبک معاملاتی شما ریسک بیشتری دارد.", icon: Bot },
  { title: "خلاصه‌سازی قوانین", text: "قوانین طولانی به خلاصه‌های کوتاه، قابل فهم و مناسب تصمیم‌گیری تبدیل می‌شوند.", icon: SearchCheck },
  { title: "کشف محدودیت‌های پنهان", text: "بندهای حساس مانند ثبات حجم، معامله در خبر و محدودیت زمان نگهداری سریع‌تر دیده می‌شوند.", icon: Radar },
  { title: "تحلیل چالش‌های معاملاتی", text: "قبل از خرید چالش، سازگاری قوانین با ریسک‌پذیری و استراتژی خود را بسنجید.", icon: TrendingUp },
];

const benefits = [
  { value: 80, suffix: "٪", title: "صرفه‌جویی در زمان", text: "کاهش زمان خواندن قوانین و اسناد پراپ فرم‌ها", icon: Clock3 },
  { value: 12, suffix: "برابر", title: "سرعت بیشتر تحقیق", text: "جمع‌آوری و مقایسه اطلاعات با سرعت بسیار بالاتر", icon: Zap },
  { value: 60, suffix: "ثانیه", title: "تحلیل سریع قوانین", text: "دریافت خروجی اولیه و ساختاریافته در کمتر از چند دقیقه", icon: TimerReset },
  { value: 24, suffix: "/۷", title: "دسترسی دائمی", text: "پرسش و پاسخ هوشمند در هر زمان و از هر دستگاه", icon: Gauge },
];

const comparison = [
  { firm: "زورا اف‌ایکس", profit: "تا ۹۰٪", drawdown: "۱۰٪ کل", news: "مجاز با محدودیت", consistency: "نیازمند بررسی" },
  { firm: "آلفا کپیتال", profit: "۸۰٪", drawdown: "۸٪ کل", news: "غیرمجاز در بازه خبر", consistency: "دارد" },
  { firm: "فاندد تریدر", profit: "تا ۸۵٪", drawdown: "۱۲٪ کل", news: "بسته به حساب", consistency: "ندارد" },
];

const advanced = [
  { title: "تحلیل PDF", text: "آپلود سند، استخراج بندهای مهم و نمایش خلاصه قابل اعتماد.", icon: FileSearch },
  { title: "استخراج اطلاعات سایت", text: "خواندن صفحات قوانین و تبدیل آن‌ها به جدول تصمیم‌گیری.", icon: Globe2 },
  { title: "مقایسه قوانین", text: "مقایسه هم‌زمان چند پراپ فرم با معیارهای قابل تنظیم.", icon: BarChart3 },
  { title: "تحقیقات هوشمند", text: "تبدیل تحقیق پراکنده به مسیر منظم و قابل پیگیری.", icon: BrainCircuit },
  { title: "جست‌وجوی هوشمند", text: "پیدا کردن بندهای حساس بدون گشتن میان ده‌ها صفحه.", icon: SearchCheck },
  { title: "تحلیل اسناد", text: "درک زبان حقوقی و معاملاتی اسناد با توضیح فارسی روان.", icon: Layers3 },
];

const testimonials = [
  { name: "آرمان رضایی", role: "معامله‌گر چالش دو مرحله‌ای", quote: "قبل از خرید چالش، قوانین خبر و دراودان را در چند دقیقه فهمیدم و از یک انتخاب اشتباه جلوگیری شد." },
  { name: "نگار احمدی", role: "تریدر روزانه", quote: `${BRAND_NAME} بندهایی را پیدا کرد که در صفحه قوانین پنهان مانده بود. خروجی فارسی و ساختاریافته دقیقاً همان چیزی بود که نیاز داشتم.` },
  { name: "سامان کاظمی", role: "تحلیل‌گر بازار", quote: "برای مقایسه چند پراپ فرم دیگر لازم نیست ده‌ها تب مرورگر باز کنم. نتیجه سریع، واضح و قابل ارائه است." },
];

function PersianCounter({ value, suffix }: { value: number; suffix: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  const count = useMotionValue(0);
  const rounded = useTransform(count, (latest) => Math.round(latest).toLocaleString("fa-IR"));

  useEffect(() => {
    if (!inView) return;
    const controls = animate(count, value, { duration: 1.8, ease: "easeOut" });
    return controls.stop;
  }, [count, inView, value]);

  return (
    <span ref={ref} className="tabular-nums">
      <motion.span>{rounded}</motion.span>
      {suffix}
    </span>
  );
}

function MagneticOrb() {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const springX = useSpring(x, { stiffness: 60, damping: 18 });
  const springY = useSpring(y, { stiffness: 60, damping: 18 });

  return (
    <motion.div
      aria-hidden="true"
      onMouseMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        x.set((event.clientX - rect.left - rect.width / 2) / 18);
        y.set((event.clientY - rect.top - rect.height / 2) / 18);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      style={{ x: springX, y: springY }}
      className="pointer-events-auto absolute left-4 top-28 hidden h-64 w-64 rounded-full bg-gradient-to-br from-cyan-400/25 via-blue-500/10 to-fuchsia-500/20 blur-2xl lg:block"
    />
  );
}

export default function HomeLandingPage() {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: BRAND_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "وب",
    inLanguage: "fa-IR",
    description: "دستیار هوش مصنوعی فارسی برای تحلیل قوانین، مقایسه پراپ فرم‌ها، تحلیل PDF و تحقیق سریع‌تر معامله‌گران پراپ.",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  };

  return (
    <main dir="rtl" className="min-h-screen overflow-hidden bg-[#050812] text-white selection:bg-cyan-400/30 selection:text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />

      <section className="relative flex min-h-screen items-center justify-center px-5 py-28 sm:px-8 lg:px-10" aria-labelledby="hero-title">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(34,211,238,0.18),transparent_30%),radial-gradient(circle_at_80%_10%,rgba(99,102,241,0.22),transparent_34%),radial-gradient(circle_at_50%_90%,rgba(14,165,233,0.16),transparent_34%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(circle_at_center,black,transparent_72%)]" />
        <motion.div animate={{ y: [0, -18, 0], rotate: [0, 4, 0] }} transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }} className="absolute right-6 top-28 h-24 w-24 rounded-3xl border border-white/10 bg-white/[0.04] shadow-2xl shadow-cyan-500/10 backdrop-blur-xl sm:right-16" />
        <motion.div animate={{ y: [0, 22, 0], rotate: [0, -5, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }} className="absolute bottom-28 left-8 h-32 w-32 rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] shadow-2xl shadow-blue-500/20 backdrop-blur-2xl sm:left-24" />
        <MagneticOrb />

        <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <motion.div initial="hidden" animate="visible" variants={stagger} className="text-center lg:text-right">
            <motion.div variants={fadeUp} className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-white/[0.06] px-4 py-2 text-sm text-cyan-100 shadow-lg shadow-cyan-500/5 backdrop-blur-xl lg:mx-0">
              <Sparkles className="h-4 w-4 text-cyan-300" />
              دستیار تحقیقاتی هوشمند برای معامله‌گران پراپ
            </motion.div>
            <motion.h1 id="hero-title" variants={fadeUp} className="text-balance text-5xl font-black leading-tight tracking-tight sm:text-6xl lg:text-7xl xl:text-8xl">
              هوش مصنوعی مخصوص <span className="bg-gradient-to-l from-cyan-200 via-blue-300 to-violet-300 bg-clip-text text-transparent">معامله‌گران پراپ</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="mx-auto mt-7 max-w-3xl text-pretty text-lg leading-9 text-slate-300 sm:text-xl lg:mx-0">
              قوانین پراپ فرم‌ها را در چند ثانیه تحلیل کنید، مقایسه کنید و پاسخ سوالات خود را از هوش مصنوعی دریافت کنید.
            </motion.p>
            <motion.div variants={fadeUp} className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row lg:justify-start">
              <Link href="/login" className="group inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl bg-white px-7 py-4 text-base font-bold text-slate-950 shadow-2xl shadow-cyan-500/20 transition hover:-translate-y-1 hover:bg-cyan-100">
                شروع رایگان
                <ArrowLeft className="h-5 w-5 transition group-hover:-translate-x-1" />
              </Link>
              <a href="#features" className="inline-flex min-h-12 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.04] px-7 py-4 text-base font-bold text-white backdrop-blur-xl transition hover:-translate-y-1 hover:border-cyan-300/40 hover:bg-white/[0.08]">
                مشاهده امکانات
              </a>
            </motion.div>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.94, y: 36 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ duration: 0.9, delay: 0.2 }} className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-6 rounded-[2.5rem] bg-gradient-to-br from-cyan-400/20 via-blue-500/10 to-violet-500/20 blur-2xl" />
            <div className="relative rounded-[2rem] border border-white/12 bg-slate-950/70 p-4 shadow-2xl shadow-blue-950/50 backdrop-blur-2xl">
              <div className="mb-4 flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3">
                <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-emerald-400" /><span className="text-sm text-slate-300">تحلیل زنده قوانین</span></div>
                <LockKeyhole className="h-4 w-4 text-cyan-300" />
              </div>
              <div className="space-y-4">
                <div className="mr-auto max-w-[82%] rounded-2xl rounded-tl-sm bg-white px-4 py-3 text-sm leading-7 text-slate-950 shadow-xl">قوانین زورا اف‌ایکس را بررسی کن</div>
                <div className="max-w-[92%] rounded-2xl rounded-tr-sm border border-cyan-300/15 bg-cyan-300/[0.07] p-4 text-sm leading-7 text-cyan-50">
                  <div className="mb-3 flex items-center gap-2 font-bold"><Bot className="h-4 w-4" /> تحلیل ساختاریافته آماده شد</div>
                  <ul className="space-y-2 text-slate-200">
                    <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /> تقسیم سود تا ۹۰٪ و نیازمند بررسی شرایط ارتقا</li>
                    <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-300" /> دراودان کل ۱۰٪ با حساسیت بالا روی ریسک روزانه</li>
                    <li className="flex gap-2"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-amber-300" /> معامله در خبر مجاز است اما محدودیت زمانی دارد</li>
                  </ul>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {["ریسک", "قوانین", "خلاصه"].map((item, index) => (
                    <motion.div key={item} animate={{ opacity: [0.55, 1, 0.55] }} transition={{ duration: 2.4, delay: index * 0.35, repeat: Infinity }} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-center text-xs text-slate-300">
                      {item}
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        <motion.a href="#trust" aria-label="رفتن به بخش بعدی" animate={{ y: [0, 10, 0] }} transition={{ duration: 1.8, repeat: Infinity }} className="absolute bottom-8 left-1/2 z-10 flex -translate-x-1/2 flex-col items-center gap-2 text-xs text-slate-400">
          ادامه بدهید
          <span className="flex h-11 w-7 items-start justify-center rounded-full border border-white/20 p-1"><ArrowDown className="h-4 w-4 text-cyan-200" /></span>
        </motion.a>
      </section>

      <motion.section id="trust" initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={stagger} className="relative mx-auto max-w-7xl px-5 py-20 sm:px-8 lg:px-10">
        <motion.div variants={fadeUp} className="mb-10 text-center">
          <p className="text-sm font-bold text-cyan-300">هر چیزی که برای تحقیق سریع‌تر نیاز دارید</p>
          <h2 className="mt-3 text-3xl font-black sm:text-5xl">از قوانین پیچیده تا تصمیم شفاف</h2>
        </motion.div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {trustCards.map((card) => <GlassCard key={card.title} {...card} compact />)}
        </div>
      </motion.section>

      <section id="features" className="relative px-5 py-24 sm:px-8 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(59,130,246,0.13),transparent_30%)]" />
        <div className="relative mx-auto max-w-7xl">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={stagger} className="mb-14 max-w-3xl">
            <motion.p variants={fadeUp} className="text-sm font-bold text-cyan-300">نمایش امکانات</motion.p>
            <motion.h2 variants={fadeUp} className="mt-3 text-4xl font-black leading-tight sm:text-6xl">تجربه‌ای شبیه یک تحلیل‌گر حرفه‌ای، همیشه کنار شما</motion.h2>
          </motion.div>
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={stagger} className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {features.map((feature) => <GlassCard key={feature.title} {...feature} />)}
          </motion.div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-24 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:px-10">
        <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={stagger}>
          <motion.p variants={fadeUp} className="text-sm font-bold text-cyan-300">دموی هوش مصنوعی</motion.p>
          <motion.h2 variants={fadeUp} className="mt-3 text-4xl font-black leading-tight sm:text-5xl">سوال بپرسید؛ پاسخ قابل اقدام دریافت کنید</motion.h2>
          <motion.p variants={fadeUp} className="mt-5 text-lg leading-9 text-slate-300">{BRAND_NAME} پاسخ‌ها را فقط خلاصه نمی‌کند؛ آن‌ها را دسته‌بندی، ریسک‌سنجی و برای تصمیم‌گیری معامله‌گر آماده می‌کند.</motion.p>
        </motion.div>
        <motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl">
          <div className="rounded-[1.5rem] bg-slate-950/80 p-5">
            <div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-4"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-300/10"><Bot className="h-5 w-5 text-cyan-200" /></span><div><p className="font-bold">دستیار {BRAND_NAME}</p><p className="text-xs text-slate-400">در حال تحلیل قوانین معاملاتی</p></div></div>
            <div className="space-y-4 text-sm leading-7">
              <div className="mr-auto w-fit max-w-[85%] rounded-2xl bg-white px-4 py-3 text-slate-950">قوانین زورا اف‌ایکس را بررسی کن</div>
              <div className="space-y-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4 text-slate-200">
                <p className="font-bold text-cyan-100">نتیجه تحلیل:</p>
                <p>این برنامه برای معامله‌گران منظم مناسب است، اما روی مدیریت دراودان و معامله هنگام خبر باید با احتیاط عمل شود.</p>
                <div className="grid gap-3 sm:grid-cols-3">
                  {['تقسیم سود بالا', 'ریسک خبر متوسط', 'دراودان حساس'].map((item) => <span key={item} className="rounded-xl bg-white/[0.05] px-3 py-2 text-center text-xs">{item}</span>)}
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={stagger} className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10">
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {benefits.map((item) => {
            const Icon = item.icon;
            return <motion.div variants={fadeUp} key={item.title} className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.025] p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl"><Icon className="mb-6 h-7 w-7 text-cyan-200" /><p className="text-4xl font-black text-white"><PersianCounter value={item.value} suffix={item.suffix} /></p><h3 className="mt-4 text-xl font-bold">{item.title}</h3><p className="mt-2 leading-7 text-slate-400">{item.text}</p></motion.div>;
          })}
        </div>
      </motion.section>

      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10">
        <SectionHeader eyebrow="مقایسه پراپ فرم‌ها" title="تصمیم‌گیری سریع‌تر با جدول شفاف قوانین" />
        <div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-blue-950/20 backdrop-blur-xl">
          <div className="grid grid-cols-5 gap-0 border-b border-white/10 bg-white/[0.06] p-4 text-sm font-bold text-cyan-100 max-md:hidden">
            <span>پراپ فرم</span><span>تقسیم سود</span><span>دراودان</span><span>معامله هنگام خبر</span><span>قوانین ثبات</span>
          </div>
          {comparison.map((row) => <div key={row.firm} className="grid gap-3 border-b border-white/10 p-4 text-sm last:border-0 md:grid-cols-5"><strong>{row.firm}</strong><span>{row.profit}</span><span>{row.drawdown}</span><span>{row.news}</span><span>{row.consistency}</span></div>)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10">
        <SectionHeader eyebrow="روش کار" title="سه قدم ساده تا تحلیل قابل اعتماد" />
        <div className="grid gap-5 md:grid-cols-3">
          {["سوال خود را بپرس", "هوش مصنوعی تحلیل می‌کند", "نتیجه را دریافت کن"].map((step, index) => <motion.div key={step} initial={{ opacity: 0, y: 28 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: index * 0.12 }} className="relative rounded-[2rem] border border-white/10 bg-white/[0.04] p-7 backdrop-blur-xl"><span className="mb-8 grid h-14 w-14 place-items-center rounded-2xl bg-cyan-300/10 text-2xl font-black text-cyan-100">{(index + 1).toLocaleString("fa-IR")}</span><h3 className="text-2xl font-bold">{step}</h3><p className="mt-3 leading-8 text-slate-400">مسیر تحقیق شما کوتاه، منظم و قابل پیگیری می‌شود.</p></motion.div>)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10">
        <SectionHeader eyebrow="امکانات پیشرفته" title="کارت‌های هوشمند برای هر مرحله تحقیق" />
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {advanced.map((feature) => <GlassCard key={feature.title} {...feature} />)}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10">
        <SectionHeader eyebrow="نظر معامله‌گران" title="اعتماد بیشتر قبل از انتخاب چالش" />
        <motion.div animate={{ x: [0, -24, 0] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} className="grid gap-5 md:grid-cols-3">
          {testimonials.map((item) => <article key={item.name} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl"><p className="leading-8 text-slate-200">«{item.quote}»</p><div className="mt-6 border-t border-white/10 pt-5"><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-sm text-cyan-200">{item.role}</p></div></article>)}
        </motion.div>
      </section>

      <section className="px-5 py-28 sm:px-8 lg:px-10">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-cyan-400/15 via-blue-500/10 to-violet-500/15 p-8 text-center shadow-2xl shadow-cyan-950/30 backdrop-blur-xl sm:p-14">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.18),transparent_32%)]" />
          <div className="relative">
            <h2 className="text-4xl font-black leading-tight sm:text-6xl">تحقیق چند ساعته را به چند ثانیه تبدیل کن</h2>
            <p className="mx-auto mt-5 max-w-2xl text-lg leading-9 text-slate-300">همین حالا با دستیار هوشمند {BRAND_NAME}، قوانین را دقیق‌تر بخوانید و با اطمینان بیشتری تصمیم بگیرید.</p>
            <Link href="/login" className="mt-9 inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-base font-black text-slate-950 shadow-2xl shadow-cyan-500/20 transition hover:-translate-y-1 hover:bg-cyan-100">شروع استفاده از {BRAND_NAME} <ArrowLeft className="h-5 w-5" /></Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={stagger} className="mb-12 text-center"><motion.p variants={fadeUp} className="text-sm font-bold text-cyan-300">{eyebrow}</motion.p><motion.h2 variants={fadeUp} className="mx-auto mt-3 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">{title}</motion.h2></motion.div>;
}

function GlassCard({ title, text, icon: Icon, compact = false }: { title: string; text: string; icon: ElementType; compact?: boolean }) {
  return <motion.article variants={fadeUp} whileHover={{ y: -8, scale: 1.015 }} transition={{ type: "spring", stiffness: 260, damping: 22 }} className={`group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.045] shadow-xl shadow-slate-950/20 backdrop-blur-xl ${compact ? "p-5" : "p-6"}`}><div className="absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.16),transparent_45%)]" /><div className="relative"><span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-300/15"><Icon className="h-6 w-6" /></span><h3 className="text-xl font-bold text-white">{title}</h3><p className="mt-3 leading-8 text-slate-400">{text}</p></div></motion.article>;
}
