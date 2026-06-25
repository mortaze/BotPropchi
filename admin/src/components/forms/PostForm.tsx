"use client";

import { useEffect, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Input, Textarea, Select } from "@/components/ui";
import { type PostPayload } from "@/services/api";
import type { PostItem } from "@/types";
import MessageEditor, { parseMessagesJson, type EditorMessage } from "@/components/editor/MessageEditor";

const schema = z.object({
  title: z.string().min(1, "عنوان الزامی است"),
  slug: z.string().min(1, "اسلاگ الزامی است"),
  content: z.string().optional(),
  caption: z.string().optional(),
  parseMode: z.enum(["Markdown", "HTML"]),
  contentFormat: z.string().optional(),
  entitiesJson: z.string().optional(),
  telegramPayloadJson: z.string().optional(),
  buttonsJson: z.string().optional(),
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
  const fromTelegramPayload = (initial as any)?.telegramPayload?.messages;
  if (Array.isArray(fromTelegramPayload) && fromTelegramPayload.length > 0) return parseMessagesJson(JSON.stringify(fromTelegramPayload));
  return [];
}

export default function PostForm({ initial, loading, submitLabel = "ذخیره", onSubmit }: Props) {
  const [messages, setMessages] = useState<EditorMessage[]>(() => extractMessages(initial));

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: initial?.title ?? "",
      slug: initial?.slug ?? "",
      content: initial?.content ?? "",
      caption: initial?.caption ?? "",
      parseMode: (initial?.parseMode as "Markdown" | "HTML") ?? "HTML",
      contentFormat: initial?.contentFormat ?? "HTML",
      entitiesJson: Array.isArray(initial?.entities) ? JSON.stringify(initial.entities, null, 2) : "",
      telegramPayloadJson: initial?.telegramPayload ? JSON.stringify(initial.telegramPayload, null, 2) : "",
      buttonsJson: Array.isArray(initial?.buttons) ? JSON.stringify(initial.buttons, null, 2) : "",
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
    <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit((values) => {
      const parseJson = (value?: string) => value?.trim() ? JSON.parse(value) : undefined;
      onSubmit({
        title: values.title,
        slug: values.slug,
        content: values.content || undefined,
        caption: values.caption || undefined,
        parseMode: values.parseMode,
        contentFormat: values.contentFormat || undefined,
        entities: parseJson(values.entitiesJson),
        telegramPayload: parseJson(values.telegramPayloadJson),
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
        buttons: parseJson(values.buttonsJson),
        command: values.command || undefined,
        status: values.status,
      });
    })}>
      <Input label="عنوان" error={errors.title?.message} {...register("title")} />
      <Input label="اسلاگ" error={errors.slug?.message} {...register("slug")} />
      <div className="md:col-span-2">
        <Textarea label="ویرایشگر HTML تلگرام (legacy)" className="min-h-32 font-mono" placeholder="از تگ‌های HTML تلگرام مثل <b>، <i>، <u>، <tg-spoiler>، <blockquote> استفاده کنید" error={errors.content?.message} {...register("content")} />
      </div>
      <div className="md:col-span-2">
        <Textarea label="کپشن (legacy)" className="min-h-24" error={errors.caption?.message} {...register("caption")} />
      </div>
      <Input label="فرمت محتوا" placeholder="HTML یا telegram_entities" {...register("contentFormat")} />
      <Select label="نحوه نمایش legacy" error={errors.parseMode?.message} {...register("parseMode")}>
        <option value="Markdown">Markdown</option>
        <option value="HTML">HTML</option>
      </Select>
      <div className="md:col-span-2 space-y-4">
        <h3 className="font-semibold text-sm">ویرایشگر پیام‌ها</h3>
        <MessageEditor messages={messages} onChange={handleMessagesChange} disabled={loading} />
      </div>
      <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
        <Textarea label="Entity editor legacy (JSON)" className="min-h-32 font-mono" {...register("entitiesJson")} />
        <Textarea label="Media/Payload snapshot (JSON)" className="min-h-32 font-mono" {...register("telegramPayloadJson")} />
        <Textarea label="Button manager (JSON)" className="min-h-32 font-mono" {...register("buttonsJson")} />
      </div>
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
