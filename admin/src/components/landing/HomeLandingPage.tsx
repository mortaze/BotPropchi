"use client";

import Link from "next/link";
import {
  animate,
  motion,
  useInView,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type MotionValue,
} from "framer-motion";
import {
  ArrowDown,
  ArrowLeft,
  BarChart3,
  Bot,
  BrainCircuit,
  Clock3,
  FileSearch,
  FileText,
  Gauge,
  Globe2,
  Layers3,
  LockKeyhole,
  Radar,
  ShieldCheck,
  Sparkles,
  TimerReset,
  TrendingUp,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef } from "react";

const fadeUp = { hidden: { opacity: 0, y: 36 }, visible: { opacity: 1, y: 0 } };
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.1, delayChildren: 0.12 } } };

const features = [
  { title: "تحلیل قوانین", text: "حد ضرر روزانه، تارگت، قوانین خبر و شرایط برداشت در یک نقشه قابل تصمیم‌گیری قرار می‌گیرند.", icon: ShieldCheck },
  { title: "مقایسه پراپ فرم‌ها", text: "برنامه‌ها را بر اساس تقسیم سود، دراودان، محدودیت‌ها و کیفیت چالش در کنار هم ببینید.", icon: Layers3 },
  { title: "تحلیل PDF", text: "فایل‌های طولانی به بندهای مهم، هشدارها و خلاصه فارسی قابل جست‌وجو تبدیل می‌شوند.", icon: FileSearch },
  { title: "استخراج از وب‌سایت", text: "صفحات قوانین و پرسش‌های پرتکرار به داده‌های ساختاریافته و قابل استناد تبدیل می‌شوند.", icon: Globe2 },
  { title: "پاسخ‌گویی هوشمند", text: "از دستیار بپرسید کدام قانون برای سبک معاملاتی شما ریسک بیشتری ایجاد می‌کند.", icon: Bot },
  { title: "کشف محدودیت پنهان", text: "بندهای حساس مثل ثبات حجم، معامله در خبر و محدودیت نگهداری سریع‌تر دیده می‌شوند.", icon: Radar },
];

const benefits = [
  { value: 80, suffix: "٪", title: "زمان کمتر برای تحقیق", text: "خواندن دستی قوانین و اسناد طولانی به یک مسیر کوتاه تبدیل می‌شود.", icon: Clock3 },
  { value: 12, suffix: "برابر", title: "سرعت بیشتر در مقایسه", text: "اطلاعات پراکنده از چند منبع در یک نمای واحد کنار هم قرار می‌گیرد.", icon: Zap },
  { value: 60, suffix: "ثانیه", title: "خروجی اولیه سریع", text: "قبل از خرید چالش، تصویر واضح‌تری از ریسک و شرایط دریافت می‌کنید.", icon: TimerReset },
  { value: 24, suffix: "/۷", title: "دستیار همیشه آماده", text: "در هر مرحله از تحقیق، سوال خود را فارسی بپرسید و جواب قابل اقدام بگیرید.", icon: Gauge },
];

const comparison = [
  { firm: "زورا اف‌ایکس", profit: "تا ۹۰٪", drawdown: "۱۰٪ کل", news: "مجاز با محدودیت", consistency: "نیازمند بررسی" },
  { firm: "آلفا کپیتال", profit: "۸۰٪", drawdown: "۸٪ کل", news: "غیرمجاز در بازه خبر", consistency: "دارد" },
  { firm: "فاندد تریدر", profit: "تا ۸۵٪", drawdown: "۱۲٪ کل", news: "بسته به حساب", consistency: "ندارد" },
];

const testimonials = [
  { name: "آرمان رضایی", role: "معامله‌گر چالش دو مرحله‌ای", quote: "قبل از خرید چالش، قوانین خبر و دراودان را در چند دقیقه فهمیدم و از یک انتخاب اشتباه جلوگیری شد." },
  { name: "نگار احمدی", role: "تریدر روزانه", quote: "پراپچی بندهایی را پیدا کرد که در صفحه قوانین پنهان مانده بود. خروجی فارسی و ساختاریافته دقیقاً همان چیزی بود که نیاز داشتم." },
  { name: "سامان کاظمی", role: "تحلیل‌گر بازار", quote: "برای مقایسه چند پراپ فرم دیگر لازم نیست ده‌ها تب مرورگر باز کنم. نتیجه سریع، واضح و قابل ارائه است." },
];

const chaosFragments = [
  "حد ضرر روزانه ۴٪", "قانون ثبات حجم", "برداشت بعد از ۱۴ روز", "خبر NFP ممنوع", "تارگت مرحله اول ۸٪", "تقسیم سود ۸۵٪", "حداقل روز معاملاتی", "ریسک شناور", "کپی ترید مجاز؟", "آخر هفته باز بماند؟", "اسکلپ محدود", "قانون IP", "دراودان نسبی", "حساب آزمایشی", "تایید KYC", "برداشت اول",
];

const organizedInsights = [
  { label: "ریسک اصلی", value: "دراودان نسبی و معامله هنگام خبر" },
  { label: "مناسب برای", value: "معامله‌گر منظم با حجم ثابت" },
  { label: "قبل از خرید", value: "قانون برداشت اول و محدودیت خبر را بررسی کن" },
  { label: "خلاصه تصمیم", value: "قابل قبول، اما برای استراتژی پرنوسان حساس است" },
];

const sourceNodes = [
  { title: "PDF", icon: FileText, orbit: "right-[10%] top-[14%]", float: -12 },
  { title: "وب‌سایت", icon: Globe2, orbit: "left-[12%] top-[18%]", float: 12 },
  { title: "قوانین", icon: ShieldCheck, orbit: "right-[6%] bottom-[20%]", float: 10 },
  { title: "چالش‌ها", icon: TrendingUp, orbit: "left-[8%] bottom-[22%]", float: -10 },
  { title: "پراپ فرم‌ها", icon: Layers3, orbit: "left-1/2 top-[7%] -translate-x-1/2", float: -14 },
  { title: "برنامه‌های فاندینگ", icon: BarChart3, orbit: "left-1/2 bottom-[9%] -translate-x-1/2", float: 14 },
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

  return <span ref={ref} className="tabular-nums"><motion.span>{rounded}</motion.span>{suffix}</span>;
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
      onMouseLeave={() => { x.set(0); y.set(0); }}
      style={{ x: springX, y: springY }}
      className="pointer-events-auto absolute left-4 top-28 hidden h-64 w-64 rounded-full bg-gradient-to-br from-cyan-400/25 via-blue-500/10 to-fuchsia-500/20 blur-2xl lg:block"
    />
  );
}

type Particle = { x: number; y: number; vx: number; vy: number; size: number; hue: number; phase: number; row: number; col: number };

function CrowdCanvas({ progress }: { progress: MotionValue<number> }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let frame = 0;
    let animationId = 0;
    let width = 0;
    let height = 0;
    const particles: Particle[] = [];

    const seedParticles = () => {
      particles.length = 0;
      const count = prefersReducedMotion ? 90 : 260;
      const columns = 26;
      for (let index = 0; index < count; index += 1) {
        particles.push({
          x: Math.random(), y: Math.random(), vx: (Math.random() - 0.5) * 0.003, vy: (Math.random() - 0.5) * 0.003,
          size: 2 + Math.random() * 3.5, hue: 180 + Math.random() * 85, phase: Math.random() * Math.PI * 2,
          row: Math.floor(index / columns), col: index % columns,
        });
      }
    };

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      seedParticles();
    };

    const drawTrader = (particle: Particle, x: number, y: number, order: number, chaos: number) => {
      const alpha = 0.28 + order * 0.55;
      context.save();
      context.translate(x, y);
      context.rotate(Math.sin(frame * 0.025 + particle.phase) * chaos * 1.2);
      context.fillStyle = `hsla(${particle.hue}, 95%, ${62 + order * 14}%, ${alpha})`;
      context.beginPath();
      context.arc(0, -particle.size * 1.4, particle.size, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = `hsla(${particle.hue}, 95%, 70%, ${alpha * 0.75})`;
      context.lineWidth = 1.2;
      context.beginPath();
      context.moveTo(0, -particle.size * 0.2);
      context.lineTo(0, particle.size * 2.7);
      context.moveTo(-particle.size * 1.7, particle.size * 0.7);
      context.lineTo(particle.size * 1.7, particle.size * 0.7);
      context.moveTo(0, particle.size * 2.7);
      context.lineTo(-particle.size * 1.4, particle.size * 4.6);
      context.moveTo(0, particle.size * 2.7);
      context.lineTo(particle.size * 1.4, particle.size * 4.6);
      context.stroke();
      context.restore();
    };

    const render = () => {
      frame += 1;
      const raw = progress.get();
      const order = Math.min(Math.max((raw - 0.42) / 0.5, 0), 1);
      const chaos = 1 - order;
      context.clearRect(0, 0, width, height);
      const gradient = context.createRadialGradient(width * 0.5, height * 0.45, 20, width * 0.5, height * 0.45, width * 0.65);
      gradient.addColorStop(0, `rgba(34, 211, 238, ${0.16 + order * 0.14})`);
      gradient.addColorStop(0.5, "rgba(37, 99, 235, 0.08)");
      gradient.addColorStop(1, "rgba(3, 7, 18, 0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);

      particles.forEach((particle, index) => {
        if (chaos > 0.05 && !prefersReducedMotion) {
          particle.x += particle.vx * (1.4 + chaos * 4);
          particle.y += particle.vy * (1.4 + chaos * 4);
          if (particle.x < -0.04) particle.x = 1.04;
          if (particle.x > 1.04) particle.x = -0.04;
          if (particle.y < -0.04) particle.y = 1.04;
          if (particle.y > 1.04) particle.y = -0.04;
        }
        const gridX = width * (0.16 + (particle.col / 25) * 0.68);
        const gridY = height * (0.25 + (particle.row / 10) * 0.5);
        const chaosX = particle.x * width + Math.sin(frame * 0.018 + particle.phase) * 38 * chaos;
        const chaosY = particle.y * height + Math.cos(frame * 0.02 + particle.phase) * 34 * chaos;
        drawTrader(particle, chaosX * chaos + gridX * order, chaosY * chaos + gridY * order + Math.sin(frame * 0.035 + index * 0.09) * 9 * chaos, order, chaos);
      });
      animationId = requestAnimationFrame(render);
    };

    resize();
    render();
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(animationId); window.removeEventListener("resize", resize); };
  }, [prefersReducedMotion, progress]);

  return <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}

function CharacterGlyph({ char, index, progress }: { char: string; index: number; progress: MotionValue<number> }) {
  const rowDirection = index % 2 === 0 ? -1 : 1;
  const x = useTransform(progress, [0.05, 0.62], [rowDirection * (110 + (index % 5) * 28), 0]);
  const y = useTransform(progress, [0.05, 0.62], [((index % 4) - 1.5) * 72, 0]);
  const rotate = useTransform(progress, [0.05, 0.62], [rowDirection * 26, 0]);
  const opacity = useTransform(progress, [0.1, 0.48], [0.08, 1]);
  if (char === " ") return <span className="w-5 sm:w-8" />;
  return <motion.span style={{ x, y, rotate, opacity }} className="inline-block bg-gradient-to-b from-white via-cyan-100 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_28px_rgba(34,211,238,0.25)]">{char}</motion.span>;
}

function CharacterReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const title = "هوش مصنوعی مخصوص معامله‌گران پراپ";
  const chars = useMemo(() => Array.from(title), [title]);
  return (
    <section ref={ref} className="relative min-h-[130vh] overflow-hidden px-5 py-28 sm:px-8 lg:px-10">
      <div className="sticky top-0 flex min-h-screen items-center justify-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(34,211,238,0.16),transparent_34%),radial-gradient(circle_at_15%_70%,rgba(99,102,241,0.18),transparent_28%)]" />
        <div className="relative mx-auto max-w-6xl text-center">
          <motion.p style={{ opacity: useTransform(scrollYProgress, [0.05, 0.24], [0, 1]) }} className="mb-8 text-sm font-bold text-cyan-300">لحظه کشف</motion.p>
          <h2 className="flex flex-wrap items-center justify-center gap-x-2 gap-y-4 text-5xl font-black leading-tight sm:text-7xl lg:text-8xl" aria-label={title}>
            {chars.map((char, index) => <CharacterGlyph key={`${char}-${index}`} char={char} index={index} progress={scrollYProgress} />)}
          </h2>
          <motion.p style={{ opacity: useTransform(scrollYProgress, [0.6, 0.78], [0, 1]), y: useTransform(scrollYProgress, [0.6, 0.78], [30, 0]) }} className="mx-auto mt-8 max-w-2xl text-lg leading-9 text-slate-300">
            وقتی قطعات پراکنده کنار هم می‌نشینند، پراپچی مسیر تصمیم‌گیری را از ابهام به درک تبدیل می‌کند.
          </motion.p>
        </div>
      </div>
    </section>
  );
}

function ConfusionPill({ item, index, progress }: { item: string; index: number; progress: MotionValue<number> }) {
  const opacity = useTransform(progress, [0.1 + index * 0.04, 0.35 + index * 0.04, 0.72], [0, 1, 0]);
  return <motion.div style={{ opacity }} className="rounded-2xl border border-red-300/15 bg-red-500/[0.06] p-4 text-center text-sm font-bold text-red-100 backdrop-blur-xl">{item} نامشخص است</motion.div>;
}

function ConfusionStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  return (
    <section ref={ref} className="relative h-[320vh] bg-[#030711]" aria-labelledby="crowd-title">
      <div className="sticky top-0 h-screen overflow-hidden">
        <CrowdCanvas progress={scrollYProgress} />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(3,7,18,0.88),rgba(3,7,18,0.32)_35%,rgba(3,7,18,0.72)_100%)]" />
        <motion.div style={{ y: useTransform(scrollYProgress, [0, 0.45, 0.75], [0, -80, -170]), opacity: useTransform(scrollYProgress, [0, 0.42, 0.7], [1, 0.75, 0]) }} className="absolute right-0 top-0 z-10 w-full px-5 pt-24 text-center sm:px-8 lg:px-10">
          <p className="text-sm font-bold text-cyan-300">آشفتگی واقعی بازار پراپ</p>
          <h2 id="crowd-title" className="mx-auto mt-4 max-w-5xl text-4xl font-black leading-tight sm:text-6xl lg:text-7xl">صدها پراپ فرم، هزاران قانون متفاوت</h2>
          <p className="mx-auto mt-6 max-w-3xl text-lg leading-9 text-slate-300">هر روز معامله‌گران ساعت‌ها زمان صرف مقایسه قوانین، محدودیت‌ها و شرایط پراپ فرم‌های مختلف می‌کنند.</p>
        </motion.div>
        <div className="absolute inset-x-0 bottom-10 z-10 mx-auto grid max-w-6xl gap-3 px-5 sm:grid-cols-4 sm:px-8 lg:px-10">
          {["قانون خبر", "دراودان", "برداشت", "ثبات حجم"].map((item, index) => <ConfusionPill key={item} item={item} index={index} progress={scrollYProgress} />)}
        </div>
        <motion.div style={{ opacity: useTransform(scrollYProgress, [0.58, 0.82], [0, 1]), scale: useTransform(scrollYProgress, [0.58, 0.85], [0.88, 1]) }} className="absolute inset-0 z-20 flex items-center justify-center px-5 sm:px-8 lg:px-10">
          <div className="relative mx-auto max-w-4xl overflow-hidden rounded-[2.5rem] border border-cyan-300/20 bg-slate-950/72 p-8 text-center shadow-2xl shadow-cyan-950/40 backdrop-blur-2xl sm:p-12">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.22),transparent_42%)]" />
            <div className="relative"><span className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-3xl bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-300/25"><BrainCircuit className="h-8 w-8" /></span><p className="text-sm font-bold text-cyan-300">پراپچی وارد می‌شود</p><h3 className="mt-4 text-4xl font-black leading-tight sm:text-6xl">از ازدحام قوانین به یک پاسخ روشن</h3><p className="mx-auto mt-5 max-w-2xl text-lg leading-9 text-slate-300">هوش مصنوعی پراپچی اطلاعات پراکنده را می‌خواند، دسته‌بندی می‌کند و نکته‌های مهم را برای تصمیم معامله‌گر برجسته می‌سازد.</p></div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

function FragmentCard({ fragment, index, progress }: { fragment: string; index: number; progress: MotionValue<number> }) {
  const angle = (index / chaosFragments.length) * Math.PI * 2;
  const startX = Math.cos(angle) * (330 + (index % 3) * 56);
  const startY = Math.sin(angle) * (230 + (index % 4) * 28);
  const finalX = ((index % 2) ? -1 : 1) * (95 + (index % 4) * 24);
  const finalY = -220 + Math.floor(index / 4) * 70;
  const x = useTransform(progress, [0.02, 0.48, 0.82], [startX, 0, finalX]);
  const y = useTransform(progress, [0.02, 0.48, 0.82], [startY, 0, finalY]);
  const rotate = useTransform(progress, [0.02, 0.48, 0.82], [index % 2 ? -18 : 18, 0, 0]);
  const opacity = useTransform(progress, [0, 0.12, 0.88, 0.96], [0, 1, 1, 0]);
  return <motion.div style={{ x, y, rotate, opacity }} className="absolute left-1/2 top-1/2 z-10 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 text-sm font-bold text-slate-100 shadow-2xl shadow-slate-950/30 backdrop-blur-xl">{fragment}</motion.div>;
}

function TransformationStory() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  return (
    <section ref={ref} className="relative h-[340vh] bg-[#050812]" aria-labelledby="transform-title">
      <div className="sticky top-0 flex h-screen items-center overflow-hidden px-5 sm:px-8 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(34,211,238,0.18),transparent_28%),radial-gradient(circle_at_85%_20%,rgba(168,85,247,0.14),transparent_28%)]" />
        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-8 lg:grid-cols-[0.78fr_1.22fr]">
          <div className="relative z-20"><motion.p style={{ opacity: useTransform(scrollYProgress, [0.05, 0.2], [0, 1]) }} className="text-sm font-bold text-cyan-300">تحول پراپچی</motion.p><motion.h2 id="transform-title" style={{ y: useTransform(scrollYProgress, [0.05, 0.32], [42, 0]), opacity: useTransform(scrollYProgress, [0.05, 0.28], [0, 1]) }} className="mt-4 text-4xl font-black leading-tight sm:text-6xl">آشوب تحقیق، به بینش قابل اقدام تبدیل می‌شود</motion.h2><motion.p style={{ opacity: useTransform(scrollYProgress, [0.26, 0.42], [0, 1]) }} className="mt-6 text-lg leading-9 text-slate-300">کارت‌های قانون، لوگوها، آمار و شرط‌های متناقض ابتدا پراکنده‌اند؛ سپس با حرکت اسکرول وارد موتور تحلیل می‌شوند و خروجی منظم می‌سازند.</motion.p></div>
          <div className="relative h-[620px] min-h-[72vh]">
            <motion.div style={{ scale: useTransform(scrollYProgress, [0.08, 0.46, 0.9], [0.78, 1.05, 1]), opacity: useTransform(scrollYProgress, [0.15, 0.85], [0.25, 1]) }} className="absolute left-1/2 top-1/2 z-20 grid h-56 w-56 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-300/25 bg-cyan-300/[0.08] shadow-[0_0_90px_rgba(34,211,238,0.32)] backdrop-blur-2xl"><div className="grid h-36 w-36 place-items-center rounded-full bg-slate-950/85 ring-1 ring-white/10"><BrainCircuit className="h-14 w-14 text-cyan-200" /><span className="text-sm font-black text-white">Propchi AI</span></div></motion.div>
            {chaosFragments.map((fragment, index) => <FragmentCard key={fragment} fragment={fragment} index={index} progress={scrollYProgress} />)}
            <motion.div style={{ opacity: useTransform(scrollYProgress, [0.7, 0.88], [0, 1]), y: useTransform(scrollYProgress, [0.7, 0.88], [60, 0]) }} className="absolute inset-x-0 bottom-0 z-30 grid gap-3 rounded-[2rem] border border-cyan-300/20 bg-slate-950/80 p-4 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl sm:grid-cols-2">
              {organizedInsights.map((item) => <div key={item.label} className="rounded-2xl bg-white/[0.05] p-4"><p className="text-xs font-bold text-cyan-300">{item.label}</p><p className="mt-2 text-sm leading-7 text-slate-100">{item.value}</p></div>)}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SourceNode({ node, index, progress }: { node: (typeof sourceNodes)[number]; index: number; progress: MotionValue<number> }) {
  const Icon = node.icon;
  const x = useTransform(progress, [0.08, 0.58, 0.76], [index % 2 ? -120 : 120, 0, 0]);
  const y = useTransform(progress, [0.08, 0.58, 0.76], [index < 3 ? 110 : -110, 0, 0]);
  const opacity = useTransform(progress, [0.05, 0.24, 0.82], [0, 1, 0.16]);
  return <motion.div style={{ x, y, opacity }} className={`absolute ${node.orbit} z-20`}><motion.div animate={{ y: [0, node.float, 0] }} transition={{ duration: 4 + index * 0.35, repeat: Infinity, ease: "easeInOut" }} className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[0.07] px-5 py-4 shadow-2xl shadow-slate-950/30 backdrop-blur-xl"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-200"><Icon className="h-5 w-5" /></span><span className="font-black">{node.title}</span></motion.div></motion.div>;
}

function IconConvergence() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  return (
    <section ref={ref} className="relative h-[260vh] bg-[#030711]" aria-labelledby="sources-title">
      <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden px-5 sm:px-8 lg:px-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,rgba(14,165,233,0.2),transparent_32%)]" />
        <div className="relative h-[680px] w-full max-w-6xl">
          <motion.div style={{ opacity: useTransform(scrollYProgress, [0, 0.2], [0, 1]), y: useTransform(scrollYProgress, [0, 0.2], [40, 0]) }} className="absolute inset-x-0 top-0 z-20 text-center"><p className="text-sm font-bold text-cyan-300">همگرایی منابع</p><h2 id="sources-title" className="mx-auto mt-4 max-w-4xl text-4xl font-black leading-tight sm:text-6xl">همه مسیرهای تحقیق به یک موتور هوشمند می‌رسند</h2></motion.div>
          <motion.div style={{ scale: useTransform(scrollYProgress, [0.2, 0.68], [0.82, 1.15]) }} className="absolute left-1/2 top-1/2 z-10 grid h-64 w-64 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-cyan-300/20 bg-cyan-300/[0.07] shadow-[0_0_110px_rgba(34,211,238,0.35)] backdrop-blur-2xl"><div className="grid h-40 w-40 place-items-center rounded-full bg-slate-950/90 ring-1 ring-white/10"><Bot className="h-16 w-16 text-cyan-200" /><span className="text-sm font-black">دستیار هوشمند</span></div></motion.div>
          {sourceNodes.map((node, index) => <SourceNode key={node.title} node={node} index={index} progress={scrollYProgress} />)}
          <motion.div style={{ opacity: useTransform(scrollYProgress, [0.68, 0.9], [0, 1]), y: useTransform(scrollYProgress, [0.68, 0.9], [40, 0]) }} className="absolute inset-x-0 bottom-8 z-30 text-center"><h3 className="text-4xl font-black leading-tight sm:text-6xl">همه اطلاعات در یک دستیار هوشمند</h3><p className="mx-auto mt-5 max-w-2xl text-lg leading-9 text-slate-300">PDF، سایت، قوانین، چالش‌ها و برنامه‌های فاندینگ به یک تجربه فارسی، منظم و قابل پرسش تبدیل می‌شوند.</p></motion.div>
        </div>
      </div>
    </section>
  );
}

export default function HomeLandingPage() {
  const structuredData = { "@context": "https://schema.org", "@type": "SoftwareApplication", name: "پراپچی", applicationCategory: "BusinessApplication", operatingSystem: "وب", inLanguage: "fa-IR", description: "دستیار هوش مصنوعی فارسی برای تحلیل قوانین، مقایسه پراپ فرم‌ها، تحلیل PDF و تحقیق سریع‌تر معامله‌گران پراپ.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } };
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
            <motion.div variants={fadeUp} className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-white/[0.06] px-4 py-2 text-sm text-cyan-100 shadow-lg shadow-cyan-500/5 backdrop-blur-xl lg:mx-0"><Sparkles className="h-4 w-4 text-cyan-300" /> تجربه لانچ محصول برای تحلیل قوانین پراپ</motion.div>
            <motion.h1 id="hero-title" variants={fadeUp} className="text-5xl font-black leading-tight tracking-tight sm:text-7xl lg:text-8xl">از آشوب قوانین پراپ، به تصمیم شفاف برس</motion.h1>
            <motion.p variants={fadeUp} className="mx-auto mt-6 max-w-2xl text-lg leading-9 text-slate-300 lg:mx-0">پراپچی یک دستیار هوش مصنوعی فارسی است که PDFها، وب‌سایت‌ها و قوانین صدها پراپ فرم را تحلیل می‌کند تا معامله‌گر قبل از خرید چالش، تصویر واضحی از ریسک داشته باشد.</motion.p>
            <motion.div variants={fadeUp} className="mt-9 flex flex-col items-center gap-3 sm:flex-row lg:justify-start"><Link href="/login" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl bg-cyan-300 px-7 py-4 text-base font-black text-slate-950 shadow-2xl shadow-cyan-500/25 transition hover:-translate-y-1 hover:bg-cyan-200">شروع تجربه هوشمند <ArrowLeft className="h-5 w-5" /></Link><a href="#story" className="inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/[0.05] px-7 py-4 text-base font-bold text-white backdrop-blur-xl transition hover:bg-white/[0.08]">تماشای داستان <ArrowDown className="h-5 w-5" /></a></motion.div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.9, rotateX: 18 }} animate={{ opacity: 1, scale: 1, rotateX: 0 }} transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }} className="relative mx-auto w-full max-w-xl">
            <div className="absolute -inset-8 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="relative overflow-hidden rounded-[2.4rem] border border-white/10 bg-slate-950/70 p-4 shadow-2xl shadow-cyan-950/30 backdrop-blur-2xl"><div className="rounded-[1.8rem] border border-white/10 bg-white/[0.04] p-5"><div className="mb-5 flex items-center justify-between border-b border-white/10 pb-4"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-300/10"><Bot className="h-5 w-5 text-cyan-200" /></span><div><p className="font-black">Propchi AI</p><p className="text-xs text-slate-400">در حال تبدیل آشوب به بینش</p></div></div><span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-bold text-emerald-200">زنده</span></div><div className="space-y-3">{[["ورودی", "PDF قوانین + صفحه FAQ + شرایط برداشت"], ["تحلیل", "استخراج دراودان، خبر، ثبات و ریسک‌های پنهان"], ["خروجی", "خلاصه تصمیم، هشدارها و مقایسه ساختاریافته"]].map(([label, value], index) => <motion.div key={label} animate={{ x: [0, index % 2 ? -8 : 8, 0] }} transition={{ duration: 5 + index, repeat: Infinity, ease: "easeInOut" }} className="rounded-2xl border border-white/10 bg-white/[0.05] p-4"><p className="text-xs font-bold text-cyan-300">{label}</p><p className="mt-2 leading-7 text-slate-100">{value}</p></motion.div>)}</div></div></div>
          </motion.div>
        </div>
      </section>
      <div id="story" />
      <CharacterReveal />
      <ConfusionStory />
      <TransformationStory />
      <IconConvergence />
      <section id="features" className="relative px-5 py-28 sm:px-8 lg:px-10"><div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(59,130,246,0.13),transparent_30%)]" /><div className="relative mx-auto max-w-7xl"><motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={stagger} className="mb-14 max-w-3xl"><motion.p variants={fadeUp} className="text-sm font-bold text-cyan-300">اعتماد بعد از درک</motion.p><motion.h2 variants={fadeUp} className="mt-3 text-4xl font-black leading-tight sm:text-6xl">ابزارهایی که داستان را به تصمیم تبدیل می‌کنند</motion.h2></motion.div><motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.15 }} variants={stagger} className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{features.map((feature, index) => <GlassCard key={feature.title} {...feature} index={index} />)}</motion.div></div></section>
      <motion.section initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={stagger} className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10"><div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">{benefits.map((item) => { const Icon = item.icon; return <motion.div variants={fadeUp} key={item.title} className="rounded-[2rem] border border-white/10 bg-gradient-to-br from-white/[0.08] to-white/[0.025] p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl"><Icon className="mb-6 h-7 w-7 text-cyan-200" /><p className="text-4xl font-black text-white"><PersianCounter value={item.value} suffix={item.suffix} /></p><h3 className="mt-4 text-xl font-bold">{item.title}</h3><p className="mt-2 leading-7 text-slate-400">{item.text}</p></motion.div>; })}</div></motion.section>
      <section className="mx-auto grid max-w-7xl gap-8 px-5 py-24 sm:px-8 lg:grid-cols-[0.85fr_1.15fr] lg:px-10"><motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={stagger}><motion.p variants={fadeUp} className="text-sm font-bold text-cyan-300">دموی خروجی</motion.p><motion.h2 variants={fadeUp} className="mt-3 text-4xl font-black leading-tight sm:text-5xl">پاسخ، فقط خلاصه نیست؛ نقشه تصمیم است</motion.h2><motion.p variants={fadeUp} className="mt-5 text-lg leading-9 text-slate-300">پراپچی پاسخ‌ها را دسته‌بندی، ریسک‌سنجی و برای تصمیم‌گیری معامله‌گر آماده می‌کند.</motion.p></motion.div><motion.div initial={{ opacity: 0, x: -40 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-4 shadow-2xl shadow-cyan-950/30 backdrop-blur-xl"><div className="rounded-[1.5rem] bg-slate-950/80 p-5"><div className="mb-6 flex items-center gap-3 border-b border-white/10 pb-4"><span className="grid h-10 w-10 place-items-center rounded-2xl bg-cyan-300/10"><Bot className="h-5 w-5 text-cyan-200" /></span><div><p className="font-bold">دستیار پراپچی</p><p className="text-xs text-slate-400">در حال تحلیل قوانین معاملاتی</p></div></div><div className="space-y-4 text-sm leading-7"><div className="mr-auto w-fit max-w-[85%] rounded-2xl bg-white px-4 py-3 text-slate-950">قوانین زورا اف‌ایکس را برای اسکالپ بررسی کن</div><div className="space-y-3 rounded-2xl border border-cyan-300/15 bg-cyan-300/[0.06] p-4 text-slate-200"><p className="font-bold text-cyan-100">نتیجه تحلیل:</p><p>این برنامه برای معامله‌گران منظم مناسب است، اما روی مدیریت دراودان، ثبات حجم و معامله هنگام خبر باید با احتیاط عمل شود.</p><div className="grid gap-3 sm:grid-cols-3">{["تقسیم سود بالا", "ریسک خبر متوسط", "دراودان حساس"].map((item) => <span key={item} className="rounded-xl bg-white/[0.05] px-3 py-2 text-center text-xs">{item}</span>)}</div></div></div></div></motion.div></section>
      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10"><SectionHeader eyebrow="مقایسه پراپ فرم‌ها" title="شفافیت، مرحله آخر داستان است" /><div className="overflow-hidden rounded-[2rem] border border-white/10 bg-white/[0.04] shadow-2xl shadow-blue-950/20 backdrop-blur-xl"><div className="grid grid-cols-5 gap-0 border-b border-white/10 bg-white/[0.06] p-4 text-sm font-bold text-cyan-100 max-md:hidden"><span>پراپ فرم</span><span>تقسیم سود</span><span>دراودان</span><span>معامله هنگام خبر</span><span>قوانین ثبات</span></div>{comparison.map((row) => <div key={row.firm} className="grid gap-3 border-b border-white/10 p-4 text-sm last:border-0 md:grid-cols-5"><strong>{row.firm}</strong><span>{row.profit}</span><span>{row.drawdown}</span><span>{row.news}</span><span>{row.consistency}</span></div>)}</div></section>
      <section className="mx-auto max-w-7xl px-5 py-24 sm:px-8 lg:px-10"><SectionHeader eyebrow="نظر معامله‌گران" title="وقتی تحقیق روشن می‌شود، اعتماد شکل می‌گیرد" /><motion.div animate={{ x: [0, -24, 0] }} transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} className="grid gap-5 md:grid-cols-3">{testimonials.map((item) => <article key={item.name} className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl"><p className="leading-8 text-slate-200">«{item.quote}»</p><div className="mt-6 border-t border-white/10 pt-5"><h3 className="font-bold">{item.name}</h3><p className="mt-1 text-sm text-cyan-200">{item.role}</p></div></article>)}</motion.div></section>
      <section className="px-5 py-28 sm:px-8 lg:px-10"><div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.5rem] border border-white/10 bg-gradient-to-br from-cyan-400/15 via-blue-500/10 to-violet-500/15 p-8 text-center shadow-2xl shadow-cyan-950/30 backdrop-blur-xl sm:p-14"><div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(255,255,255,0.18),transparent_32%)]" /><div className="relative"><div className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-300/10 px-4 py-2 text-sm font-bold text-cyan-100"><LockKeyhole className="h-4 w-4" /> مسیر تحقیق امن‌تر و کوتاه‌تر</div><h2 className="text-4xl font-black leading-tight sm:text-6xl">تحقیق چند ساعته را به چند ثانیه تبدیل کن</h2><p className="mx-auto mt-5 max-w-2xl text-lg leading-9 text-slate-300">همین حالا با دستیار هوشمند پراپچی، قوانین را دقیق‌تر بخوانید و با اطمینان بیشتری تصمیم بگیرید.</p><Link href="/login" className="mt-9 inline-flex min-h-12 items-center justify-center gap-3 rounded-2xl bg-white px-8 py-4 text-base font-black text-slate-950 shadow-2xl shadow-cyan-500/20 transition hover:-translate-y-1 hover:bg-cyan-100">شروع استفاده از پراپچی <ArrowLeft className="h-5 w-5" /></Link></div></div></section>
    </main>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return <motion.div initial="hidden" whileInView="visible" viewport={{ once: true, amount: 0.25 }} variants={stagger} className="mb-12 text-center"><motion.p variants={fadeUp} className="text-sm font-bold text-cyan-300">{eyebrow}</motion.p><motion.h2 variants={fadeUp} className="mx-auto mt-3 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">{title}</motion.h2></motion.div>;
}

function GlassCard({ title, text, icon: Icon, index = 0 }: { title: string; text: string; icon: LucideIcon; index?: number }) {
  return <motion.article variants={{ hidden: { opacity: 0, x: index % 2 ? -60 : 60, y: 44, rotate: index % 2 ? -4 : 4 }, visible: { opacity: 1, x: 0, y: 0, rotate: 0 } }} whileHover={{ y: -8, scale: 1.015 }} transition={{ type: "spring", stiffness: 260, damping: 22 }} className="group relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-white/[0.045] p-6 shadow-xl shadow-slate-950/20 backdrop-blur-xl"><div className="absolute inset-0 opacity-0 transition duration-500 group-hover:opacity-100 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.16),transparent_45%)]" /><div className="relative"><span className="mb-5 grid h-12 w-12 place-items-center rounded-2xl bg-cyan-300/10 text-cyan-200 ring-1 ring-cyan-300/15"><Icon className="h-6 w-6" /></span><h3 className="text-xl font-bold text-white">{title}</h3><p className="mt-3 leading-8 text-slate-400">{text}</p></div></motion.article>;
}
