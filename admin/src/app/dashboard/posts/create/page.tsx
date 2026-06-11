"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Card, CardContent, CardHeader } from "@/components/ui";
import PostForm from "@/components/forms/PostForm";
import { getApiError, postsApi } from "@/services/api";

export default function CreatePostPage() {
  const router = useRouter();
  const mutation = useMutation({
    mutationFn: postsApi.create,
    onSuccess: (data) => {
      toast.success("پست ایجاد شد");
      router.push(`/dashboard/posts/${data.id}`);
    },
    onError: (e) => toast.error(getApiError(e)),
  });
  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">ایجاد پست جدید</h1>
        <p className="text-sm text-muted-foreground">پست جدید برای ربات ایجاد کنید</p>
      </div>
      <Card>
        <CardHeader><h2 className="font-semibold">اطلاعات پست</h2></CardHeader>
        <CardContent>
          <PostForm loading={mutation.isPending} submitLabel="ایجاد پست" onSubmit={(payload) => mutation.mutate(payload)} />
        </CardContent>
      </Card>
    </div>
  );
}
