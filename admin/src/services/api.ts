import axios, { AxiosError } from "axios";
import Cookies from "js-cookie";
import type { AdminUser, Lottery, LotteryWinner, ReferralAdminResponse, ReferralLeaderboardItem, ReferralSettings, ReferralStats, User, UserDetails, PostItem, MenuLayoutButton, MenuLayoutResponse, Season, LeaderboardEntry, LeaderboardStats, WheelSegment, WheelParticipant, SpinResult } from "@/types";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "https://botprophub-production.up.railway.app";

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
  async getAll(params: { page?: number; limit?: number; profileStatus?: "completed" | "incomplete"; phoneStatus?: "with_phone" | "without_phone" } = {}): Promise<{ users: User[]; total: number; pages: number }> {
    const { data } = await api.get("/api/users", { params: { page: params.page ?? 1, limit: params.limit ?? 20, profileStatus: params.profileStatus, phoneStatus: params.phoneStatus } });
    return data;
  },
  async getStats(): Promise<{ total: number; today: number; totalPoints: number }> {
    const { data } = await api.get("/api/users/stats");
    return data;
  },
  async getByTelegramId(telegramId: string): Promise<{ id: number; telegramId: string; username: string | null; firstName: string; lastName: string | null; isBlocked: boolean } | null> {
    try {
      const { data } = await api.get(`/api/users/by-telegram/${telegramId}`);
      return data;
    } catch {
      return null;
    }
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

export interface LotteryPayload {
  title: string;
  prize: string;
  winnersCount: number;
  entryCost: number;
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
  // ─── Wheel Lottery API ─────────────────────────────────────
  async getWheelParticipants(id: number): Promise<{ success: boolean; data: WheelParticipant[] }> {
    const { data } = await api.get(`/api/lotteries/${id}/wheel/participants`);
    return data;
  },
  async getWheelSegments(id: number): Promise<{ success: boolean; data: WheelSegment[] }> {
    const { data } = await api.get(`/api/lotteries/${id}/wheel/segments`);
    return data;
  },
  async spinWheel(id: number): Promise<{ success: boolean; data: SpinResult }> {
    const { data } = await api.post(`/api/lotteries/${id}/wheel/spin`);
    return data;
  },
  async recordWinner(id: number, winnerUserId: number): Promise<{ success: boolean; data: SpinResult }> {
    const { data } = await api.post(`/api/lotteries/${id}/wheel/record-winner`, { winnerUserId });
    return data;
  },
  async completeLottery(id: number): Promise<{ success: boolean; message: string }> {
    const { data } = await api.post(`/api/lotteries/${id}/wheel/complete`);
    return data;
  },
  async addParticipant(lotteryId: number, userId: number, chances = 1): Promise<{ success: boolean; data: WheelParticipant }> {
    const { data } = await api.post(`/api/lotteries/${lotteryId}/wheel/participants`, { userId, chances });
    return data;
  },
  async removeParticipant(lotteryId: number, userId: number): Promise<{ success: boolean; message: string }> {
    const { data } = await api.delete(`/api/lotteries/${lotteryId}/wheel/participants/${userId}`);
    return data;
  },
  async sendNotifications(id: number): Promise<{ success: boolean; data: { sentCount: number; totalWinners: number }; message: string }> {
    const { data } = await api.post(`/api/lotteries/${id}/notifications/send`);
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
  async updateSettings(payload: Partial<Pick<ReferralSettings, "inviteRewardPoints" | "isEnabled" | "referralShareText">>): Promise<{ success: boolean; settings: ReferralSettings }> {
    const { data } = await api.patch("/api/referrals/settings", payload);
    return data;
  },
};

export const seasonsApi = {
  async list(): Promise<{ success: boolean; data: Season[] }> {
    const { data } = await api.get("/api/leaderboard/seasons");
    return data;
  },
  async getActive(): Promise<{ success: boolean; data: Season | null }> {
    const { data } = await api.get("/api/leaderboard/seasons/active");
    return data;
  },
  async create(payload: { name: string; startDate: string; endDate: string }): Promise<{ success: boolean; data: Season }> {
    const { data } = await api.post("/api/leaderboard/seasons", payload);
    return data;
  },
  async activateSeason(id: number): Promise<{ success: boolean; data: Season }> {
    const { data } = await api.post(`/api/leaderboard/seasons/${id}/activate`);
    return data;
  },
  async endSeason(id: number): Promise<{ success: boolean; message: string }> {
    const { data } = await api.post(`/api/leaderboard/seasons/${id}/end`);
    return data;
  },
  async getLeaderboard(seasonId: number, limit = 10): Promise<{ success: boolean; data: { leaderboard: LeaderboardEntry[]; stats: LeaderboardStats } }> {
    const { data } = await api.get(`/api/leaderboard/seasons/${seasonId}/leaderboard`, { params: { limit } });
    return data;
  },
  async search(seasonId: number, q: string): Promise<{ success: boolean; data: LeaderboardEntry[] }> {
    const { data } = await api.get(`/api/leaderboard/seasons/${seasonId}/search`, { params: { q } });
    return data;
  },
};

export type TelegramGroupStatus = "PENDING" | "APPROVED" | "REJECTED" | "DISABLED";
export type KeywordReplyResponseType = "TEXT" | "PHOTO" | "DOCUMENT";
export interface KeywordReplyPayload { keyword: string; response?: string | null; responseType: KeywordReplyResponseType; parseMode?: import("@/types").BroadcastParseMode | null; mediaFileId?: string | null; isActive?: boolean; }

export const groupsApi = {
  async getAll(): Promise<{ success: boolean; items: import("@/types").TelegramGroup[] }> {
    const { data } = await api.get("/api/groups");
    return data;
  },
  async setStatus(id: number, status: TelegramGroupStatus): Promise<{ success: boolean; group: import("@/types").TelegramGroup }> {
    const { data } = await api.patch(`/api/groups/${id}/status`, { status });
    return data;
  },
  async refreshAdmin(id: number): Promise<{ success: boolean; group: import("@/types").TelegramGroup }> {
    const { data } = await api.post(`/api/groups/${id}/refresh-admin`);
    return data;
  },
};

export const keywordRepliesApi = {
  async getAll(): Promise<{ success: boolean; items: import("@/types").KeywordReply[] }> {
    const { data } = await api.get("/api/keyword-replies");
    return data;
  },
  async create(payload: KeywordReplyPayload): Promise<{ success: boolean; item: import("@/types").KeywordReply }> {
    const { data } = await api.post("/api/keyword-replies", payload);
    return data;
  },
  async update(id: number, payload: Partial<KeywordReplyPayload>): Promise<{ success: boolean; item: import("@/types").KeywordReply }> {
    const { data } = await api.patch(`/api/keyword-replies/${id}`, payload);
    return data;
  },
  async delete(id: number): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/api/keyword-replies/${id}`);
    return data;
  },
  async history(): Promise<{ success: boolean; items: import("@/types").KeywordReplyLog[] }> {
    const { data } = await api.get("/api/keyword-replies/history");
    return data;
  },
};

export default api;

export interface RequiredChannelPayload {
  title: string;
  displayTitle?: string | null;
  chatId: string;
  username?: string | null;
  type: "CHANNEL" | "GROUP";
  inviteLink?: string | null;
  buttonText?: string | null;
  isActive?: boolean;
  status?: import("@/types").RequiredChannelStatus;
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
  async refreshBotStatus(id: number): Promise<{ success: boolean; channel: import("@/types").RequiredChannel }> {
    const { data } = await api.post(`/api/required-channels/${id}/refresh-bot-status`);
    return data;
  },
  async delete(id: number): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/api/required-channels/${id}`);
    return data;
  },
  async refreshCache(): Promise<{ success: boolean; message: string }> {
    const { data } = await api.post("/api/required-channels/refresh-cache");
    return data;
  },
};

export const attributionApi = {
  async getUser(userId: number): Promise<{ success: boolean; data: import("@/types").UserAttributionResponse }> {
    const { data } = await api.get(`/api/attribution/user/${userId}`);
    return data;
  },
  async getByTelegramId(telegramId: string): Promise<{ success: boolean; data: import("@/types").UserAttributionResponse }> {
    const { data } = await api.get(`/api/attribution/telegram/${telegramId}`);
    return data;
  },
  async validate(userId: number): Promise<{ success: boolean; data: import("@/types").AttributionValidation }> {
    const { data } = await api.get(`/api/attribution/validate/${userId}`);
    return data;
  },
  async getLowConfidence(minConfidence?: number, limit?: number): Promise<{ success: boolean; data: import("@/types").LowConfidenceUser[] }> {
    const { data } = await api.get("/api/attribution/low-confidence", { params: { minConfidence, limit } });
    return data;
  },
};

export const broadcastDiagnosticsApi = {
  async getKPIs(broadcastId?: number): Promise<{ success: boolean; data: import("@/types").BroadcastKPIs }> {
    const { data } = await api.get("/api/broadcast-diagnostics/kpis", { params: { broadcastId } });
    return data;
  },
  async getHistory(params: { page?: number; limit?: number } = {}): Promise<{ success: boolean; data: { items: import("@/types").BroadcastDiagnosticsItem[]; total: number; pages: number } }> {
    const { data } = await api.get("/api/broadcast-diagnostics/history", { params });
    return data;
  },
  async getDetails(broadcastId: number): Promise<{ success: boolean; data: import("@/types").BroadcastDetails }> {
    const { data } = await api.get(`/api/broadcast-diagnostics/details/${broadcastId}`);
    return data;
  },
  async getIntegrity(): Promise<{ success: boolean; data: import("@/types").IntegrityAudit }> {
    const { data } = await api.get("/api/broadcast-diagnostics/integrity");
    return data;
  },
  async dryRun(broadcastId: number): Promise<{ success: boolean; data: import("@/types").DryRunResult }> {
    const { data } = await api.get(`/api/broadcast-diagnostics/dry-run/${broadcastId}`);
    return data;
  },
  async validate(broadcastId: number): Promise<{ success: boolean; data: import("@/types").ValidationResult }> {
    const { data } = await api.get(`/api/broadcast-diagnostics/validate/${broadcastId}`);
    return data;
  },
};

export const broadcastRcaApi = {
  async analyze(broadcastId: number): Promise<{ success: boolean; data: import("@/types").BroadcastRcaResult }> {
    const { data } = await api.get(`/api/broadcast-rca/analyze/${broadcastId}`);
    return data;
  },
  async getIntegrity(): Promise<{ success: boolean; data: import("@/types").DataIntegrityReport }> {
    const { data } = await api.get("/api/broadcast-rca/integrity");
    return data;
  },
  async getExplorer(broadcastId: number, category: string): Promise<{ success: boolean; data: import("@/types").ErrorExplorerItem[] }> {
    const { data } = await api.get(`/api/broadcast-rca/explorer/${broadcastId}/${category}`);
    return data;
  },
  async getSystemErrors(broadcastId?: number): Promise<{ success: boolean; data: import("@/types").SystemErrorUser[] }> {
    const { data } = await api.get("/api/broadcast-rca/system-errors", { params: { broadcastId } });
    return data;
  },
};

export const systemIntegrityApi = {
  async getHealth(): Promise<{ success: boolean; data: import("@/types").SystemHealthReport }> {
    const { data } = await api.get("/api/system-integrity/health");
    return data;
  },
};

export const userDeleteApi = {
  async getPreview(userId: number): Promise<{ success: boolean; data: import("@/types").DeletePreview }> {
    const { data } = await api.get(`/api/admin/users/${userId}/delete-preview`);
    return data;
  },
  async deleteUser(userId: number): Promise<{ success: boolean; data: import("@/types").DeleteResult }> {
    const { data } = await api.delete(`/api/admin/users/${userId}`);
    return data;
  },
  async getDeletedUsers(params: { page?: number; limit?: number } = {}): Promise<{ success: boolean; data: { items: import("@/types").DeletedUserAudit[]; total: number; pages: number } }> {
    const { data } = await api.get("/api/admin/users/deleted", { params });
    return data;
  },
};

export const userEventApi = {
  async getEvents(userId: number, params: { page?: number; limit?: number; eventType?: string } = {}): Promise<{ success: boolean; data: { items: import("@/types").UserEvent[]; total: number; pages: number } }> {
    const { data } = await api.get(`/api/user-events/${userId}/events`, { params });
    return data;
  },
  async getMessages(userId: number, params: { page?: number; limit?: number; messageType?: string } = {}): Promise<{ success: boolean; data: { items: import("@/types").UserMessageHistory[]; total: number; pages: number } }> {
    const { data } = await api.get(`/api/user-events/${userId}/messages`, { params });
    return data;
  },
  async getTimeline(userId: number, limit?: number): Promise<{ success: boolean; data: import("@/types").UserTimelineItem[] }> {
    const { data } = await api.get(`/api/user-events/${userId}/timeline`, { params: { limit } });
    return data;
  },
};

export const analyticsApi = {
  async dashboard(): Promise<{ success: boolean; data: import("@/types").AnalyticsDashboard }> {
    const { data } = await api.get("/api/analytics/dashboard");
    return data;
  },
  async users(params: { startDate: string; endDate: string; compareStart?: string; compareEnd?: string }): Promise<{ success: boolean; data: import("@/types").UserAnalyticsResponse }> {
    const { data } = await api.get("/api/analytics/users", { params });
    return data;
  },
  async acquisition(params: { startDate: string; endDate: string }): Promise<{ success: boolean; data: import("@/types").AcquisitionResponse }> {
    const { data } = await api.get("/api/analytics/acquisition", { params });
    return data;
  },
  async heatmap(params: { startDate: string; endDate: string }): Promise<{ success: boolean; data: import("@/types").HeatmapResponse }> {
    const { data } = await api.get("/api/analytics/heatmap", { params });
    return data;
  },
};

export interface BotAdminPayload {
  telegramId: string;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  role: import("@/types").BotAdminRole;
  status?: import("@/types").BotAdminStatus;
}

export const botAdminsApi = {
  async getAll(): Promise<{ success: boolean; items: import("@/types").BotAdmin[] }> {
    const { data } = await api.get("/api/bot-admins");
    return data;
  },
  async create(payload: BotAdminPayload): Promise<{ success: boolean; item: import("@/types").BotAdmin }> {
    const { data } = await api.post("/api/bot-admins", payload);
    return data;
  },
  async update(id: number, payload: Partial<BotAdminPayload>): Promise<{ success: boolean; item: import("@/types").BotAdmin }> {
    const { data } = await api.patch(`/api/bot-admins/${id}`, payload);
    return data;
  },
  async delete(id: number): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/api/bot-admins/${id}`);
    return data;
  },
};

export const systemLogsApi = {
  async getAll(params: { page?: number; limit?: number; eventType?: import("@/types").SystemEventType; telegramId?: string; userId?: number; from?: string; to?: string } = {}): Promise<{ success: boolean; items: import("@/types").SystemLog[]; total: number; pages: number }> {
    const { data } = await api.get("/api/system-logs", { params: { page: params.page ?? 1, limit: params.limit ?? 20, ...params } });
    return data;
  },
};

export const miniAppLogsApi = {
  async getAll(params: { page?: number; limit?: number; eventType?: string; telegramId?: string; from?: string; to?: string } = {}): Promise<{ success: boolean; items: import("@/types").MiniAppDebugLog[]; total: number; pages: number }> {
    const { data } = await api.get("/api/mini-app-logs", { params: { page: params.page ?? 1, limit: params.limit ?? 50, ...params } });
    return data;
  },
  async getReport(): Promise<{ success: boolean; data: import("@/types").MiniAppLogsReport }> {
    const { data } = await api.get("/api/mini-app-logs/report");
    return data;
  },
};

export const scoringApi = {
  async getSettings(): Promise<{ success: boolean; item: import("@/types").ScoringSettings }> {
    const { data } = await api.get("/api/scoring/settings");
    return data;
  },
  async updateSettings(payload: Partial<import("@/types").ScoringSettings>): Promise<{ success: boolean; item: import("@/types").ScoringSettings }> {
    const { data } = await api.patch("/api/scoring/settings", payload);
    return data;
  },
};

export const settingsApi = {
  async getFeatures(): Promise<{ success: boolean; items: import("@/types").FeatureToggleItem[] }> {
    const { data } = await api.get("/api/settings/services");
    return data;
  },
  async updateFeature(key: string, isEnabled: boolean): Promise<{ success: boolean; item: import("@/types").FeatureToggleItem }> {
    const { data } = await api.patch(`/api/settings/services/${key}`, { isEnabled });
    return data;
  },
  async getMiniAppSettings(): Promise<{ success: boolean; settings: import("@/types").MiniAppContentSettings }> {
    const { data } = await api.get("/api/settings/mini-app");
    return data;
  },
  async updateMiniAppSettings(payload: Partial<import("@/types").MiniAppContentSettings>): Promise<{ success: boolean; settings: import("@/types").MiniAppContentSettings }> {
    const { data } = await api.patch("/api/settings/mini-app", payload);
    return data;
  },
  async getMenuDisplayMode(): Promise<{ success: boolean; mode: 'always_open' | 'toggle_allowed' }> {
    const { data } = await api.get("/api/settings/menu-display-mode");
    return data;
  },
  async setMenuDisplayMode(mode: 'always_open' | 'toggle_allowed'): Promise<{ success: boolean; mode: string }> {
    const { data } = await api.put("/api/settings/menu-display-mode", { mode });
    return data;
  },
};


export interface PanelAdminPayload {
  firstName?: string | null;
  lastName?: string | null;
  username?: string;
  email?: string | null;
  password?: string;
  role?: "OWNER" | "ADMIN";
  isActive?: boolean;
}

export const adminUsersApi = {
  async getAll(): Promise<{ success: boolean; items: import("@/types").PanelAdminUser[] }> {
    const { data } = await api.get("/api/admin-users");
    return data;
  },
  async create(payload: PanelAdminPayload): Promise<{ success: boolean; item: import("@/types").PanelAdminUser }> {
    const { data } = await api.post("/api/admin-users", payload);
    return data;
  },
  async update(id: number, payload: PanelAdminPayload): Promise<{ success: boolean; item: import("@/types").PanelAdminUser }> {
    const { data } = await api.patch(`/api/admin-users/${id}`, payload);
    return data;
  },
  async delete(id: number): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/api/admin-users/${id}`);
    return data;
  },
};

export interface PostPayload {
  title: string;
  slug: string;
  content?: string;
  caption?: string;
  mediaFileId?: string;
  mediaType?: string;
  parseMode?: "Markdown" | "HTML";
  buttons?: any;
  entities?: any;
  telegramPayload?: any;
  messages?: any;
  telegramMessageSnapshot?: any;
  contentFormat?: string;
  contentVersion?: number;
  command?: string;
  status?: "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED" | "HIDDEN";
  sortOrder?: number;
}

export const postsApi = {
  async getAll(params: { page?: number; limit?: number; status?: string; search?: string } = {}): Promise<{ items: PostItem[]; total: number; pages: number }> {
    const { data } = await api.get("/api/posts", { params: { page: params.page ?? 1, limit: params.limit ?? 20, status: params.status, search: params.search } });
    return data;
  },
  async getById(id: number): Promise<PostItem> {
    const { data } = await api.get(`/api/posts/${id}`);
    return data;
  },
  async create(payload: PostPayload): Promise<PostItem> {
    const { data } = await api.post("/api/posts", payload);
    return data;
  },
  async update(id: number, payload: Partial<PostPayload>): Promise<PostItem> {
    const { data } = await api.put(`/api/posts/${id}`, payload);
    return data;
  },
  async delete(id: number): Promise<{ success: boolean; message: string }> {
    const { data } = await api.delete(`/api/posts/${id}`);
    return data;
  },
  async publish(id: number): Promise<PostItem> {
    const { data } = await api.post(`/api/posts/${id}/publish`);
    return data;
  },
  async unpublish(id: number): Promise<PostItem> {
    const { data } = await api.post(`/api/posts/${id}/unpublish`);
    return data;
  },
  async hide(id: number): Promise<PostItem> {
    const { data } = await api.post(`/api/posts/${id}/hide`);
    return data;
  },
  async duplicate(id: number): Promise<PostItem> {
    const { data } = await api.post(`/api/posts/${id}/duplicate`);
    return data;
  },
  async addCommand(id: number, command: string, aliases?: string[]): Promise<{ id: number }> {
    const { data } = await api.post(`/api/posts/${id}/commands`, { command, aliases });
    return data;
  },
  async removeCommand(id: number, commandId: number): Promise<{ success: boolean }> {
    const { data } = await api.delete(`/api/posts/${id}/commands/${commandId}`);
    return data;
  },
  async getGlobalAnalytics(): Promise<any> {
    const { data } = await api.get("/api/posts/global-analytics");
    return data;
  },
  async getAnalytics(id: number): Promise<any> {
    const { data } = await api.get(`/api/posts/${id}/analytics`);
    return data;
  },
  async getVersions(id: number): Promise<any[]> {
    const { data } = await api.get(`/api/posts/${id}/versions`);
    return data;
  },
  async syncMenu(id: number): Promise<{ success: boolean; message: string; layout: MenuLayoutButton[][] }> {
    const { data } = await api.post(`/api/posts/${id}/sync-menu`);
    return data;
  },
};

export const menuApi = {
  async getLayout(): Promise<MenuLayoutResponse> {
    const { data } = await api.get("/api/menu/layout");
    return data;
  },
  async saveLayout(layout: MenuLayoutButton[][]): Promise<MenuLayoutResponse> {
    const { data } = await api.put("/api/menu/layout", layout);
    return data;
  },
  async syncPosts(): Promise<{ success: boolean; message: string; version: number }> {
    const { data } = await api.post("/api/menu/sync-posts");
    return data;
  },
  async addPost(postId: number, title: string): Promise<{ success: boolean; layout: MenuLayoutButton[][] }> {
    const { data } = await api.post("/api/menu/add-post", { postId, title });
    return data;
  },
  async removePost(postId: number): Promise<{ success: boolean; layout: MenuLayoutButton[][] }> {
    const { data } = await api.post("/api/menu/remove-post", { postId });
    return data;
  },
  async getSnapshot(): Promise<{ success: boolean; snapshot: any }> {
    const { data } = await api.get("/api/menu/snapshot");
    return data;
  },
  async rollback(): Promise<{ success: boolean; message: string; layout: MenuLayoutButton[][] }> {
    const { data } = await api.post("/api/menu/rollback");
    return data;
  },
  async getVersion(): Promise<{ success: boolean; currentVersion: number }> {
    const { data } = await api.get("/api/menu/undo-history");
    return data;
  },
  async deleteButton(buttonId: string): Promise<{ success: boolean; message: string; layout: MenuLayoutButton[][]; version: number }> {
    const { data } = await api.post("/api/menu/delete-button", { buttonId });
    return data;
  },
};

export const searchApi = {
  async users(params: Record<string, any>): Promise<{ success: boolean; items: any[]; total: number; pages: number }> {
    const { data } = await api.get("/api/search/users", { params });
    return data;
  },
  async broadcasts(params: Record<string, any>): Promise<{ success: boolean; items: any[]; total: number; pages: number }> {
    const { data } = await api.get("/api/search/broadcasts", { params });
    return data;
  },
  async featureToggles(params: Record<string, any>): Promise<{ success: boolean; items: any[]; total: number; pages: number }> {
    const { data } = await api.get("/api/search/feature-toggles", { params });
    return data;
  },
  async settings(params: Record<string, any>): Promise<{ success: boolean; items: any[]; total: number; pages: number }> {
    const { data } = await api.get("/api/search/settings", { params });
    return data;
  },
  async posts(params: Record<string, any>): Promise<{ success: boolean; items: any[]; total: number; pages: number }> {
    const { data } = await api.get("/api/search/posts", { params });
    return data;
  },
  async referrals(params: Record<string, any>): Promise<{ success: boolean; items: any[]; total: number; pages: number }> {
    const { data } = await api.get("/api/search/referrals", { params });
    return data;
  },
  async botAdmins(params: Record<string, any>): Promise<{ success: boolean; items: any[]; total: number; pages: number }> {
    const { data } = await api.get("/api/search/bot-admins", { params });
    return data;
  },
  async lotteries(params: Record<string, any>): Promise<{ success: boolean; items: any[]; total: number; pages: number }> {
    const { data } = await api.get("/api/search/lotteries", { params });
    return data;
  },
};



export const forceJoinApi = {
  async get(): Promise<any> {
    const { data } = await api.get("/api/admin/force-join");
    return data;
  },
  async getSettings(): Promise<any> {
    const { data } = await api.get("/api/admin/force-join");
    return data;
  },
  async update(settings: any): Promise<any> {
    const { data } = await api.put("/api/admin/force-join", settings);
    return data;
  },
  async updateSettings(settings: any): Promise<any> {
    const { data } = await api.put("/api/admin/force-join", settings);
    return data;
  },
  async resetToDefaults(): Promise<any> {
    const { data } = await api.post("/api/admin/force-join/reset");
    return data;
  },
};

export const ticketCategoryApi = {
  async listAll(): Promise<any[]> {
    const { data } = await api.get("/api/ticket-categories", { params: { all: "true" } });
    return data;
  },
  async create(title: string): Promise<any> {
    const { data } = await api.post("/api/ticket-categories", { title });
    return data;
  },
  async update(id: number, payload: { title?: string; enabled?: boolean; order?: number }): Promise<any> {
    const { data } = await api.patch(`/api/ticket-categories/${id}`, payload);
    return data;
  },
  async remove(id: number): Promise<any> {
    const { data } = await api.delete(`/api/ticket-categories/${id}`);
    return data;
  },
  async reorder(ids: number[]): Promise<any> {
    const { data } = await api.post("/api/ticket-categories/reorder", { ids });
    return data;
  },
};

export const automationApi = {
  async getDashboard(): Promise<any> {
    const { data } = await api.get("/api/automation/dashboard");
    return data;
  },
  async getActivity(params: { page?: number; limit?: number; eventType?: string; source?: string; status?: string; from?: string; to?: string; search?: string } = {}): Promise<any> {
    const { data } = await api.get("/api/automation/activity", { params: { page: params.page ?? 1, limit: params.limit ?? 50, ...params } });
    return data;
  },
  async getAnalytics(): Promise<any> {
    const { data } = await api.get("/api/automation/analytics");
    return data;
  },
};

export const scheduledMessagesApi = {
  async getAll(params?: { page?: number; limit?: number; status?: string }): Promise<any> {
    const { data } = await api.get("/api/scheduled-messages", { params });
    return data;
  },
  async getById(id: number): Promise<any> {
    const { data } = await api.get(`/api/scheduled-messages/${id}`);
    return data;
  },
  async getStats(): Promise<any> {
    const { data } = await api.get("/api/scheduled-messages/stats");
    return data;
  },
  async getLogs(id: number, limit?: number): Promise<any> {
    const { data } = await api.get(`/api/scheduled-messages/${id}/logs`, { params: { limit } });
    return data;
  },
  async update(id: number, payload: any): Promise<any> {
    const { data } = await api.patch(`/api/scheduled-messages/${id}`, payload);
    return data;
  },
};

export const autoRepliesApi = {
  async getAll(params?: { page?: number; limit?: number }): Promise<any> {
    const { data } = await api.get("/api/auto-replies", { params });
    return data;
  },
  async getById(id: number): Promise<any> {
    const { data } = await api.get(`/api/auto-replies/${id}`);
    return data;
  },
  async getStats(): Promise<any> {
    const { data } = await api.get("/api/auto-replies/stats");
    return data;
  },
  async getLogs(id: number, limit?: number): Promise<any> {
    const { data } = await api.get(`/api/auto-replies/${id}/logs`, { params: { limit } });
    return data;
  },
};
