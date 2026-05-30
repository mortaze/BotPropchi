// src/app/dashboard/users/[id]/page.tsx
"use client";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/services/api";
import { Card, CardHeader, CardContent, Badge, Button, Skeleton } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/utils";
import { ArrowRight, Star, Shield, Calendar, Hash } from "lucide-react";

export default function UserDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { data: usersData, isLoading } = useQuery({
    queryKey: ["users", 1],
    queryFn: () => usersApi.getAll(1),
  });

  const user = usersData?.users?.find((u: any) => u.id === parseInt(id as string));

  return (
    <div className="space-y-5 max-w-2xl">
      <button onClick={() => router.back()} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ArrowRight className="w-4 h-4" />
        بازگشت به لیست
      </button>

      {isLoading ? (
        <Card><CardContent><Skeleton className="h-40 w-full" /></CardContent></Card>
      ) : !user ? (
        <Card><CardContent><p className="text-center text-muted-foreground py-10">کاربر یافت نشد</p></CardContent></Card>
      ) : (
        <>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-primary/10 border-2 border-primary/20 flex items-center justify-center text-2xl font-bold text-primary">
                  {user.firstName[0]}
                </div>
                <div>
                  <h2 className="text-xl font-bold text-foreground">{user.firstName} {user.lastName}</h2>
                  <p className="text-muted-foreground">{user.username ? `@${user.username}` : "بدون یوزرنیم"}</p>
                  <Badge variant={user.isBlocked ? "danger" : "success"} className="mt-1">
                    {user.isBlocked ? "بلاک شده" : "فعال"}
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: <Star className="w-4 h-4 text-yellow-500" />, label: "امتیاز", value: formatNumber(user.points) },
              { icon: <Shield className="w-4 h-4 text-blue-500" />, label: "دعوت‌های موفق", value: user.totalReferrals },
              { icon: <Calendar className="w-4 h-4 text-green-500" />, label: "تاریخ عضویت", value: formatDate(user.createdAt) },
              { icon: <Hash className="w-4 h-4 text-purple-500" />, label: "آیدی تلگرام", value: user.telegramId },
            ].map((item, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">{item.icon}<span className="text-xs text-muted-foreground">{item.label}</span></div>
                  <p className="font-semibold text-foreground">{item.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}