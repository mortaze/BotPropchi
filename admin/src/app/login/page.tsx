"use client";

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

const schema = z.object({ username: z.string().min(3, "نام کاربری حداقل ۳ کاراکتر"), password: z.string().min(6, "رمز عبور حداقل ۶ کاراکتر") });
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const router = useRouter();
  const login = useAuthStore((state) => state.login);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Bot className="h-8 w-8" /></div>
          <h1 className="text-2xl font-bold">BotPropchi</h1>
          <p className="mt-1 text-sm text-muted-foreground">ورود به پنل مدیریت</p>
        </div>
        <form className="space-y-4" onSubmit={handleSubmit(async (values) => {
          try {
            const res = await authApi.login(values.username, values.password);
            login(res.token, res.admin);
            toast.success("خوش آمدید");
            router.replace("/dashboard");
          } catch (error) {
            toast.error(getApiError(error, "خطا در ورود"));
          }
        })}>
          <label className="block">
            <span className="label">نام کاربری</span>
            <span className="relative block"><User className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className="input pr-10" {...register("username")} autoComplete="username" /></span>
            {errors.username && <span className="mt-1 block text-xs text-destructive">{errors.username.message}</span>}
          </label>
          <label className="block">
            <span className="label">رمز عبور</span>
            <span className="relative block"><Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><input className="input px-10" type={showPassword ? "text" : "password"} {...register("password")} autoComplete="current-password" /><button type="button" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword((value) => !value)}>{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span>
            {errors.password && <span className="mt-1 block text-xs text-destructive">{errors.password.message}</span>}
          </label>
          <Button className="w-full" loading={isSubmitting} type="submit">ورود</Button>
        </form>
      </div>
    </div>
  );
}
