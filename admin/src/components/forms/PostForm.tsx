"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input, Textarea, Select } from "@/components/ui";
import { type PostPayload } from "@/services/api";
import type { PostItem } from "@/types";

const schema = z.object({
  title: z.string().min(1, "عنوان الزامی است"),
  slug: z.string().min(1, "اسلاگ الزامی است"),
  content: z.string().optional(),
  caption: z.string().optional(),
  parseMode: z.enum(["Markdown", "HTML"]),
  command: z.string().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "SCHEDULED", "ARCHIVED", "HIDDEN"]),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  initial?: PostItem;
  loading?: boolean;
  submitLabel?: string;
  onSubmit: (payload: PostPayload) => void;
}

function slugify(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

export default function PostForm({ initial, loading, submitLabel = "ذخیره", onSubmit }: Props) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? "",
      slug: initial?.slug ?? "",
      content: initial?.content ?? "",
      caption: initial?.caption ?? "",
      parseMode: (initial?.parseMode as "Markdown" | "HTML") ?? "Markdown",
      command: initial?.command ?? "",
      status: initial?.status ?? "DRAFT",
    },
  });

  const title = watch("title");

  useEffect(() => {
    if (!initial && title) {
      setValue("slug", slugify(title));
    }
  }, [title, initial, setValue]);

  return (
    <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit((values) => onSubmit({
      ...values,
      content: values.content || undefined,
      caption: values.caption || undefined,
      command: values.command || undefined,
    }))}>
      <Input label="عنوان" error={errors.title?.message} {...register("title")} />
      <Input label="اسلاگ" error={errors.slug?.message} {...register("slug")} />
      <div className="md:col-span-2">
        <Textarea label="محتوا" className="min-h-32" error={errors.content?.message} {...register("content")} />
      </div>
      <div className="md:col-span-2">
        <Textarea label="کپشن" className="min-h-24" error={errors.caption?.message} {...register("caption")} />
      </div>
      <Select label="نحوه نمایش" error={errors.parseMode?.message} {...register("parseMode")}>
        <option value="Markdown">Markdown</option>
        <option value="HTML">HTML</option>
      </Select>
      <Input label="دستور (اختیاری)" placeholder="/mycommand" error={errors.command?.message} {...register("command")} />
      <Select label="وضعیت" error={errors.status?.message} {...register("status")}>
        <option value="DRAFT">پیش‌نویس</option>
        <option value="PUBLISHED">منتشر شده</option>
        <option value="SCHEDULED">زمان‌بندی شده</option>
        <option value="ARCHIVED">آرشیو</option>
        <option value="HIDDEN">مخفی</option>
      </Select>
      <div className="md:col-span-2">
        <Button loading={loading} type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
