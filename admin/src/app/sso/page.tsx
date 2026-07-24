"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Bot, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { BRAND_NAME } from "@/config/brand";
import { useAuthStore } from "@/store/auth.store";
import { API_BASE_URL } from "@/services/api";

type SsoState = "loading" | "success" | "error";

export default function SsoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const login = useAuthStore((state) => state.login);
  const [state, setState] = useState<SsoState>("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    const token = searchParams.get("token");

    if (!token) {
      setState("error");
      setError("توکن SSO یافت نشد");
      return;
    }

    const exchangeToken = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/auth/sso/exchange`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          setState("error");
          setError(data.error || "خطا در احراز هویت SSO");
          return;
        }

        // ست کردن cookies و state (مثل login معمولی)
        login(data.token, data.admin);
        setState("success");

        // ریدایرکت به داشبورد بعد از ۱.۵ ثانیه
        setTimeout(() => {
          router.replace("/dashboard");
        }, 1500);
      } catch (err) {
        setState("error");
        setError("خطا در برقراری ارتباط با سرور");
      }
    };

    exchangeToken();
  }, [searchParams, login, router]);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 h-[600px] w-[600px] rounded-full bg-primary/[0.04] blur-[120px]" />
        <div className="absolute -bottom-1/4 -right-1/4 h-[500px] w-[500px] rounded-full bg-primary/[0.03] blur-[100px]" />
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-sm">
        <div className="rounded-2xl border border-white/[0.06] bg-card/80 p-8 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-10">
          {/* Logo */}
          <div className="mb-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-transform duration-300 hover:scale-105">
              <Bot className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {BRAND_NAME}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              ورود از طریق ربات تلگرام
            </p>
          </div>

          {/* State: Loading */}
          {state === "loading" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <Loader2 className="h-10 w-10 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                در حال احراز هویت...
              </p>
            </div>
          )}

          {/* State: Success */}
          {state === "success" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
                <ShieldCheck className="h-8 w-8 text-green-500" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">
                  ورود موفقیت‌آمیز!
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  در حال انتقال به داشبورد...
                </p>
              </div>
            </div>
          )}

          {/* State: Error */}
          {state === "error" && (
            <div className="flex flex-col items-center gap-4 py-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                <ShieldAlert className="h-8 w-8 text-destructive" />
              </div>
              <div className="text-center">
                <p className="text-base font-semibold text-foreground">
                  خطا در ورود
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {error}
                </p>
              </div>
              <button
                onClick={() => router.replace("/login")}
                className="mt-2 rounded-xl bg-primary/10 px-6 py-2.5 text-sm font-medium text-primary transition-colors duration-200 hover:bg-primary/20"
              >
                ورود با رمز عبور
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground/50">
          {BRAND_NAME} — احراز هویت امن از تلگرام
        </p>
      </div>
    </div>
  );
}
