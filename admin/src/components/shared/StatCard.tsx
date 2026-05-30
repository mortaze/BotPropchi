// src/components/shared/StatCard.tsx
"use client";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: number;
  trendLabel?: string;
  colorClass?: string;
  delay?: number;
}

export default function StatCard({ title, value, icon, trend, trendLabel, colorClass = "bg-primary/10 text-primary", delay = 0 }: StatCardProps) {
  const positive = (trend ?? 0) >= 0;
  return (
    <div className="stat-card animate-fade-in" style={{ animationDelay: `${delay}ms` }}>
      <div className="flex items-start justify-between mb-3">
        <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", colorClass)}>
          {icon}
        </div>
        {trend !== undefined && (
          <div className={cn("flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full", positive ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10")}>
            {positive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground tabular-nums">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{title}</p>
      {trendLabel && <p className="text-xs text-muted-foreground mt-0.5">{trendLabel}</p>}
    </div>
  );
}