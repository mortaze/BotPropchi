"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Trash2, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader, EmptyState, Pagination, TableRowSkeleton } from "@/components/ui";
import { getApiError, usersApi, userDeleteApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";

// ─── Delete Preview Modal ───────────────────────────────────
function DeletePreviewModal({
  open,
  userId,
  onClose,
  onConfirm,
  isPending,
}: {
  open: boolean;
  userId: number | null;
  onClose: () => void;
  onConfirm: () => void;
  isPending: boolean;
}) {
  const previewQuery = useQuery({
    queryKey: ["delete-preview", userId],
    queryFn: () => userDeleteApi.getPreview(userId!),
    enabled: open && userId !== null,
  });

  const preview = previewQuery.data?.data;

  if (!open || !userId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl bg-card border border-border shadow-2xl animate-fade-in overflow-hidden" dir="rtl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-semibold text-foreground">حذف کاربر</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-lg hover:bg-muted">✕</button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4">
          {/* Safety Warnings */}
          {preview?.safetyWarnings && preview.safetyWarnings.length > 0 && (
            <div className="space-y-2">
              {preview.safetyWarnings.map((w, i) => (
                <div key={i} className="rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2 text-sm text-red-600">
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* User Info */}
          {preview?.user && (
            <div className="rounded-lg bg-muted/40 p-4 space-y-1">
              <p className="text-sm"><span className="text-muted-foreground">User ID:</span> <span className="font-medium">{preview.user.id}</span></p>
              <p className="text-sm"><span className="text-muted-foreground">Telegram ID:</span> <span className="font-mono">{preview.user.telegramId}</span></p>
              <p className="text-sm"><span className="text-muted-foreground">Username:</span> <span className="font-medium">@{preview.user.username ?? "ندارد"}</span></p>
              <p className="text-sm"><span className="text-muted-foreground">نام:</span> <span className="font-medium">{preview.user.firstName}</span></p>
            </div>
          )}

          {/* Will Delete */}
          {preview?.willDelete && Object.keys(preview.willDelete).length > 0 && (
            <div className="rounded-lg border border-border p-4">
              <p className="text-sm font-medium text-foreground mb-2">این عملیات موارد زیر را حذف می‌کند:</p>
              <ul className="space-y-1">
                {Object.entries(preview.willDelete).map(([table, count]) => (
                  <li key={table} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{table}</span>
                    <span className="font-medium">{formatNumber(count)} رکورد</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground mt-2">+ خود رکورد کاربر</p>
            </div>
          )}

          {previewQuery.isLoading && (
            <div className="text-center py-4 text-sm text-muted-foreground">در حال بارگذاری...</div>
          )}

          <p className="text-sm text-red-600 font-medium">⚠️ این عملیات غیرقابل بازگشت است.</p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted transition-colors">
            انصراف
          </button>
          <button
            onClick={onConfirm}
            disabled={isPending || (preview?.safetyWarnings?.length ?? 0) > 0}
            className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? "در حال حذف..." : "حذف کامل"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function UsersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [profileStatus, setProfileStatus] = useState<"" | "completed" | "incomplete">("");
  const [phoneStatus, setPhoneStatus] = useState<"" | "with_phone" | "without_phone">("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  // Get current admin role
  const admin = useAuthStore((s) => s.admin);
  const isSuperAdmin = admin?.role === "SUPER_ADMIN" || admin?.role === "OWNER";

  const query = useQuery({
    queryKey: ["users", page, profileStatus, phoneStatus],
    queryFn: () => usersApi.getAll({ page, limit: 20, profileStatus: profileStatus || undefined, phoneStatus: phoneStatus || undefined }),
  });

  const blockMutation = useMutation({
    mutationFn: ({ id, blocked }: { id: number; blocked: boolean }) => usersApi.setBlocked(id, blocked),
    onSuccess: () => {
      toast.success("وضعیت کاربر به‌روزرسانی شد");
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => toast.error(getApiError(error)),
  });

  const deleteMutation = useMutation({
    mutationFn: (userId: number) => userDeleteApi.deleteUser(userId),
    onSuccess: (data) => {
      toast.success("✅ کاربر با موفقیت حذف شد");
      setDeleteModalOpen(false);
      setDeleteUserId(null);
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (error) => {
      toast.error(getApiError(error));
      setDeleteModalOpen(false);
      setDeleteUserId(null);
    },
  });

  const users = useMemo(
    () =>
      (query.data?.users ?? []).filter((user) =>
        `${user.firstName} ${user.lastName ?? ""} ${user.username ?? ""} ${user.telegramId}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [query.data, search],
  );

  const openDeleteModal = (userId: number) => {
    setDeleteUserId(userId);
    setDeleteModalOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Delete Preview Modal */}
      <DeletePreviewModal
        open={deleteModalOpen}
        userId={deleteUserId}
        onClose={() => { setDeleteModalOpen(false); setDeleteUserId(null); }}
        onConfirm={() => { if (deleteUserId) deleteMutation.mutate(deleteUserId); }}
        isPending={deleteMutation.isPending}
      />

      <div className="flex flex-col justify-between gap-3 md:flex-row md:items-end">
        <div>
          <h1 className="text-2xl font-bold">مدیریت کاربران</h1>
          <p className="text-sm text-muted-foreground">لیست، جستجو، وضعیت، رتبه، امتیاز و آمار واقعی دعوت کاربران</p>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row">
          <select className="input md:w-44" value={profileStatus} onChange={(e) => { setPage(1); setProfileStatus(e.target.value as typeof profileStatus); }}>
            <option value="">همه پروفایل‌ها</option>
            <option value="completed">کاربران تکمیل شده</option>
            <option value="incomplete">کاربران ناقص</option>
          </select>
          <select className="input md:w-44" value={phoneStatus} onChange={(e) => { setPage(1); setPhoneStatus(e.target.value as typeof phoneStatus); }}>
            <option value="">همه شماره‌ها</option>
            <option value="with_phone">دارای شماره موبایل</option>
            <option value="without_phone">بدون شماره موبایل</option>
          </select>
          <div className="relative w-full md:w-80">
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="input pr-10" placeholder="جستجو در صفحه فعلی..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
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
                <th>شماره موبایل</th>
                <th>پروفایل</th>
                <th>امتیاز</th>
                <th>دعوت‌ها</th>
                <th>امتیاز دعوت</th>
                <th>وضعیت</th>
                <th>عملیات</th>
              </tr>
            </thead>
            <tbody>
              {query.isLoading && Array.from({ length: 6 }).map((_, i) => <TableRowSkeleton key={i} cols={9} />)}
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
                  <td dir="ltr" className="text-right">{user.phoneNumber ?? "-"}</td>
                  <td><Badge variant={user.profileCompleted ? "success" : "warning"}>{user.profileCompleted ? "تکمیل شده" : "ناقص"}</Badge></td>
                  <td>{formatNumber(user.points)}</td>
                  <td>{formatNumber(user.referralCount ?? user.totalReferrals)}</td>
                  <td>{formatNumber(user.referralRewardPoints ?? 0)}</td>
                  <td><Badge variant={user.isBlocked ? "danger" : "success"}>{user.isBlocked ? "مسدود" : "فعال"}</Badge></td>
                  <td>
                    <div className="flex items-center gap-1">
                      <Link href={`/dashboard/users/${user.id}`}>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="مشاهده">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Link href={`/dashboard/users/${user.id}`}>
                        <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="ویرایش">
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </Link>
                      <Button
                        size="sm"
                        variant={user.isBlocked ? "secondary" : "danger"}
                        className="h-8"
                        loading={blockMutation.isPending}
                        onClick={() => blockMutation.mutate({ id: user.id, blocked: !user.isBlocked })}
                      >
                        {user.isBlocked ? "آنبلاک" : "بلاک"}
                      </Button>
                      {isSuperAdmin && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-500/10"
                          title="حذف کاربر"
                          onClick={() => openDeleteModal(user.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
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
