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
