import type { Metadata } from "next";
import localFont from "next/font/local";
import Providers from "@/components/shared/Providers";
import { Toaster } from "sonner";
import "./globals.css";

const vazirFont = localFont({
  variable: "--font-vazir",
  display: "swap",
  src: [
    { path: "../../public/font/Vazir.woff2", weight: "400", style: "normal" },
  ],
});

export const metadata: Metadata = {
  title: "BotPropchi | پنل مدیریت",
  description: "پنل مدیریت ربات تلگرام پراپچی",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" className="dark" suppressHydrationWarning>
      <body className={`${vazirFont.variable} font-sans antialiased bg-background text-foreground`}>
        <Providers>
          {children}
          <Toaster position="top-center" richColors theme="dark" dir="rtl" />
        </Providers>
      </body>
    </html>
  );
}
