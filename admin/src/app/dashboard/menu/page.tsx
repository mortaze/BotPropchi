"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Save, RotateCcw, RefreshCw, GripVertical, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Button, Card, CardContent, CardHeader } from "@/components/ui";
import { getApiError, menuApi } from "@/services/api";
import type { MenuLayoutButton } from "@/types";

function SortableButton({
  btn,
  onToggleVisibility,
  onDelete,
}: {
  btn: MenuLayoutButton;
  onToggleVisibility: (btnId: string) => void;
  onDelete: (btn: MenuLayoutButton) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `btn-${btn.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  function isPostRef(ref: string) {
    return ref.startsWith("post:") || ref.startsWith("post_");
  }

  const displayText = btn.text || btn.label || btn.title || btn.ref;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex min-w-[200px] max-w-none flex-[1_0_200px] items-start gap-2 rounded-xl border p-3 ${
        isDragging
          ? "border-primary/50 shadow-md ring-2 ring-primary/20 bg-background"
          : "border-border bg-background/60"
      }`}
      title={displayText}
    >
      <button className="cursor-grab touch-none rounded p-1 hover:bg-accent" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <Badge variant={isPostRef(btn.ref) ? "info" : "outline"} className="shrink-0 text-xs">
        {isPostRef(btn.ref) ? "پست" : "سیستم"}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="whitespace-normal break-words text-sm font-medium leading-6">{displayText}</p>
        <p className="break-all text-xs text-muted-foreground" dir="ltr">{btn.ref}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="ghost" onClick={() => onToggleVisibility(btn.id!)}>
          {(btn.visible ?? true) ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(btn)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function DroppableRow({
  rowIndex,
  buttons,
  isOver,
  onAddRow,
  onDeleteRow,
  onToggleVisibility,
  onDeleteButton,
}: {
  rowIndex: number;
  buttons: MenuLayoutButton[];
  isOver: boolean;
  onAddRow: () => void;
  onDeleteRow: (rowIndex: number) => void;
  onToggleVisibility: (btnId: string) => void;
  onDeleteButton: (btn: MenuLayoutButton) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `row-${rowIndex}` });

  return (
    <div ref={setNodeRef} className="space-y-2">
      {rowIndex === 0 && (
        <button
          onClick={onAddRow}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <Plus className="h-4 w-4" />
          افزودن ردیف جدید
        </button>
      )}

      <Card className={`border-l-4 transition-all ${isOver ? "border-l-primary shadow-lg ring-2 ring-primary/20" : "border-l-border"}`}>
        <CardHeader className="py-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">ردیف {rowIndex + 1}</h3>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={() => onDeleteRow(rowIndex)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              حذف ردیف
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <SortableContext items={buttons.map((b) => `btn-${b.id}`)} strategy={horizontalListSortingStrategy}>
            <div className={`flex min-w-max flex-nowrap gap-3 overflow-x-auto pb-2 min-h-[48px] rounded-lg transition-colors ${isOver ? "bg-primary/5" : ""}`}>
              {buttons.length === 0 ? (
                <div className="flex w-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/20 py-6 text-sm text-muted-foreground/50">
                  دکمه‌ای اینجا نیست — بکشید و رها کنید
                </div>
              ) : (
                buttons.map((btn) => (
                  <SortableButton
                    key={btn.id}
                    btn={btn}
                    onToggleVisibility={onToggleVisibility}
                    onDelete={onDeleteButton}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </CardContent>
      </Card>

      <button
        onClick={onAddRow}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        <Plus className="h-4 w-4" />
        افزودن ردیف جدید
      </button>
    </div>
  );
}

export default function MenuPage() {
  const [layout, setLayout] = useState<MenuLayoutButton[][]>([]);
  const [version, setVersion] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [overRowId, setOverRowId] = useState<string | null>(null);
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

  function handleDeleteButton(btn: MenuLayoutButton) {
    if (!btn.id) {
      setLayout((prev) => {
        const next = prev.map((r) => r.filter((b) => b !== btn));
        return next.filter((r) => r.length > 0);
      });
      toast.success("دکمه حذف شد (محلی)");
      return;
    }
    const confirmed = window.confirm(`آیا از حذف دکمه "${btn.text}" اطمینان دارید؟`);
    if (!confirmed) return;
    deleteMutation.mutate(btn.id);
  }

  function handleDeleteRow(rowIndex: number) {
    const row = layout[rowIndex];
    if (!row) return;
    if (row.length > 0) {
      const confirmed = window.confirm("این ردیف دارای دکمه است. آیا مطمئن هستید؟");
      if (!confirmed) return;
      // Delete buttons from server if they have IDs
      for (const btn of row) {
        if (btn.id) {
          deleteMutation.mutate(btn.id);
        }
      }
    }
    setLayout((prev) => prev.filter((_, i) => i !== rowIndex));
  }

  function handleAddRow() {
    setLayout((prev) => [...prev, []]);
  }

  function handleToggleVisibility(btnId: string) {
    setLayout((prev) =>
      prev.map((row) =>
        row.map((btn) =>
          btn.id === btnId ? { ...btn, visible: !(btn.visible ?? true) } : btn
        )
      )
    );
  }

  function findButtonAndRow(btnId: string): { rowIdx: number; btnIdx: number } | null {
    for (let ri = 0; ri < layoutRef.current.length; ri++) {
      for (let bi = 0; bi < layoutRef.current[ri].length; bi++) {
        if (layoutRef.current[ri][bi].id === btnId) {
          return { rowIdx: ri, btnIdx: bi };
        }
      }
    }
    return null;
  }

  function findRowAtPosition(overId: string): { rowIdx: number; insertIdx: number } | null {
    // Check if over a button
    if (overId.startsWith("btn-")) {
      const overBtnId = overId.replace("btn-", "");
      const pos = findButtonAndRow(overBtnId);
      if (pos) return { rowIdx: pos.rowIdx, insertIdx: pos.btnIdx };
    }
    // Check if over a row droppable
    if (overId.startsWith("row-")) {
      const rowIdx = parseInt(overId.replace("row-", ""));
      if (!isNaN(rowIdx) && layoutRef.current[rowIdx]) {
        return { rowIdx, insertIdx: layoutRef.current[rowIdx].length };
      }
    }
    return null;
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

  function handleDragOver(event: DragOverEvent) {
    const { over } = event;
    if (!over) {
      setOverRowId(null);
      return;
    }
    const overId = String(over.id);
    if (overId.startsWith("row-")) {
      setOverRowId(overId);
    } else if (overId.startsWith("btn-")) {
      const pos = findButtonAndRow(overId.replace("btn-", ""));
      if (pos) setOverRowId(`row-${pos.rowIdx}`);
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    setOverRowId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeIdStr = String(active.id);
    const overIdStr = String(over.id);

    if (!activeIdStr.startsWith("btn-")) return;

    const activeBtnId = activeIdStr.replace("btn-", "");
    const activePos = findButtonAndRow(activeBtnId);
    if (!activePos) return;

    const target = findRowAtPosition(overIdStr);
    if (!target) return;

    setLayout((prev) => {
      const next = prev.map((row) => [...row]);
      const btn = next[activePos.rowIdx][activePos.btnIdx];
      if (!btn) return prev;

      // Remove from source
      next[activePos.rowIdx] = next[activePos.rowIdx].filter((_, i) => i !== activePos.btnIdx);

      // Adjust insert index if same row and source was before target
      let insertIdx = target.insertIdx;
      if (activePos.rowIdx === target.rowIdx && activePos.btnIdx < target.insertIdx) {
        insertIdx--;
      }

      // Insert at target
      next[target.rowIdx].splice(Math.max(0, insertIdx), 0, btn);

      return next;
    });

    autoSave();
  }

  // Flatten all button IDs for the SortableContext
  const allButtonIds = layout.flatMap((row) => row.map((btn) => `btn-${btn.id}`));

  return (
    <div className="w-full max-w-full space-y-6 px-1 lg:max-w-none xl:max-w-none">
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
              <div className="overflow-x-auto rounded-xl border border-border bg-background/60 p-4 text-sm">
                {layout.length === 0 ? (
                  <p className="text-center text-muted-foreground">منو خالی است</p>
                ) : (
                  <div className="space-y-1">
                    {layout.map((row, ri) => (
                      <div key={ri} className="flex min-w-max flex-nowrap gap-2">
                        {row.map((btn, bi) => (
                          <span key={bi} className={`min-w-[120px] max-w-[360px] flex-1 whitespace-normal break-words rounded border px-3 py-1.5 text-center text-xs ${
                            (btn.visible ?? true)
                              ? "border-border bg-background"
                              : "border-dashed border-muted-foreground/30 text-muted-foreground/50"
                          }`}>
                            {(btn.visible ?? true) ? (btn.text || btn.label || btn.title || btn.ref) : "🙈"}
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
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={allButtonIds} strategy={horizontalListSortingStrategy}>
              <div className="space-y-4">
                {layout.map((row, ri) => (
                  <DroppableRow
                    key={`row-${ri}`}
                    rowIndex={ri}
                    buttons={row}
                    isOver={overRowId === `row-${ri}`}
                    onAddRow={handleAddRow}
                    onDeleteRow={handleDeleteRow}
                    onToggleVisibility={handleToggleVisibility}
                    onDeleteButton={handleDeleteButton}
                  />
                ))}
                {layout.length === 0 && (
                  <button
                    onClick={handleAddRow}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 py-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
                  >
                    <Plus className="h-4 w-4" />
                    افزودن ردیف جدید
                  </button>
                )}
              </div>
            </SortableContext>
          </DndContext>
        </>
      )}
    </div>
  );
}
