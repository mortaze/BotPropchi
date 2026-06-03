import type { Metadata } from "next";
import localFont from "next/font/local";
import Providers from "@/components/shared/Providers";
import { Toaster } from "sonner";
import Script from "next/script";
import { BRAND_NAME, BRAND_TITLE } from "@/config/brand";
import "./globals.css";

const vazirFont = localFont({
  variable: "--font-vazir",
  display: "swap",
  src: [
    { path: "../../public/font/Vazir.woff2", weight: "400", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: BRAND_TITLE,
  description: `پنل مدیریت ربات تلگرام ${BRAND_NAME}`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="dark" suppressHydrationWarning>
      <body className={`${vazirFont.variable} font-sans antialiased bg-background text-foreground`}>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
        <Providers>
          {children}
          <Toaster position="top-center" richColors theme="dark" dir="rtl" />
        </Providers>
      </body>
    </html>
  );
}
