import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date) {
  return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short", day: "numeric" }).format(new Date(date));
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("fa-IR").format(n);
}

export function truncate(str: string, len = 40) {
  return str.length > len ? `${str.slice(0, len)}…` : str;
}
