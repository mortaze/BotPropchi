"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input, Select } from "@/components/ui";
import { type PostPayload } from "@/services/api";
import type { PostItem } from "@/types";
import MessageEditor, { parseMessagesJson, type EditorMessage } from "@/components/editor/MessageEditor";

const schema = z.object({
  title: z.string().min(1, "عنوان الزامی است"),
  slug: z.string().min(1, "اسلاگ الزامی است"),
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

function extractMessages(initial?: PostItem): EditorMessage[] {
  if (!initial) return [];
  const fromMessages = (initial as any)?.messages;
  if (Array.isArray(fromMessages) && fromMessages.length > 0) return parseMessagesJson(JSON.stringify(fromMessages));
  return [];
}

export default function PostForm({ initial, loading, submitLabel = "ذخیره", onSubmit }: Props) {
  const [messages, setMessages] = useState<EditorMessage[]>(() => extractMessages(initial));

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? "",
      slug: initial?.slug ?? "",
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

  const handleMessagesChange = useCallback((msgs: EditorMessage[]) => {
    setMessages(msgs);
  }, []);

  return (
    <form className="grid gap-4" onSubmit={handleSubmit((values) => {
      onSubmit({
        title: values.title,
        slug: values.slug,
        messages: messages.map(m => ({
          order: m.order,
          messageType: m.messageType,
          text: m.text ?? "",
          entities: m.entities,
          parseMode: "None",
          captionEntities: m.captionEntities,
          mediaFileId: m.mediaFileId ?? null,
          mediaGroupId: m.mediaGroupId ?? null,
          caption: m.caption ?? null,
          replyMarkup: m.replyMarkup ?? null,
          delayMs: m.delayMs ?? 0,
        })),
        command: values.command || undefined,
        status: values.status,
      });
    })}>
      <div className="grid gap-4 md:grid-cols-2">
        <Input label="عنوان" error={errors.title?.message} {...register("title")} />
        <Input label="اسلاگ" error={errors.slug?.message} {...register("slug")} />
        <Input label="دستور (اختیاری)" placeholder="/mycommand" error={errors.command?.message} {...register("command")} />
        <Select label="وضعیت" error={errors.status?.message} {...register("status")}>
          <option value="DRAFT">پیش‌نویس</option>
          <option value="PUBLISHED">منتشر شده</option>
          <option value="SCHEDULED">زمان‌بندی شده</option>
          <option value="ARCHIVED">آرشیو</option>
          <option value="HIDDEN">مخفی</option>
        </Select>
      </div>
      <div className="space-y-4">
        <h3 className="font-semibold text-sm">ویرایشگر پیام‌ها</h3>
        <p className="text-xs text-muted-foreground">هر پیام به صورت مستقل ذخیره می‌شود. استایل‌ها، entity‌ها و دکمه‌ها بین پیام‌ها نشت نمی‌کند.</p>
        <MessageEditor messages={messages} onChange={handleMessagesChange} disabled={loading} />
      </div>
      <div>
        <Button loading={loading} type="submit">{submitLabel}</Button>
      </div>
    </form>
  );
}
