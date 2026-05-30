// src/store/auth.store.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";
import Cookies from "js-cookie";

interface AuthState {
  token: string | null;
  username: string | null;
  role: string | null;
  isAuthenticated: boolean;
  login: (token: string, username: string, role: string) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      username: null,
      role: null,
      isAuthenticated: false,
      login: (token, username, role) => {
        Cookies.set("admin_token", token, { expires: 7, sameSite: "strict" });
        set({ token, username, role, isAuthenticated: true });
      },
      logout: () => {
        Cookies.remove("admin_token");
        set({ token: null, username: null, role: null, isAuthenticated: false });
        window.location.href = "/login";
      },
    }),
    { name: "propchi-auth", partialize: (s) => ({ token: s.token, username: s.username, role: s.role, isAuthenticated: s.isAuthenticated }) }
  )
);