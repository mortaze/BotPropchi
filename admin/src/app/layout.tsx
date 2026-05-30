import type { Metadata } from "next";
import Providers from "@/components/shared/Providers";
import { Toaster } from "sonner";
import "./globals.css";

export const metadata: Metadata = {
  title: "BotPropchi | پنل مدیریت",
  description: "پنل مدیریت ربات تلگرام پراپچی",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <body className="font-sans antialiased bg-background text-foreground">
        <Providers>
          {children}
          <Toaster position="top-center" richColors dir="rtl" />
        </Providers>
      </body>
    </html>
  );
}
