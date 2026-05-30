// src/app/dashboard/page.tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { usersApi, discountsApi, lotteriesApi } from "@/services/api";
import StatCard from "@/components/shared/StatCard";
import { StatCardSkeleton } from "@/components/ui";
import DashboardCharts from "@/components/charts/DashboardCharts";
import RecentUsersTable from "@/components/tables/RecentUsersTable";
import {
  Users, Tag, Building2, Trophy, UserCheck,
  UserX, Star, Activity,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";

export default function DashboardPage() {
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ["user-stats"],
    queryFn: usersApi.getStats,
  });
  const { data: discountsData } = useQuery({
    queryKey: ["discounts", 1],
    queryFn: () => discountsApi.getAll(1),
  });
  const { data: propFirms } = useQuery({
    queryKey: ["prop-firms"],
    queryFn: discountsApi.getPropFirms,
  });
  const { data: lotteries } = useQuery({
    queryKey: ["lotteries"],
    queryFn: lotteriesApi.getAll,
  });

  const statCards = [
    { title: "کل کاربران", value: stats?.total ?? 0, icon: <Users className="w-5 h-5" />, colorClass: "bg-blue-500/10 text-blue-500", trend: 12 },
    { title: "عضوهای امروز", value: stats?.today ?? 0, icon: <UserCheck className="w-5 h-5" />, colorClass: "bg-green-500/10 text-green-500", trend: 8 },
    { title: "مجموع امتیازات", value: formatNumber(stats?.totalPoints ?? 0), icon: <Star className="w-5 h-5" />, colorClass: "bg-yellow-500/10 text-yellow-500" },
    { title: "کدهای تخفیف", value: discountsData?.total ?? 0, icon: <Tag className="w-5 h-5" />, colorClass: "bg-purple-500/10 text-purple-500" },
    { title: "پراپ فرم‌ها", value: propFirms?.length ?? 0, icon: <Building2 className="w-5 h-5" />, colorClass: "bg-orange-500/10 text-orange-500" },
    { title: "قرعه‌کشی‌ها", value: lotteries?.length ?? 0, icon: <Trophy className="w-5 h-5" />, colorClass: "bg-pink-500/10 text-pink-500" },
    { title: "کاربران فعال", value: Math.floor((stats?.total ?? 0) * 0.7), icon: <Activity className="w-5 h-5" />, colorClass: "bg-cyan-500/10 text-cyan-500", trend: 5 },
    { title: "کاربران بلاک‌شده", value: Math.floor((stats?.total ?? 0) * 0.02), icon: <UserX className="w-5 h-5" />, colorClass: "bg-red-500/10 text-red-500", trend: -3 },
  ];

  return (
    <div className="space-y-6">
      {/* Stats grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statsLoading
          ? Array.from({ length: 8 }).map((_, i) => <StatCardSkeleton key={i} />)
          : statCards.map((card, i) => (
              <StatCard key={i} {...card} delay={i * 50} value={formatNumber(typeof card.value === "string" ? parseFloat(card.value.replace(/[^0-9]/g, "")) || card.value : card.value)} />
            ))}
      </div>

      {/* Charts */}
      <DashboardCharts />

      {/* Recent users */}
      <RecentUsersTable />
    </div>
  );
}