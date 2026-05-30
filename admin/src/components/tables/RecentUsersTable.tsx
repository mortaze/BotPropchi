// src/components/tables/RecentUsersTable.tsx
"use client";
import { useQuery } from "@tanstack/react-query";
import { usersApi } from "@/services/api";
import { Card, CardHeader, CardContent, Badge, TableRowSkeleton, EmptyState } from "@/components/ui";
import { formatDate, formatNumber } from "@/lib/utils";
import { User } from "@/types";
import Link from "next/link";

export default function RecentUsersTable() {
  const { data, isLoading } = useQuery({
    queryKey: ["users", 1],
    queryFn: () => usersApi.getAll(1),
  });
  const users: User[] = data?.users || [];

  return (
    <Card>
      <CardHeader className="flex-row flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-sm">آخرین کاربران ثبت‌شده</h3>
        <Link href="/dashboard/users" className="text-xs text-primary hover:underline">مشاهده همه</Link>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>کاربر</th>
                <th>یوزرنیم</th>
                <th>امتیاز</th>
                <th>دعوت‌ها</th>
                <th>وضعیت</th>
                <th>تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} cols={6} />)
              ) : users.length === 0 ? (
                <tr><td colSpan={6}><EmptyState title="کاربری یافت نشد" /></td></tr>
              ) : (
                users.slice(0, 8).map((u) => (
                  <tr key={u.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {u.firstName[0]}
                        </div>
                        <span className="font-medium text-foreground text-sm">{u.firstName} {u.lastName}</span>
                      </div>
                    </td>
                    <td className="text-muted-foreground text-sm">{u.username ? `@${u.username}` : "—"}</td>
                    <td className="font-medium text-sm">{formatNumber(u.points)}</td>
                    <td className="text-sm">{u.totalReferrals}</td>
                    <td>
                      <Badge variant={u.isBlocked ? "danger" : "success"}>
                        {u.isBlocked ? "بلاک" : "فعال"}
                      </Badge>
                    </td>
                    <td className="text-muted-foreground text-xs">{formatDate(u.createdAt)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}