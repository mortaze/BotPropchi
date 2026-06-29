"use client";
import { useCallback, useRef, useMemo } from "react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";

export type TelegramEntity = { type: string; offset: number; length: number; [k: string]: any };

export interface EditorMessage {
  order: number;
  messageType: string;
  text?: string;
  entities: TelegramEntity[];
  parseMode: string;
  captionEntities: TelegramEntity[];
  mediaFileId?: string | null;
  mediaGroupId?: string | null;
  caption?: string | null;
  replyMarkup?: any;
  delayMs: number;
}

interface Props {
  messages: EditorMessage[];
  onChange: (messages: EditorMessage[]) => void;
  disabled?: boolean;
}

const STYLE_BUTTONS: { type: string; label: string; title: string }[] = [
  { type: "bold", label: "B", title: "Bold" },
  { type: "italic", label: "I", title: "Italic" },
  { type: "underline", label: "U", title: "Underline" },
  { type: "strikethrough", label: "S", title: "Strikethrough" },
  { type: "spoiler", label: "👻", title: "Spoiler" },
  { type: "blockquote", label: "❝", title: "Blockquote" },
  { type: "expandable_blockquote", label: "❝+", title: "Expandable Blockquote" },
  { type: "code", label: "<>", title: "Code" },
  { type: "pre", label: "PRE", title: "Preformatted" },
];

function entityEnd(e: TelegramEntity): number { return e.offset + e.length; }

function doEntitiesCollide(a: TelegramEntity, b: TelegramEntity): boolean {
  return a.offset < entityEnd(b) && b.offset < entityEnd(a);
}

function serializeMessages(val: EditorMessage[]): string {
  return JSON.stringify(val.map(m => ({
    ...m,
    order: m.order,
  })));
}

export function parseMessagesJson(json?: string | null): EditorMessage[] {
  if (!json?.trim()) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed.map((m: any, i: number) => ({
      order: m.order ?? i,
      messageType: m.messageType ?? "text",
      text: m.text ?? "",
      entities: Array.isArray(m.entities) ? m.entities : [],
      parseMode: "None",
      captionEntities: Array.isArray(m.captionEntities) ? m.captionEntities : [],
      mediaFileId: m.mediaFileId ?? null,
      mediaGroupId: m.mediaGroupId ?? null,
      caption: m.caption ?? null,
      replyMarkup: m.replyMarkup ?? null,
      delayMs: m.delayMs ?? 0,
    })) : [];
  } catch { return []; }
}

function getEntityAtCursor(entities: TelegramEntity[], offset: number, length: number, type: string): number {
  return entities.findIndex(e =>
    e.type === type && e.offset === offset && e.length === length
  );
}

function entityTypesForText(text: string, entities: TelegramEntity[]): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>();
  for (const e of entities) {
    for (let i = e.offset; i < e.offset + e.length; i++) {
      if (!map.has(i)) map.set(i, new Set());
      map.get(i)!.add(e.type);
    }
  }
  return map;
}

function StyledTextPreview({ text, entities }: { text: string; entities: TelegramEntity[] }) {
  if (!text) return <span className="text-muted-foreground italic">(empty)</span>;

  const sorted = [...entities].sort((a, b) => a.offset - b.offset || b.length - a.length);
  const segments: { start: number; end: number; styles: Set<string>; entity?: TelegramEntity }[] = [];

  if (sorted.length === 0) {
    segments.push({ start: 0, end: text.length, styles: new Set() });
  } else {
    let pos = 0;
    const active: TelegramEntity[] = [];
    const queue = [...sorted];

    while (pos < text.length || queue.length > 0) {
      const nextStart = queue.length > 0 ? queue[0].offset : text.length;
      if (nextStart > pos) {
        segments.push({ start: pos, end: nextStart, styles: new Set([...active.map(e => e.type)]) });
        pos = nextStart;
      }
      while (queue.length > 0 && queue[0].offset === pos) {
        active.push(queue.shift()!);
      }
      const nextEnd = Math.min(
        ...active.map(e => e.offset + e.length),
        ...queue.map(e => e.offset),
        text.length
      );
      if (nextEnd > pos) {
        segments.push({ start: pos, end: nextEnd, styles: new Set([...active.map(e => e.type)]) });
        pos = nextEnd;
      }
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].offset + active[i].length <= pos) active.splice(i, 1);
      }
    }
  }

  return (
    <span>
      {segments.map((seg, i) => {
        const txt = text.slice(seg.start, seg.end);
        let el: React.ReactNode = txt;
        if (seg.styles.has("spoiler")) el = <span key={i} className="bg-muted text-muted-foreground rounded px-0.5">{txt}</span>;
        if (seg.styles.has("code")) el = <code key={i} className="bg-muted px-1 rounded text-sm">{txt}</code>;
        if (seg.styles.has("pre")) el = <pre key={i} className="bg-muted p-2 rounded text-sm block">{txt}</pre>;
        if (seg.styles.has("blockquote") || seg.styles.has("expandable_blockquote")) el = <blockquote key={i} className="border-r-2 border-primary pr-2 mr-2">{el}</blockquote>;
        if (seg.styles.has("bold")) el = <strong key={i}>{el}</strong>;
        if (seg.styles.has("italic")) el = <em key={i}>{el}</em>;
        if (seg.styles.has("underline")) el = <u key={i}>{el}</u>;
        if (seg.styles.has("strikethrough")) el = <s key={i}>{el}</s>;
        return el;
      })}
    </span>
  );
}

export default function MessageEditor({ messages, onChange, disabled }: Props) {
  const textareaRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());

  const updateMessage = useCallback((idx: number, updater: (msg: EditorMessage) => EditorMessage) => {
    const updated = messages.map((m, i) => i === idx ? updater(m) : m);
    onChange(updated);
  }, [messages, onChange]);

  const addEntity = useCallback((idx: number, type: string, offset: number, length: number, extra?: Record<string, any>) => {
    updateMessage(idx, (msg) => {
      const existing = msg.entities.findIndex(e => e.type === type && e.offset === offset && e.length === length);
      if (existing >= 0) {
        return { ...msg, entities: msg.entities.filter((_, i) => i !== existing) };
      }
      const clean = msg.entities.filter(e => !doEntitiesCollide(e, { type, offset, length } as any));
      const entity: TelegramEntity = { type, offset, length, ...extra };
      const sorted = [...clean, entity].sort((a, b) => a.offset - b.offset || b.length - a.length);
      return { ...msg, entities: sorted };
    });
  }, [updateMessage]);

  const handleStyleClick = useCallback((idx: number, type: string) => {
    const ta = textareaRefs.current.get(idx);
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    if (end <= start) return;
    addEntity(idx, type, start, end - start);
  }, [addEntity]);

  const handleAddMessage = useCallback(() => {
    onChange([...messages, {
      order: messages.length,
      messageType: "text",
      text: "",
      entities: [],
      parseMode: "None",
      captionEntities: [],
      mediaFileId: null,
      mediaGroupId: null,
      caption: null,
      replyMarkup: null,
      delayMs: 700,
    }]);
  }, [messages, onChange]);

  const handleDelete = useCallback((idx: number) => {
    const updated = messages.filter((_, i) => i !== idx).map((m, i) => ({ ...m, order: i }));
    onChange(updated);
  }, [messages, onChange]);

  const handleMove = useCallback((idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= messages.length) return;
    const updated = [...messages];
    [updated[idx], updated[target]] = [updated[target], updated[idx]];
    onChange(updated.map((m, i) => ({ ...m, order: i })));
  }, [messages, onChange]);

  const handleTextChange = useCallback((idx: number, text: string) => {
    updateMessage(idx, (msg) => {
      const oldLen = (msg.text ?? "").length;
      const ratio = oldLen > 0 ? text.length / oldLen : 1;
      const entities = msg.entities
        .filter(e => e.offset + e.length <= text.length || e.offset < text.length)
        .map(e => ({ ...e, length: Math.min(e.length, text.length - e.offset) }))
        .filter(e => e.length > 0);
      return { ...msg, text, entities };
    });
  }, [updateMessage]);

  const setTextareaRef = useCallback((idx: number, el: HTMLTextAreaElement | null) => {
    if (el) textareaRefs.current.set(idx, el);
    else textareaRefs.current.delete(idx);
  }, []);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        {messages.map((msg, idx) => (
          <MessageCard
            key={idx}
            msg={msg}
            idx={idx}
            total={messages.length}
            disabled={disabled}
            onStyleClick={(type) => handleStyleClick(idx, type)}
            onTextChange={(text) => handleTextChange(idx, text)}
            onDelete={() => handleDelete(idx)}
            onMoveUp={() => handleMove(idx, -1)}
            onMoveDown={() => handleMove(idx, 1)}
            onUpdate={(updater) => updateMessage(idx, updater)}
            textareaRef={(el) => setTextareaRef(idx, el)}
          />
        ))}
      </div>
      <Button type="button" variant="outline" onClick={handleAddMessage} disabled={disabled}>
        + افزودن پیام جدید
      </Button>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">نمایش JSON خام</summary>
        <pre className="mt-2 max-h-48 overflow-auto rounded border border-border bg-background p-2 font-mono text-xs">
          {serializeMessages(messages)}
        </pre>
      </details>
    </div>
  );
}

function MessageCard({ msg, idx, total, disabled, onStyleClick, onTextChange, onDelete, onMoveUp, onMoveDown, onUpdate, textareaRef }: {
  msg: EditorMessage; idx: number; total: number; disabled?: boolean;
  onStyleClick: (type: string) => void; onTextChange: (text: string) => void;
  onDelete: () => void; onMoveUp: () => void; onMoveDown: () => void;
  onUpdate: (updater: (m: EditorMessage) => EditorMessage) => void;
  textareaRef: (el: HTMLTextAreaElement | null) => void;
}) {
  const isMedia = msg.messageType !== "text";

  return (
    <div className="rounded-xl border border-border bg-background/80 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground shrink-0 w-6">#{idx + 1}</span>
          <select
            className="rounded border border-input bg-background px-2 py-1 text-xs"
            value={msg.messageType}
            disabled={disabled}
            onChange={(e) => onUpdate(m => ({ ...m, messageType: e.target.value }))}
          >
            {["text", "photo", "video", "document", "audio", "voice", "animation", "sticker", "album"].map(t =>
              <option key={t} value={t}>{t}</option>
            )}
          </select>
          <input
            className="w-20 rounded border border-input bg-background px-2 py-1 text-xs"
            type="number" min={0} step={100}
            value={msg.delayMs}
            disabled={disabled}
            onChange={(e) => onUpdate(m => ({ ...m, delayMs: Number(e.target.value) || 0 }))}
            title="Delay (ms)"
          />
        </div>
        <div className="flex items-center gap-1">
          <Button type="button" size="sm" variant="ghost" disabled={idx === 0 || disabled} onClick={onMoveUp}>↑</Button>
          <Button type="button" size="sm" variant="ghost" disabled={idx === total - 1 || disabled} onClick={onMoveDown}>↓</Button>
          <Button type="button" size="sm" variant="danger" disabled={disabled} onClick={onDelete}>🗑</Button>
        </div>
      </div>

      <StyleToolbar onStyleClick={onStyleClick} disabled={disabled} />

      <textarea
        ref={textareaRef}
        className="w-full min-h-24 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
        value={msg.text ?? ""}
        disabled={disabled}
        onChange={(e) => onTextChange(e.target.value)}
        placeholder="متن پیام..."
      />

      <EntityChips entities={msg.entities} text={msg.text ?? ""} />

      {isMedia && (
        <div className="space-y-2 pt-2 border-t border-border">
          <input
            className="w-full rounded border border-input bg-background px-3 py-2 text-sm"
            value={msg.mediaFileId ?? ""}
            disabled={disabled}
            onChange={(e) => onUpdate(m => ({ ...m, mediaFileId: e.target.value || null }))}
            placeholder="Media file ID..."
          />
          <div>
            <p className="text-xs text-muted-foreground mb-1">Caption entities:</p>
            <textarea
              className="w-full min-h-16 rounded-lg border border-input bg-background px-3 py-2 text-sm font-mono"
              value={msg.caption ?? ""}
              disabled={disabled}
              onChange={(e) => onUpdate(m => ({ ...m, caption: e.target.value || null }))}
              placeholder="Caption text..."
            />
            <EntityChips entities={msg.captionEntities} text={msg.caption ?? ""} />
          </div>
        </div>
      )}

      <PreviewSection text={msg.text ?? ""} entities={msg.entities} caption={msg.caption} captionEntities={msg.captionEntities} isMedia={isMedia} messageType={msg.messageType} />
    </div>
  );
}

function StyleToolbar({ onStyleClick, disabled }: { onStyleClick: (type: string) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1" role="toolbar" aria-label="Text style toolbar">
      {STYLE_BUTTONS.map(btn => (
        <button
          key={btn.type}
          type="button"
          disabled={disabled}
          onClick={() => onStyleClick(btn.type)}
          className={cn(
            "inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded text-xs font-medium transition-colors",
            "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
            "disabled:opacity-40 disabled:cursor-not-allowed"
          )}
          title={btn.title}
        >
          {btn.label}
        </button>
      ))}
    </div>
  );
}

function EntityChips({ entities, text }: { entities: TelegramEntity[]; text?: string }) {
  if (!entities.length) return <p className="text-xs text-muted-foreground">بدون entity</p>;
  return (
    <div className="flex flex-wrap gap-1">
      {entities.map((e, i) => (
        <span key={i} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
          <span className="font-semibold">{e.type}</span>
          <span className="opacity-70">[{e.offset}:{e.length}]</span>
          {e.url && <span className="opacity-50 truncate max-w-[80px]">↗</span>}
          {text && <span className="opacity-50 truncate max-w-[60px]">{String.fromCharCode(8220)}{text.slice(e.offset, e.offset + e.length)}{String.fromCharCode(8221)}</span>}
        </span>
      ))}
    </div>
  );
}

function PreviewSection({ text, entities, caption, captionEntities, isMedia, messageType }: {
  text: string; entities: TelegramEntity[]; caption?: string | null; captionEntities: TelegramEntity[]; isMedia: boolean; messageType?: string;
}) {
  const mediaIcons: Record<string, string> = {
    photo: '🖼 عکس', video: '🎬 ویدیو', animation: '🎭 گیف', document: '📄 فایل',
    audio: '🎵 صدا', voice: '🎤 ویس', sticker: '😀 استیکر', video_note: '圆形 ویدیو نوت', album: '📦 آلبوم',
  };
  return (
    <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm space-y-2">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">پیش‌نمایش</p>
      {isMedia ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">{mediaIcons[messageType || ''] || '[Media]'}</p>
          {caption ? <p><StyledTextPreview text={caption} entities={captionEntities} /></p> : null}
        </div>
      ) : (
        <p><StyledTextPreview text={text} entities={entities} /></p>
      )}
    </div>
  );
}
