"use client";

import Cookies from "js-cookie";
import { useSyncExternalStore } from "react";
import type { AdminUser } from "@/types";

interface AuthState {
  token?: string;
  admin?: AdminUser;
  isAuthenticated: boolean;
  hydrate: () => void;
  login: (token: string, admin: AdminUser) => void;
  logout: () => void;
}

let snapshot: AuthState;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
const setState = (patch: Partial<AuthState>) => { snapshot = { ...snapshot, ...patch }; emit(); };

const readAdmin = (): AdminUser | undefined => {
  const raw = Cookies.get("admin_user");
  if (!raw) return undefined;
  try { return JSON.parse(raw) as AdminUser; } catch { Cookies.remove("admin_user"); return undefined; }
};

snapshot = {
  token: undefined,
  admin: undefined,
  isAuthenticated: false,
  hydrate: () => {
    const token = Cookies.get("admin_token");
    setState({ token, admin: readAdmin(), isAuthenticated: Boolean(token) });
  },
  login: (token, admin) => {
    Cookies.set("admin_token", token, { expires: 7, sameSite: "lax" });
    Cookies.set("admin_user", JSON.stringify(admin), { expires: 7, sameSite: "lax" });
    setState({ token, admin, isAuthenticated: true });
  },
  logout: () => {
    Cookies.remove("admin_token"); Cookies.remove("admin_user");
    setState({ token: undefined, admin: undefined, isAuthenticated: false });
  },
};

export function useAuthStore<T = AuthState>(selector?: (state: AuthState) => T): T {
  return useSyncExternalStore(
    (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
    () => selector ? selector(snapshot) : (snapshot as T),
    () => selector ? selector(snapshot) : (snapshot as T),
  );
}
