export type DiscountCategory =
  | "FOREX"
  | "CRYPTO"
  | "FUTURES"
  | "STOCKS";

export interface DiscountCode {
  id: number;
  title: string;
  code: string;
  description?: string;

  category: DiscountCategory;

  discountPercent?: number;

  isFeatured: boolean;
  isActive: boolean;

  createdAt: string;
  updatedAt: string;
}

export const CATEGORY_LABELS: Record<
  DiscountCategory,
  string
> = {
  FOREX: "فارکس",
  CRYPTO: "کریپتو",
  FUTURES: "فیوچرز",
  STOCKS: "سهام",
};