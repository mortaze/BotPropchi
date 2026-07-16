"use client";

import { BRAND_NAME } from "@/config/brand";
import { zodResolver } from "@hookform/resolvers/zod";
import { Bot, Eye, EyeOff, Lock, User } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui";
import { authApi, getApiError } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";

const schema = z.object({
  username: z.string().min(3, "نام کاربری حداقل ۳ کاراکتر"),
  password: z.string().min(6, "رمز عبور حداقل ۶ کاراکتر"),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [showPassword, setShowPassword] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

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
              ورود به پنل مدیریت
            </p>
          </div>

          {/* Form */}
          <form
            className="space-y-5"
            onSubmit={handleSubmit(async (values) => {
              try {
                const res = await authApi.login(values.username, values.password);
                login(res.token, res.admin);
                router.replace("/dashboard");
                toast.success("خوش آمدید");
              } catch (error) {
                toast.error(getApiError(error, "خطا در ورود"));
              }
            })}
          >
            {/* Username */}
            <div>
              <label className="login-label" htmlFor="username">
                نام کاربری
              </label>
              <div className="relative">
                <User className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="username"
                  autoComplete="username"
                  placeholder="نام کاربری خود را وارد کنید"
                  className={`login-input ${errors.username ? "login-input-error" : ""}`}
                  {...register("username")}
                />
              </div>
              {errors.username && (
                <p className="mt-1.5 text-xs text-destructive">
                  {errors.username.message}
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="login-label" htmlFor="password">
                رمز عبور
              </label>
              <div className="relative">
                <Lock className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
                <input
                  id="password"
                  autoComplete="current-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="رمز عبور خود را وارد کنید"
                  className={`login-input pl-11 ${errors.password ? "login-input-error" : ""}`}
                  {...register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground/60 transition-colors duration-200 hover:text-foreground"
                  tabIndex={-1}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.password && (
                <p className="mt-1.5 text-xs text-destructive">
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* Submit */}
            <Button
              className="h-12 w-full rounded-xl text-sm font-semibold shadow-lg shadow-primary/25 transition-all duration-200 hover:shadow-xl hover:shadow-primary/30 hover:brightness-110 active:scale-[0.98]"
              loading={isSubmitting}
              type="submit"
            >
              ورود
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-muted-foreground/50">
          {BRAND_NAME} — پنل مدیریت ربات تلگرام
        </p>
      </div>
    </div>
  );
}
