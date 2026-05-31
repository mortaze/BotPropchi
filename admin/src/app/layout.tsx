import type { Metadata } from "next";
import localFont from "next/font/local";
import Providers from "@/components/shared/Providers";
import { Toaster } from "sonner";
import "./globals.css";

const adminFont = localFont({
  variable: "--font-admin",
  display: "swap",
  src: [
    { path: "../../public/font/Vazir.woff2", weight: "400", style: "normal" },
    { path: "../../public/font/BYekan.ttf", weight: "400", style: "normal" },
    { path: "../../public/font/BYekanBold.ttf", weight: "700", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "BotPropchi | پنل مدیریت",
  description: "پنل مدیریت ربات تلگرام پراپچی",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="dark" suppressHydrationWarning>
      <body className={`${adminFont.variable} font-sans antialiased bg-background text-foreground`}>
        <Providers>
          {children}
          <Toaster position="top-center" richColors theme="dark" dir="rtl" />
        </Providers>
      </body>
    </html>
  );
}
