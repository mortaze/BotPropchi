import type { Metadata } from "next";
import HomeLandingPage from "@/components/landing/HomeLandingPage";
import { BRAND_LANDING_TITLE, BRAND_NAME } from "@/config/brand";

export const metadata: Metadata = {
  title: BRAND_LANDING_TITLE,
  description:
    `با ${BRAND_NAME} قوانین پراپ فرم‌ها، فایل‌های PDF و وب‌سایت‌ها را در چند ثانیه تحلیل کنید و پاسخ‌های دقیق فارسی از هوش مصنوعی دریافت کنید.`,
  keywords: [
    BRAND_NAME,
    "هوش مصنوعی پراپ",
    "تحلیل قوانین پراپ فرم",
    "مقایسه پراپ فرم",
    "معامله‌گران پراپ",
    "تحلیل PDF پراپ",
  ],
  openGraph: {
    title: BRAND_LANDING_TITLE,
    description:
      "قوانین پراپ فرم‌ها را در چند ثانیه تحلیل کنید، مقایسه کنید و پاسخ سوالات خود را از هوش مصنوعی دریافت کنید.",
    type: "website",
    locale: "fa_IR",
    siteName: BRAND_NAME,
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_LANDING_TITLE,
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
