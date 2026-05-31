import axios, { AxiosError } from "axios";
import Cookies from "js-cookie";
import type { AdminUser, DiscountCategory, DiscountCode, Lottery, LotteryWinner, PropFirm, ReferralAdminResponse, ReferralLeaderboardItem, ReferralSettings, ReferralStats, User, UserDetails } from "@/types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://botpropchi-production.up.railway.app";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  headers: { "Content-Type": "application/json" },
});

export function getApiError(error: unknown, fallback = "خطای نامشخص رخ داد") {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { error?: unknown; message?: string } | undefined;
    if (typeof data?.error === "string") return data.error;
    if (typeof data?.message === "string") return data.message;
    if (data?.error && typeof data.error === "object") return "اطلاعات ارسالی معتبر نیست";
    return error.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

api.interceptors.request.use((config) => {
  const token = Cookies.get("admin_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    if (error.response?.status === 401) {
      Cookies.remove("admin_token");
      Cookies.remove("admin_user");
      if (typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  },
);

export const authApi = {
  async login(username: string, password: string): Promise<{ success: boolean; token: string; admin: AdminUser }> {
    const { data } = await api.post("/api/auth/login", { username, password });
    return data;
  },
  async me(): Promise<{ success: boolean; admin: AdminUser }> {
    const { data } = await api.get("/api/auth/me");
    return data;
  },
};

export const usersApi = {
  async getAll(params: { page?: number; limit?: number } = {}): Promise<{ users: User[]; total: number; pages: number }> {
    const { data } = await api.get("/api/users", { params: { page: params.page ?? 1, limit: params.limit ?? 20 } });
    return data;
  },
  async getStats(): Promise<{ total: number; today: number; totalPoints: number }> {
    const { data } = await api.get("/api/users/stats");
    return data;
  },
  async getById(id: number): Promise<UserDetails> {
    const { data } = await api.get(`/api/users/${id}`);
    return data;
  },
  async setBlocked(id: number, isBlocked: boolean): Promise<{ id: number; isBlocked: boolean }> {
    const { data } = await api.patch(`/api/users/${id}/block`, { isBlocked });
    return data;
  },
  async grantPoints(id: number, amount: number, description?: string): Promise<{ success: boolean; message: string }> {
    const { data } = await api.post(`/api/users/${id}/grant`, { amount, description });
    return data;
  },
};

export interface DiscountPayload {
  title: string;
  code: string;
  discountPercent: number;
  propFirmId: number;
  affiliateLink?: string | null;
  expiresAt?: string | null;
  isFeatured: boolean;
  isActive: boolean;
  category: DiscountCategory;
}

export const discountsApi = {
  async getAll(params: { page?: number; limit?: number; q?: string; category?: DiscountCategory | "" } = {}): Promise<{ items: DiscountCode[]; total: number; pages: number }> {
    const { data } = await api.get("/api/discounts", { params: { page: params.page ?? 1, limit: params.limit ?? 10, q: params.q || undefined, category: params.category || undefined } });
    return data;
  },
  async getById(id: number): Promise<DiscountCode> {
    const { data } = await api.get(`/api/discounts/${id}`);
    return data;
  },
  async create(payload: DiscountPayload): Promise<DiscountCode> {
    const { data } = await api.post("/api/discounts", payload);
    return data;
  },
  async update(id: number, payload: Partial<DiscountPayload>): Promise<DiscountCode> {
    const { data } = await api.put(`/api/discounts/${id}`, payload);
    return data;
  },
  async delete(id: number): Promise<{ success: boolean; message: string }> {
    const { data } = await api.delete(`/api/discounts/${id}`);
    return data;
  },
  async getPropFirms(): Promise<PropFirm[]> {
    const { data } = await api.get("/api/discounts/prop-firms");
    return data;
  },
  async createPropFirm(payload: Omit<PropFirm, "id" | "createdAt" | "updatedAt" | "_count">): Promise<PropFirm> {
    const { data } = await api.post("/api/discounts/prop-firms", payload);
    return data;
  },
};

export interface LotteryPayload {
  title: string;
  description?: string | null;
  prize: string;
  startAt: string;
  endAt: string;
  winnersCount: number;
  minPoints: number;
  entryCost: number;
  isActive: boolean;
  announcementMsg?: string | null;
}

export const lotteriesApi = {
  async getAll(params: { page?: number; limit?: number } = {}): Promise<{ success: boolean; items: Lottery[]; total: number; pages: number }> {
    const { data } = await api.get("/api/lotteries", { params: { page: params.page ?? 1, limit: params.limit ?? 20 } });
    return data;
  },
  async getById(id: number): Promise<{ success: boolean; lottery: Lottery }> {
    const { data } = await api.get(`/api/lotteries/${id}`);
    return data;
  },
  async create(payload: LotteryPayload): Promise<{ success: boolean; lottery: Lottery }> {
    const { data } = await api.post("/api/lotteries", payload);
    return data;
  },
  async update(id: number, payload: Partial<LotteryPayload>): Promise<{ success: boolean; lottery: Lottery }> {
    const { data } = await api.put(`/api/lotteries/${id}`, payload);
    return data;
  },
  async delete(id: number): Promise<{ success: boolean; message: string }> {
    const { data } = await api.delete(`/api/lotteries/${id}`);
    return data;
  },
  async draw(id: number): Promise<{ success: boolean; winners: LotteryWinner[]; message: string }> {
    const { data } = await api.post(`/api/lotteries/${id}/draw`);
    return data;
  },
  async getWinners(id: number): Promise<{ success: boolean; winners: LotteryWinner[] }> {
    const { data } = await api.get(`/api/lotteries/${id}/winners`);
    return data;
  },
};


export const referralsApi = {
  async getAdmin(params: { page?: number; limit?: number; q?: string; referrerId?: number } = {}): Promise<ReferralAdminResponse> {
    const { data } = await api.get("/api/referrals/admin", { params: { page: params.page ?? 1, limit: params.limit ?? 20, q: params.q || undefined, referrerId: params.referrerId } });
    return data;
  },
  async getStats(): Promise<{ success: boolean; data: ReferralStats }> {
    const { data } = await api.get("/api/referrals/stats");
    return data;
  },
  async getLeaderboard(limit = 10): Promise<{ success: boolean; data: ReferralLeaderboardItem[] }> {
    const { data } = await api.get("/api/referrals/leaderboard", { params: { limit } });
    return data;
  },
  async updateSettings(payload: Partial<Pick<ReferralSettings, "inviteRewardPoints" | "isEnabled">>): Promise<{ success: boolean; settings: ReferralSettings }> {
    const { data } = await api.patch("/api/referrals/settings", payload);
    return data;
  },
};

export default api;

export interface RequiredChannelPayload {
  title: string;
  chatId: string;
  username?: string | null;
  type: "CHANNEL" | "GROUP";
  inviteLink?: string | null;
  isActive?: boolean;
}

export const requiredChannelsApi = {
  async getAll(): Promise<{ success: boolean; items: import("@/types").RequiredChannel[] }> {
    const { data } = await api.get("/api/required-channels");
    return data;
  },
  async create(payload: RequiredChannelPayload): Promise<{ success: boolean; channel: import("@/types").RequiredChannel }> {
    const { data } = await api.post("/api/required-channels", payload);
    return data;
  },
  async update(id: number, payload: Partial<RequiredChannelPayload>): Promise<{ success: boolean; channel: import("@/types").RequiredChannel }> {
    const { data } = await api.patch(`/api/required-channels/${id}`, payload);
    return data;
  },
  async delete(id: number): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/api/required-channels/${id}`);
    return data;
  },
};

export interface BroadcastPayload {
  title: string;
  messageType: import("@/types").BroadcastType;
  content?: string | null;
  mediaFileId?: string | null;
  mediaItems?: unknown;
  parseMode?: import("@/types").BroadcastParseMode | null;
  inlineKeyboard?: Array<Array<{ text: string; url?: string; callback_data?: string }>>;
  scheduledAt?: string | null;
}

export const broadcastsApi = {
  async getAll(params: { page?: number; limit?: number; status?: import("@/types").BroadcastStatus } = {}): Promise<{ success: boolean; items: import("@/types").Broadcast[]; total: number; pages: number }> {
    const { data } = await api.get("/api/broadcasts", { params: { page: params.page ?? 1, limit: params.limit ?? 20, status: params.status } });
    return data;
  },
  async getById(id: number): Promise<{ success: boolean; broadcast: import("@/types").Broadcast }> {
    const { data } = await api.get(`/api/broadcasts/${id}`);
    return data;
  },
  async create(payload: BroadcastPayload): Promise<{ success: boolean; broadcast: import("@/types").Broadcast }> {
    const { data } = await api.post("/api/broadcasts", payload);
    return data;
  },
  async action(id: number, action: "enqueue" | "pause" | "resume" | "cancel" | "retry"): Promise<{ success: boolean; broadcast: import("@/types").Broadcast }> {
    const { data } = await api.post(`/api/broadcasts/${id}/${action}`);
    return data;
  },
  async sendTest(id: number, telegramId?: string): Promise<{ success: boolean }> {
    const { data } = await api.post(`/api/broadcasts/${id}/test`, { telegramId });
    return data;
  },
};
