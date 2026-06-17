export type AdminRole = "OWNER" | "ADMIN" | "SUPER_ADMIN" | "MODERATOR";
export type BotAdminRole = "OWNER" | "SUPER_ADMIN" | "ADMIN" | "MODERATOR";
export type BotAdminStatus = "ACTIVE" | "SUSPENDED";

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
  phoneNumber?: string | null;
  profileCompleted: boolean;
  points: number;
  totalReferrals: number;
  referralCount?: number;
  referralRewardPoints?: number;
  isBlocked: boolean;
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

export interface PropFirm {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  websiteUrl?: string | null;
  reviewLink?: string | null;
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
  ticketStats?: LotteryTicketStats;
  entries?: LotteryEntry[];
  winners?: LotteryWinner[];
}

export interface LotteryEntry {
  id: number;
  userId: number;
  lotteryId: number;
  createdAt: string;
  user: User;
  ticketCount: number;
  pointsSpent: number;
  chanceWeight: number;
}

export interface LotteryTicketStats {
  participants: number;
  totalTickets: number;
  pointsSpent: number;
  totalChance: number;
  topBuyers: LotteryEntry[];
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

export interface Season {
  id: number;
  name: string;
  isActive: boolean;
  startDate: string;
  endDate: string;
  createdAt: string;
  updatedAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  userId: number;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  inviteCount: number;
}

export interface LeaderboardStats {
  totalReferrals: number;
  totalInviters: number;
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
export type RequiredChannelStatus = "PENDING" | "APPROVED" | "REJECTED" | "DISABLED";
export interface RequiredChannel {
  id: number;
  channelId: string;
  chatId?: string | null;
  title: string;
  displayTitle?: string | null;
  username?: string | null;
  type: RequiredChannelType;
  inviteLink?: string | null;
  buttonText?: string | null;
  botStatus?: string | null;
  botStatusCheckedAt?: string | null;
  lastError?: string | null;
  status: RequiredChannelStatus;
  isActive: boolean;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  disabledAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type BroadcastType = "TEXT" | "PHOTO" | "VIDEO" | "DOCUMENT" | "VOICE" | "AUDIO" | "STICKER" | "ANIMATION" | "CONTACT" | "LOCATION" | "POLL" | "MEDIA_GROUP" | "COPY_MESSAGE" | "FORWARD_MESSAGE";
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


export interface BotAdmin { id: number; telegramId: string; username?: string | null; firstName?: string | null; lastName?: string | null; role: BotAdminRole; status: BotAdminStatus; createdAt: string; updatedAt: string; }
export type SystemEventType = "USER_LOGIN" | "FORCE_JOIN" | "REFERRAL" | "BROADCAST" | "LOTTERY" | "DISCOUNT_CLICK" | "ERROR" | "ADMIN_ACTION" | "GROUP_INTEGRATION" | "USER_PROFILE_COMPLETED" | "USER_PROFILE_UPDATED";
export interface SystemLog { id: number; eventType: SystemEventType; level: "INFO" | "WARN" | "ERROR"; message: string; userId?: number | null; telegramId?: string | null; metadata?: unknown; createdAt: string; user?: ReferralUserSummary | null; }
export interface MiniAppDebugLog { id: number; telegramId?: string | null; eventType: string; message: string; payload?: unknown; userAgent?: string | null; userId?: number | null; createdAt: string; user?: ReferralUserSummary | null; }
export interface MiniAppLogsReport { latestErrors: MiniAppDebugLog[]; latestSuccesses: MiniAppDebugLog[]; latestValidationFailures: MiniAppDebugLog[]; successfulUsersCount: number; failedUsersCount: number; }
export interface AnalyticsDashboard { users: { totalUsers: number; activeToday: number; activeWeek: number; activeMonth: number; newUsers: number }; referrals: { totalInvites: number; successful: number; failed: number; conversionRate: number; topReferrers: Array<{ referrerId: number; _count: { _all: number }; _sum: { rewardPoints: number | null }; user?: User }> }; forceJoin: { channels: number; groups: number; verifiedUsers: number }; discounts: { topClicks: Array<{ discountCodeId: number; clicks: number; discountCode?: DiscountCode }>; topUsage: DiscountCode[]; topViewed: DiscountCode[] }; lotteries: { total: number; participants: number; ticketsSold: number; pointsSpent: number; totalChance: number; topLottery?: { lottery: Lottery; tickets: number; participants: number } | null }; broadcasts: { total: number; successRate: number; errorRate: number; success: number; failed: number }; groups: { approved: number; active: number }; charts: { dailyUsers: Array<{ date: string; count: number }>; dailyReferrals: Array<{ date: string; count: number }>; dailyDiscountClicks: Array<{ date: string; count: number }>; dailyLotteryEntries: Array<{ date: string; count: number }> } }

export type PanelAdminRole = "OWNER" | "ADMIN" | "SUPER_ADMIN" | "MODERATOR";
export interface MenuOrderItem {
  id: number;
  key: string;
  label: string;
  href: string;
  order: number;
  isActive: boolean;
  ownerOnly: boolean;
  featureKey?: string | null;
}
export interface FeatureToggleItem {
  id: number;
  key: string;
  label: string;
  description?: string | null;
  isEnabled: boolean;
}
export interface PanelAdminUser {
  id: number;
  firstName?: string | null;
  lastName?: string | null;
  username: string;
  email?: string | null;
  role: PanelAdminRole;
  isActive: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface ScoringSettings {
  id: number;
  startPoints: number;
  channelJoinPoints: number;
  futureActivityPoints: number;
  dailyActivityPoints: number;
  linkClickPoints: number;
  referralRewardPoints: number;
  profileCompletionPoints: number;
  welcomeMessageText: string;
  initialPointsMessageText: string;
  isWelcomeMessageEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}


export interface MiniAppContentSettings {
  siteUrl: string;
  aboutText: string;
}


export interface AiAssistantSettings {
  systemPrompt: string;
  allowedSourceUrls: string[];
  fallbackMessage: string;
  topicFallbackMessage: string;
  sourceFallbackMessage: string;
  model: string;
  rateLimitPerHour: number;
}

export interface AiApiKeyItem {
  id: number;
  name?: string | null;
  keyPreview: string;
  isActive: boolean;
  lastUsedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PostItem {
  id: number;
  title: string;
  slug: string;
  content?: string | null;
  caption?: string | null;
  mediaFileId?: string | null;
  mediaType?: string | null;
  albumMediaIds?: string[] | null;
  parseMode: string;
  buttons?: any;
  command?: string | null;
  status: PostStatus;
  isPublished: boolean;
  sortOrder: number;
  scheduledAt?: string | null;
  unpublishAt?: string | null;
  publishedAt?: string | null;
  createdBy?: string | null;
  updatedBy?: string | null;
  commands?: PostCommandItem[];
  _count?: { views: number; clickLogs: number };
  createdAt: string;
  updatedAt: string;
}

export type PostStatus = "DRAFT" | "PUBLISHED" | "SCHEDULED" | "ARCHIVED" | "HIDDEN";

export interface PostCommandItem {
  id: number;
  postId: number;
  command: string;
  aliases?: string[] | null;
}

export interface MenuLayoutButton {
  id?: string;
  ref: string;
  text: string;
  type?: string;
  visible?: boolean;
}

export interface MenuLayoutResponse {
  success: boolean;
  layout: MenuLayoutButton[][];
  version: number;
}

export interface ForceJoinSettings {
  id: number;
  title: string;
  welcomeMessage: string;
  notJoinedMessage: string;
  joinButtonText: string;
  checkMembershipButtonText: string;
  successJoinMessage: string;
  errorMessage: string;
  retryMessage: string;
  emptyChannelsMessage: string;
  createdAt: string;
  updatedAt: string;
}
