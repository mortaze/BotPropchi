"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Pagination, TableRowSkeleton } from "@/components/ui";
import { getApiError, usersApi } from "@/services/api";
import { formatNumber, safeDateFormat } from "@/lib/utils";

export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["users", page], queryFn: () => usersApi.getAll({ page, limit: 20 }) });
  const blockMutation = useMutation({
    mutationFn: ({ id, blocked }: { id: number; blocked: boolean }) => usersApi.setBlocked(id, blocked),
    onSuccess: () => {
      toast.success("وضعیت کاربر به‌روزرسانی شد");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(getApiError(error)),
  });
  const users = useMemo(
    () =>
      (query.data?.users ?? []).filter((user) =>
        `${user.firstName} ${user.lastName ?? ""} ${user.username ?? ""} ${user.telegramId}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [query.data, search],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold">مدیریت کاربران</h1>
          <p className="text-sm text-muted-foreground">لیست، جستجو، وضعیت، رتبه، امتیاز و آمار واقعی دعوت کاربران</p>
        </div>
        <div className="relative w-full md:w-80">
          <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input className="input pr-10" placeholder="جستجو در صفحه فعلی..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">کاربران</h2>
            <span className="text-sm text-muted-foreground">{formatNumber(query.data?.total)} کاربر</span>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          <table className="data-table">
            <thead>
              <tr>
                <th>کاربر</th>
                <th>تلگرام</th>
                <th>امتیاز</th>
                <th>دعوت‌ها</th>
                <th>امتیاز دعوت</th>
                <th>وضعیت</th>
                <th>آخرین فعالیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && Array.from({ length: 6 }).map((_, i) => <TableRowSkeleton key={i} cols={8} />)}
              {users.map((user) => (
                <tr key={user.id}>
                  <td>
                    <Link href={`/dashboard/users/${user.id}`} className="font-medium hover:text-primary">
                      {user.firstName} {user.lastName}
                    </Link>
                    <p className="text-xs text-muted-foreground">#{user.id}</p>
                  </td>
                  <td>
                    @{user.username ?? "-"}<p className="text-xs text-muted-foreground">{user.telegramId}</p>
                  </td>
                  <td>{formatNumber(user.points)}</td>
                  <td>{formatNumber(user.referralCount ?? user.totalReferrals)}</td>
                  <td>{formatNumber(user.referralRewardPoints ?? 0)}</td>
                  <td><Badge variant={user.isBlocked ? "danger" : "success"}>{user.isBlocked ? "مسدود" : "فعال"}</Badge></td>
                  <td>{safeDateFormat(user.lastActiveAt, { dateStyle: "medium" })}</td>
                  <td className="flex gap-2">
                    <Link href={`/dashboard/users/${user.id}`}><Button size="sm" variant="outline">جزئیات</Button></Link>
                    <Button size="sm" variant={user.isBlocked ? "secondary" : "danger"} loading={blockMutation.isPending} onClick={() => blockMutation.mutate({ id: user.id, blocked: !user.isBlocked })}>{user.isBlocked ? "آنبلاک" : "بلاک"}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!query.isLoading && !users.length && <EmptyState title="کاربری یافت نشد" />}
        </CardContent>
        <Pagination page={page} pages={query.data?.pages ?? 1} onChange={setPage} />
      </Card>
    </div>
  );
}
