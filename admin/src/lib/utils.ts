import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function safeDateFormat(
  value?: string | number | Date | null,
  options: Intl.DateTimeFormatOptions = { year: "numeric", month: "short", day: "numeric" },
  fallback = "ثبت نشده",
) {
  if (value === null || value === undefined || value === "") return fallback;

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  try {
    return new Intl.DateTimeFormat("fa-IR", options).format(date);
  } catch {
    return fallback;
  }
}

export function safeToISOString(value?: string | number | Date | null): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toISOString();
  } catch {
    return null;
  }
}

export function formatDate(date?: string | number | Date | null) {
  return safeDateFormat(date);
}

export function formatNumber(n?: number | null) {
  return new Intl.NumberFormat("fa-IR").format(n ?? 0);
}

export function truncate(str: string, len = 40) {
  return str.length > len ? `${str.slice(0, len)}…` : str;
}
