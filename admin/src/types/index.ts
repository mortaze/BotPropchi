export type AdminRole = "SUPER_ADMIN" | "ADMIN" | "MODERATOR";

export interface AdminUser {
  id: number;
  username: string;
  role: AdminRole;
  isActive?: boolean;
  lastLoginAt?: string | null;
  createdAt?: string;
}

export interface Paginated<T, K extends string = "items"> {
  total: number;
  pages: number;
  [key: string]: T[] | number;
}

export interface User {
  id: number;
  telegramId: string;
  username?: string | null;
  firstName: string;
  lastName?: string | null;
  points: number;
  totalReferrals: number;
  referralCount?: number;
  referralRewardPoints?: number;
  isBlocked: boolean;
  lastActiveAt: string;
  createdAt: string;
  updatedAt: string;
  referredById?: number | null;
}

export interface PointLog {
  id: number;
  userId: number;
  amount: number;
  type: string;
  description?: string | null;
  createdAt: string;
}

export interface ClickLog {
  id: number;
  userId: number;
  discountCodeId: number;
  createdAt: string;
  discountCode?: DiscountCode;
}

export interface UserDetails extends User {
  pointLogs: PointLog[];
  sentReferrals: ReferralItem[];
  receivedReferral?: ReferralItem | null;
  referredBy?: ReferralUserSummary | null;
  lotteryEntries: Array<{ id: number; lotteryId: number; userId: number; createdAt: string; lottery: Lottery }>;
  lotteryWins: LotteryWinner[];
  clickLogs: ClickLog[];
}

export type DiscountCategory =
  | "HIGHEST_DISCOUNT"
  | "NO_TIME_LIMIT"
  | "FIRST_PURCHASE"
  | "TWO_PHASE_ONLY"
  | "NEWEST"
  | "MOST_POPULAR"
  | "OTHER";

export const CATEGORY_LABELS: Record<DiscountCategory, string> = {
  HIGHEST_DISCOUNT: "بیشترین تخفیف",
  NO_TIME_LIMIT: "بدون محدودیت زمانی",
  FIRST_PURCHASE: "خرید اول",
  TWO_PHASE_ONLY: "دو مرحله‌ای",
  NEWEST: "جدیدترین",
  MOST_POPULAR: "محبوب‌ترین",
  OTHER: "سایر",
};

export interface PropFirm {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
  _count?: { discountCodes: number };
}

export interface DiscountCode {
  id: number;
  title: string;
  code: string;
  discountPercent: number;
  affiliateLink?: string | null;
  expiresAt?: string | null;
  isFeatured: boolean;
  isActive: boolean;
  category: DiscountCategory;
  usageCount: number;
  propFirmId: number;
  propFirm?: PropFirm;
  createdAt: string;
  updatedAt: string;
}

export interface LotteryCount {
  entries: number;
  winners: number;
}

export interface Lottery {
  id: number;
  title: string;
  description?: string | null;
  prize: string;
  startAt: string;
  endAt: string;
  winnersCount: number;
  minPoints: number;
  entryCost: number;
  isActive: boolean;
  isCompleted: boolean;
  announcementMsg?: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: LotteryCount;
  entries?: LotteryEntry[];
  winners?: LotteryWinner[];
}

export interface LotteryEntry {
  id: number;
  userId: number;
  lotteryId: number;
  createdAt: string;
  user: User;
}

export interface LotteryWinner {
  id: number;
  lotteryId: number;
  userId: number;
  prize: string;
  winnerTelegramId: string;
  winnerUsername?: string | null;
  winnerFirstName: string;
  winnerLastName?: string | null;
  notified: boolean;
  prizeDelivered: boolean;
  wonAt: string;
  user?: User;
  lottery?: Lottery;
}

export interface ReferralSettings {
  id: number;
  inviteRewardPoints: number;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ReferralUserSummary {
  id: number;
  telegramId: string;
  username?: string | null;
  firstName: string;
  lastName?: string | null;
  points?: number;
  totalReferrals?: number;
  createdAt?: string;
}

export interface ReferralItem {
  id: number;
  referrerId: number;
  referredUserId: number;
  rewardPoints: number;
  createdAt: string;
  referrer?: ReferralUserSummary;
  referredUser?: ReferralUserSummary;
}

export interface ReferralStats {
  totalInvites: number;
  totalRewardPoints: number;
  settings: ReferralSettings;
}

export interface ReferralLeaderboardItem {
  referrerId: number;
  referrer?: ReferralUserSummary;
  inviteCount: number;
  totalRewardPoints: number;
}

export interface ReferralAdminResponse {
  success: boolean;
  items: ReferralItem[];
  total: number;
  pages: number;
  stats: ReferralStats;
  leaderboard: ReferralLeaderboardItem[];
}

export type RequiredChannelType = "CHANNEL" | "GROUP";
export interface RequiredChannel {
  id: number;
  channelId: string;
  chatId?: string | null;
  title: string;
  username?: string | null;
  type: RequiredChannelType;
  inviteLink?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt?: string;
}

export type BroadcastType = "TEXT" | "PHOTO" | "VIDEO" | "DOCUMENT" | "VOICE" | "AUDIO" | "STICKER" | "ANIMATION" | "MEDIA_GROUP";
export type BroadcastStatus = "DRAFT" | "SCHEDULED" | "QUEUED" | "RUNNING" | "PAUSED" | "COMPLETED" | "FAILED" | "CANCELLED";
export type BroadcastParseMode = "MARKDOWN" | "HTML";
export type BroadcastLogStatus = "PENDING" | "SUCCESS" | "FAILED" | "SKIPPED";
export interface BroadcastLog {
  id: number;
  broadcastId: number;
  userId: number;
  telegramId: string;
  status: BroadcastLogStatus;
  attempts: number;
  error?: string | null;
  sentAt?: string | null;
  createdAt: string;
  updatedAt: string;
  user?: ReferralUserSummary;
}
export interface Broadcast {
  id: number;
  title: string;
  messageType: BroadcastType;
  content?: string | null;
  mediaFileId?: string | null;
  mediaItems?: unknown;
  parseMode?: BroadcastParseMode | null;
  inlineKeyboard?: unknown;
  status: BroadcastStatus;
  scheduledAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  totalRecipients: number;
  successCount: number;
  failedCount: number;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
  logs?: BroadcastLog[];
}


export type TelegramGroupStatus = "PENDING" | "APPROVED" | "REJECTED" | "DISABLED";
export interface TelegramGroup {
  id: number; chatId: string; title: string; username?: string | null; status: TelegramGroupStatus; botIsAdmin: boolean; botAdminCheckedAt?: string | null; addedAt: string; approvedAt?: string | null; rejectedAt?: string | null; disabledAt?: string | null; createdAt: string; updatedAt: string;
}
export type KeywordReplyResponseType = "TEXT" | "PHOTO" | "DOCUMENT";
export interface KeywordReply {
  id: number; keyword: string; response?: string | null; responseType: KeywordReplyResponseType; parseMode?: BroadcastParseMode | null; mediaFileId?: string | null; isActive: boolean; createdAt: string; updatedAt: string;
}
export interface KeywordReplyLog {
  id: number; keywordReplyId: number; telegramGroupId: number; userTelegramId: string; messageId: number; matchedText: string; createdAt: string; keywordReply?: KeywordReply; telegramGroup?: TelegramGroup;
}
