// src/services/api.ts

import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";

import Cookies from "js-cookie";

// ─────────────────────────────────────────────
// BASE URL
// ─────────────────────────────────────────────

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  "https://botpropchi-production.up.railway.app";

// ─────────────────────────────────────────────
// AXIOS INSTANCE
// ─────────────────────────────────────────────

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ─────────────────────────────────────────────
// REQUEST INTERCEPTOR
// ─────────────────────────────────────────────

api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = Cookies.get("admin_token");

    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // LOGS
    console.group("🚀 API REQUEST");
    console.log("URL:", `${config.baseURL}${config.url}`);
    console.log("METHOD:", config.method?.toUpperCase());
    console.log("HEADERS:", config.headers);
    console.log("PARAMS:", config.params || null);
    console.log("DATA:", config.data || null);
    console.groupEnd();

    return config;
  },
  (error) => {
    console.error("❌ REQUEST ERROR:", error);
    return Promise.reject(error);
  }
);

// ─────────────────────────────────────────────
// RESPONSE INTERCEPTOR
// ─────────────────────────────────────────────

api.interceptors.response.use(
  (response: AxiosResponse) => {
    console.group("✅ API RESPONSE");
    console.log("URL:", response.config.url);
    console.log("STATUS:", response.status);
    console.log("DATA:", response.data);
    console.groupEnd();

    return response;
  },

  (error: AxiosError<any>) => {
    console.group("❌ API ERROR");

    console.error("URL:", error.config?.url);
    console.error("METHOD:", error.config?.method);
    console.error("STATUS:", error.response?.status);
    console.error("MESSAGE:", error.message);
    console.error("RESPONSE DATA:", error.response?.data);

    console.groupEnd();

    // logout on unauthorized
    if (error.response?.status === 401) {
      Cookies.remove("admin_token");

      if (typeof window !== "undefined") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

// ─────────────────────────────────────────────
// AUTH API
// ─────────────────────────────────────────────

export const authApi = {
  login: async (username: string, password: string) => {
    const response = await api.post("/api/auth/login", {
      username,
      password,
    });

    return response.data;
  },

  me: async () => {
    const response = await api.get("/api/auth/me");

    return response.data;
  },
};

// ─────────────────────────────────────────────
// USERS API
// ─────────────────────────────────────────────

export const usersApi = {
  getAll: async (page = 1, search?: string) => {
    const response = await api.get("/api/users", {
      params: {
        page,
        search,
      },
    });

    return response.data;
  },

  getStats: async () => {
    const response = await api.get("/api/users/stats");

    return response.data;
  },

  block: async (
    id: number,
    isBlocked: boolean
  ) => {
    const response = await api.patch(
      `/api/users/${id}/block`,
      {
        isBlocked,
      }
    );

    return response.data;
  },

  addPoints: async (
    id: number,
    amount: number,
    description?: string
  ) => {
    const response = await api.post(
      `/api/users/${id}/points`,
      {
        amount,
        description,
      }
    );

    return response.data;
  },
};

// ─────────────────────────────────────────────
// DISCOUNTS API
// ─────────────────────────────────────────────

export const discountsApi = {
  getAll: async (page = 1) => {
    const response = await api.get(
      "/api/discounts",
      {
        params: { page },
      }
    );

    return response.data;
  },

  create: async (data: any) => {
    console.group("🟡 CREATE DISCOUNT");
    console.log("PAYLOAD:", data);
    console.groupEnd();

    const response = await api.post(
      "/api/discounts",
      data
    );

    console.group("🟢 CREATE DISCOUNT RESPONSE");
    console.log(response.data);
    console.groupEnd();

    return response.data;
  },

  update: async (
    id: number,
    data: any
  ) => {
    const response = await api.put(
      `/api/discounts/${id}`,
      data
    );

    return response.data;
  },

  delete: async (id: number) => {
    const response = await api.delete(
      `/api/discounts/${id}`
    );

    return response.data;
  },

  getPropFirms: async () => {
    const response = await api.get(
      "/api/discounts/prop-firms"
    );

    console.group("🏢 PROP FIRMS");
    console.log(response.data);
    console.groupEnd();

    return response.data;
  },

  createPropFirm: async (data: any) => {
    console.group("🟡 CREATE PROP FIRM");
    console.log("PAYLOAD:", data);
    console.groupEnd();

    const response = await api.post(
      "/api/discounts/prop-firms",
      data
    );

    console.group("🟢 CREATE PROP FIRM RESPONSE");
    console.log(response.data);
    console.groupEnd();

    return response.data;
  },
};

// ───────────────── LOTTERIES API ─────────────────

export const lotteriesApi = {
  getAll: async () => {
    const res = await api.get("/api/lotteries");

    console.log("🎯 LOTTERIES RAW RESPONSE:");
    console.log(res.data);

    // اگر بک‌اند مستقیم آرایه برگرداند
    if (Array.isArray(res.data)) {
      return res.data;
    }

    // اگر داخل data باشد
    if (Array.isArray(res.data?.data)) {
      return res.data.data;
    }

    // اگر داخل lotteries باشد
    if (Array.isArray(res.data?.lotteries)) {
      return res.data.lotteries;
    }

    console.warn("⚠️ Unknown lotteries response shape");

    return [];
  },

  create: async (data: any) => {
    console.log("🟡 CREATE LOTTERY PAYLOAD:", data);

    const res = await api.post("/api/lotteries", data);

    console.log("🟢 CREATE LOTTERY RESPONSE:");
    console.log(res.data);

    return res.data;
  },

  draw: async (id: number) => {
    console.log("🎲 DRAW LOTTERY:", id);

    const res = await api.post(`/api/lotteries/${id}/draw`);

    console.log("🏆 DRAW RESPONSE:");
    console.log(res.data);

    return res.data;
  },
};

// ─────────────────────────────────────────────

export default api;
