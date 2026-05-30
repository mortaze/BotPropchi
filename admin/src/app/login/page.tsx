
// src/app/login/page.tsx
"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import {
  Eye,
  EyeOff,
  Bot,
  Lock,
  User,
} from "lucide-react";

import { useAuthStore } from "@/store/auth.store";
import { authApi } from "@/services/api";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

const loginSchema = z.object({
  username: z
    .string()
    .min(3, "نام کاربری حداقل ۳ کاراکتر"),

  password: z
    .string()
    .min(6, "رمز عبور حداقل ۶ کاراکتر"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [showPass, setShowPass] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const login = useAuthStore(
    (s) => s.login
  );

  const router = useRouter();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const onSubmit = async (
    data: LoginForm
  ) => {
    try {
      setLoading(true);

      console.log(
        "Sending login request..."
      );

      const res = await authApi.login(
        data.username,
        data.password
      );

      console.log("LOGIN RESPONSE:", res);

      // ذخیره داخل zustand
      login(
        res.token,
        res.username,
        res.role
      );

      toast.success(
        "خوش آمدید 👋"
      );

      // کمی تاخیر برای ست شدن state
      setTimeout(() => {
        router.push("/dashboard");
      }, 300);
    } catch (err: any) {
      console.error(
        "LOGIN ERROR:",
        err
      );

      toast.error(
        err?.response?.data?.error ||
          "خطا در ورود"
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 right-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />

        <div className="absolute bottom-1/4 left-1/4 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl" />

        <div className="absolute inset-0 bg-[url('/grid.svg')] opacity-[0.02]" />
      </div>

      <div className="relative w-full max-w-md animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Bot className="w-8 h-8 text-primary" />
          </div>

          <h1 className="text-2xl font-bold text-foreground">
            BotPropchi
          </h1>

          <p className="text-muted-foreground text-sm mt-1">
            پنل مدیریت ربات تلگرام
          </p>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-2xl shadow-black/10">
          <h2 className="text-lg font-semibold text-foreground mb-6">
            ورود به پنل
          </h2>

          <form
            onSubmit={handleSubmit(
              onSubmit
            )}
            className="space-y-4"
          >
            {/* Username */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                نام کاربری
              </label>

              <div className="relative">
                <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />

                <input
                  type="text"
                  autoComplete="username"
                  placeholder="admin"
                  {...register(
                    "username"
                  )}
                  className={cn(
                    "w-full pr-10 pl-4 py-2.5 rounded-lg border bg-background text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                    errors.username
                      ? "border-destructive"
                      : "border-input"
                  )}
                />
              </div>

              {errors.username && (
                <p className="text-destructive text-xs mt-1">
                  {
                    errors.username
                      .message
                  }
                </p>
              )}
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-foreground mb-1.5">
                رمز عبور
              </label>

              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />

                <input
                  type={
                    showPass
                      ? "text"
                      : "password"
                  }
                  autoComplete="current-password"
                  placeholder="••••••••"
                  {...register(
                    "password"
                  )}
                  className={cn(
                    "w-full pr-10 pl-10 py-2.5 rounded-lg border bg-background text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
                    errors.password
                      ? "border-destructive"
                      : "border-input"
                  )}
                />

                <button
                  type="button"
                  onClick={() =>
                    setShowPass(
                      !showPass
                    )
                  }
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPass ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>

              {errors.password && (
                <p className="text-destructive text-xs mt-1">
                  {
                    errors.password
                      .message
                  }
                </p>
              )}
            </div>

            {/* Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium text-sm transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mt-2"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  در حال ورود...
                </span>
              ) : (
                "ورود به پنل"
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-4">
          BotPropchi Admin Panel ©{" "}
          {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}

