"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Save, RotateCcw, RefreshCw, GripVertical, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Button, Card, CardContent, CardHeader } from "@/components/ui";
import { getApiError, menuApi } from "@/services/api";
import type { MenuLayoutButton } from "@/types";

function SortableRow({
  row,
  rowIndex,
  onToggleVisibility,
  onDelete,
  isDragging,
}: {
  row: MenuLayoutButton[];
  rowIndex: number;
  onToggleVisibility: (ri: number, bi: number) => void;
  onDelete: (ri: number, bi: number) => void;
  isDragging: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isRowDragging,
  } = useSortable({ id: `row-${rowIndex}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isRowDragging ? 0.4 : undefined,
  };

  return (
    <Card
      ref={setNodeRef}
      style={style}
      className={`border-l-4 ${isRowDragging ? "border-l-primary shadow-lg scale-[1.01]" : "border-l-border"}`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="cursor-grab touch-none rounded p-1 hover:bg-accent" {...attributes} {...listeners}>
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </button>
            <h3 className="text-sm font-semibold">ردیف {rowIndex + 1}</h3>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <SortableContext items={row.map((_, bi) => `btn-${rowIndex}-${bi}`)} strategy={horizontalListSortingStrategy}>
          <div className="flex flex-wrap gap-3">
            {row.map((btn, bi) => (
              <SortableButton
                key={`btn-${rowIndex}-${bi}`}
                btn={btn}
                rowIndex={rowIndex}
                btnIndex={bi}
                onToggleVisibility={onToggleVisibility}
                onDelete={onDelete}
                isDragging={isDragging}
              />
            ))}
          </div>
        </SortableContext>
      </CardContent>
    </Card>
  );
}

function SortableButton({
  btn,
  rowIndex,
  btnIndex,
  onToggleVisibility,
  onDelete,
}: {
  btn: MenuLayoutButton;
  rowIndex: number;
  btnIndex: number;
  onToggleVisibility: (ri: number, bi: number) => void;
  onDelete: (ri: number, bi: number) => void;
  isDragging: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isBtnDragging,
  } = useSortable({ id: `btn-${rowIndex}-${btnIndex}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  function isPostRef(ref: string) {
    return ref.startsWith("post_");
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex min-w-[200px] flex-1 items-center gap-3 rounded-xl border bg-background/60 p-3 ${
        isBtnDragging
          ? "border-primary/50 shadow-md ring-2 ring-primary/20"
          : "border-border"
      }`}
      title={btn.text}
    >
      <button className="cursor-grab touch-none rounded p-1 hover:bg-accent" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <Badge variant={isPostRef(btn.ref) ? "info" : "outline"} className="shrink-0">
        {isPostRef(btn.ref) ? "پست" : "سیستم"}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{btn.text}</p>
        <p className="truncate text-xs text-muted-foreground" dir="ltr">{btn.ref}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="ghost" onClick={() => onToggleVisibility(rowIndex, btnIndex)}>
          {(btn.visible ?? true) ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(rowIndex, btnIndex)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function MenuPage() {
  const [layout, setLayout] = useState<MenuLayoutButton[][]>([]);
  const [version, setVersion] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const layoutRef = useRef(layout);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  layoutRef.current = layout;

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const layoutQuery = useQuery({
    queryKey: ["menu-layout"],
    queryFn: menuApi.getLayout,
  });

  useEffect(() => {
    if (layoutQuery.data) {
      setLayout(layoutQuery.data.layout);
      setVersion(layoutQuery.data.version);
    }
  }, [layoutQuery.data]);

  const saveMutation = useMutation({
    mutationFn: () => menuApi.saveLayout(layoutRef.current),
    onSuccess: (data) => {
      toast.success("منو ذخیره شد");
      setLayout(data.layout);
      setVersion(data.version);
    },
    onError: (e) => toast.error(getApiError(e)),
  });

  const syncMutation = useMutation({
    mutationFn: menuApi.syncPosts,
    onSuccess: (data) => {
      toast.success(data.message || "پست‌ها همگام‌سازی شدند");
      layoutQuery.refetch();
    },
    onError: (e) => toast.error(getApiError(e)),
  });

  const rollbackMutation = useMutation({
    mutationFn: menuApi.rollback,
    onSuccess: (data) => {
      toast.success("منو به نسخه قبلی بازگشت");
      setLayout(data.layout);
    },
    onError: (e) => toast.error(getApiError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (buttonId: string) => menuApi.deleteButton(buttonId),
    onSuccess: (data) => {
      toast.success("دکمه حذف شد");
      setLayout(data.layout);
      setVersion(data.version);
    },
    onError: (e) => toast.error(getApiError(e)),
  });

  function handleDelete(rowIndex: number, btnIndex: number) {
    const btn = layout[rowIndex]?.[btnIndex];
    if (!btn) return;
    const buttonId = btn.id;
    if (!buttonId) {
      setLayout((prev) => {
        const next = prev.map((r) => [...r]);
        next[rowIndex].splice(btnIndex, 1);
        return next.filter((r) => r.length > 0);
      });
      toast.success("دکمه حذف شد (محلی)");
      return;
    }
    const confirmed = window.confirm(`آیا از حذف دکمه "${btn.text}" اطمینان دارید؟`);
    if (!confirmed) return;
    deleteMutation.mutate(buttonId);
  }

  function toggleVisibility(rowIndex: number, btnIndex: number) {
    setLayout((prev) => {
      const next = prev.map((row) => row.map((btn) => ({ ...btn })));
      next[rowIndex][btnIndex] = {
        ...next[rowIndex][btnIndex],
        visible: !(next[rowIndex][btnIndex].visible ?? true),
      };
      return next;
    });
  }

  const autoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (saveMutation.isPending) return;
      saveMutation.mutate();
    }, 1500);
  }, [saveMutation]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    let changed = false;

    if (activeIdStr.startsWith("row-")) {
      const oldIndex = parseInt(activeIdStr.replace("row-", ""));
      const newIndex = parseInt(overIdStr.replace("row-", ""));
      setLayout((prev) => {
        if (oldIndex === newIndex) return prev;
        changed = true;
        return arrayMove(prev, oldIndex, newIndex);
      });
    } else if (activeIdStr.startsWith("btn-") && overIdStr.startsWith("btn-")) {
      const [_, aRow, aCol] = activeIdStr.split("-");
      const [__, bRow, bCol] = overIdStr.split("-");
      if (aRow !== bRow) return;
      const rowIdx = parseInt(aRow);
      const fromIdx = parseInt(aCol);
      const toIdx = parseInt(bCol);
      if (fromIdx === toIdx) return;
      setLayout((prev) => {
        const next = prev.map((row) => [...row]);
        const row = next[rowIdx];
        const fromItem = { ...row[fromIdx] };
        const toItem = { ...row[toIdx] };
        row[fromIdx] = toItem;
        row[toIdx] = fromItem;
        changed = true;
        return next;
      });
    }

    if (changed) {
      autoSave();
    }
  }

  return (
    <div className="w-full max-w-full space-y-6 lg:max-w-7xl xl:max-w-[1600px]">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">مدیریت منو</h1>
          <p className="text-sm text-muted-foreground">ویرایش چیدمان دکمه‌های منوی ربات</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">نسخه {version}</Badge>
          <Button variant="outline" size="sm" onClick={() => rollbackMutation.mutate()} loading={rollbackMutation.isPending}><RotateCcw className="h-4 w-4" />بازگشت</Button>
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} loading={syncMutation.isPending}><RefreshCw className="h-4 w-4" />همگام‌سازی پست‌ها</Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}><Save className="h-4 w-4" />ذخیره تغییرات</Button>
        </div>
      </div>

      {layoutQuery.isLoading ? <div className="skeleton h-64" /> : (
        <>
          <Card>
            <CardHeader><h2 className="font-semibold">پیش‌نمایش</h2></CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-xl border border-border bg-background/60 p-4 text-sm">
                {layout.length === 0 ? (
                  <p className="text-center text-muted-foreground">منو خالی است</p>
                ) : (
                  <div className="space-y-1">
                    {layout.map((row, ri) => (
                      <div key={ri} className="flex flex-wrap gap-1">
                        {row.map((btn, bi) => (
                          <span key={bi} className={`min-w-[80px] flex-1 rounded border px-3 py-1.5 text-center text-xs ${
                            (btn.visible ?? true)
                              ? "border-border bg-background"
                              : "border-dashed border-muted-foreground/30 text-muted-foreground/50"
                          }`}>
                            {(btn.visible ?? true) ? btn.text : "🙈"}
                          </span>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={layout.map((_, ri) => `row-${ri}`)} strategy={verticalListSortingStrategy}>
              <div className="space-y-4">
                {layout.map((row, ri) => (
                  <SortableRow
                    key={`row-${ri}`}
                    row={row}
                    rowIndex={ri}
                    onToggleVisibility={toggleVisibility}
                    onDelete={handleDelete}
                    isDragging={activeId === `row-${ri}`}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}
