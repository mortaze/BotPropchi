import type { Metadata } from "next";
import HomeLandingPage from "@/components/landing/HomeLandingPage";

export const metadata: Metadata = {
  title: "پراپچی | هوش مصنوعی مخصوص معامله‌گران پراپ",
  description:
    "با پراپچی قوانین پراپ فرم‌ها، فایل‌های PDF و وب‌سایت‌ها را در چند ثانیه تحلیل کنید و پاسخ‌های دقیق فارسی از هوش مصنوعی دریافت کنید.",
  keywords: [
    "پراپچی",
    "هوش مصنوعی پراپ",
    "تحلیل قوانین پراپ فرم",
    "مقایسه پراپ فرم",
    "معامله‌گران پراپ",
    "تحلیل PDF پراپ",
  ],
  openGraph: {
    title: "پراپچی | هوش مصنوعی مخصوص معامله‌گران پراپ",
    description:
      "قوانین پراپ فرم‌ها را در چند ثانیه تحلیل کنید، مقایسه کنید و پاسخ سوالات خود را از هوش مصنوعی دریافت کنید.",
    type: "website",
    locale: "fa_IR",
    siteName: "پراپچی",
  },
  twitter: {
    card: "summary_large_image",
    title: "پراپچی | هوش مصنوعی مخصوص معامله‌گران پراپ",
    description:
      "دستیار هوشمند فارسی برای تحلیل قوانین، مقایسه پراپ فرم‌ها و تحقیق سریع‌تر معامله‌گران.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function Home() {
  return <HomeLandingPage />;
}
