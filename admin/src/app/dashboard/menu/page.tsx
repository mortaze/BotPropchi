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
  TouchSensor,
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
      className={`flex w-full items-start gap-2 rounded-xl border p-3 sm:w-auto sm:min-w-[200px] sm:flex-[1_0_200px] sm:max-w-none ${
        isDragging
          ? "border-primary/50 shadow-md ring-2 ring-primary/20 bg-background"
          : "border-border bg-background/60"
      }`}
      title={displayText}
    >
      <button
        className="flex h-11 w-11 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg hover:bg-accent"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-5 w-5 text-muted-foreground" />
      </button>
      <Badge variant={isPostRef(btn.ref) ? "info" : "outline"} className="hidden shrink-0 text-xs sm:inline-flex">
        {isPostRef(btn.ref) ? "پست" : "سیستم"}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="whitespace-normal break-words text-sm font-medium leading-6">{displayText}</p>
        <p className="break-all text-xs text-muted-foreground" dir="ltr">{btn.ref}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-accent"
          onClick={() => onToggleVisibility(btn.id!)}
        >
          {(btn.visible ?? true) ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
        <button
          className="flex h-11 w-11 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(btn)}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function DroppableRow({
  rowIndex,
  buttons,
  isOver,
  onAddRowAt,
  onDeleteRow,
  onToggleVisibility,
  onDeleteButton,
}: {
  rowIndex: number;
  buttons: MenuLayoutButton[];
  isOver: boolean;
  onAddRowAt: (index: number) => void;
  onDeleteRow: (rowIndex: number) => void;
  onToggleVisibility: (btnId: string) => void;
  onDeleteButton: (btn: MenuLayoutButton) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `row-${rowIndex}` });

  return (
    <div ref={setNodeRef} className="space-y-2">
      <button
        onClick={() => onAddRowAt(rowIndex)}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 py-3 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary active:bg-accent"
      >
        <Plus className="h-4 w-4" />
        افزودن ردیف جدید
      </button>

      <Card className={`border-l-4 transition-all ${isOver ? "border-l-primary shadow-lg ring-2 ring-primary/20" : "border-l-border"}`}>
        <CardHeader className="py-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-muted-foreground">ردیف {rowIndex + 1}</h3>
            <button
              className="flex h-11 items-center gap-1 rounded-lg px-3 text-sm text-destructive hover:bg-destructive/10 active:bg-destructive/20"
              onClick={() => onDeleteRow(rowIndex)}
            >
              <Trash2 className="h-4 w-4" />
              <span className="hidden sm:inline">حذف ردیف</span>
            </button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <SortableContext items={buttons.map((b) => `btn-${b.id}`)} strategy={horizontalListSortingStrategy}>
            <div className={`flex flex-wrap gap-3 rounded-lg p-1 transition-colors min-h-[48px] ${isOver ? "bg-primary/5" : ""}`}>
              {buttons.length === 0 ? (
                <div className="flex w-full items-center justify-center rounded-lg border border-dashed border-muted-foreground/20 py-8 text-sm text-muted-foreground/50">
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
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
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
      for (const btn of row) {
        if (btn.id) {
          deleteMutation.mutate(btn.id);
        }
      }
    }
    setLayout((prev) => prev.filter((_, i) => i !== rowIndex));
  }

  function handleAddRowAt(index: number) {
    setLayout((prev) => {
      const next = [...prev];
      next.splice(index, 0, []);
      return next;
    });
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
    if (overId.startsWith("btn-")) {
      const overBtnId = overId.replace("btn-", "");
      const pos = findButtonAndRow(overBtnId);
      if (pos) return { rowIdx: pos.rowIdx, insertIdx: pos.btnIdx };
    }
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
    document.body.style.touchAction = "none";
    document.body.style.overflow = "hidden";
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
    document.body.style.touchAction = "";
    document.body.style.overflow = "";

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

      next[activePos.rowIdx] = next[activePos.rowIdx].filter((_, i) => i !== activePos.btnIdx);

      let insertIdx = target.insertIdx;
      if (activePos.rowIdx === target.rowIdx && activePos.btnIdx < target.insertIdx) {
        insertIdx--;
      }

      next[target.rowIdx].splice(Math.max(0, insertIdx), 0, btn);

      return next;
    });

    autoSave();
  }

  const allButtonIds = layout.flatMap((row) => row.map((btn) => `btn-${btn.id}`));

  return (
    <div className="w-full space-y-4 px-3 sm:px-4 md:space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">مدیریت منو</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">ویرایش چیدمان دکمه‌های منوی ربات</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="text-xs">نسخه {version}</Badge>
          <Button variant="outline" size="sm" className="h-11 min-w-[44px]" onClick={() => rollbackMutation.mutate()} loading={rollbackMutation.isPending}>
            <RotateCcw className="h-4 w-4" />
            <span className="hidden sm:inline">بازگشت</span>
          </Button>
          <Button variant="outline" size="sm" className="h-11 min-w-[44px]" onClick={() => syncMutation.mutate()} loading={syncMutation.isPending}>
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">همگام‌سازی پست‌ها</span>
          </Button>
          <Button size="sm" className="h-11 min-w-[44px]" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            <Save className="h-4 w-4" />
            <span className="hidden sm:inline">ذخیره تغییرات</span>
          </Button>
        </div>
      </div>

      {layoutQuery.isLoading ? <div className="skeleton h-64" /> : (
        <>
          <Card className="hidden sm:block">
            <CardHeader className="py-3"><h2 className="font-semibold">پیش‌نمایش</h2></CardHeader>
            <CardContent className="pt-0">
              <div className="overflow-x-auto rounded-xl border border-border bg-background/60 p-4 text-sm">
                {layout.length === 0 ? (
                  <p className="text-center text-muted-foreground">منو خالی است</p>
                ) : (
                  <div className="space-y-1">
                    {layout.map((row, ri) => (
                      <div key={ri} className="flex flex-wrap gap-2">
                        {row.map((btn, bi) => (
                          <span key={bi} className={`min-w-[80px] max-w-[360px] flex-1 whitespace-normal break-words rounded border px-3 py-1.5 text-center text-xs ${
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
              <div className="space-y-3 sm:space-y-4">
                {layout.map((row, ri) => (
                  <DroppableRow
                    key={`row-${ri}`}
                    rowIndex={ri}
                    buttons={row}
                    isOver={overRowId === `row-${ri}`}
                    onAddRowAt={handleAddRowAt}
                    onDeleteRow={handleDeleteRow}
                    onToggleVisibility={handleToggleVisibility}
                    onDeleteButton={handleDeleteButton}
                  />
                ))}
                {layout.length === 0 && (
                  <button
                    onClick={() => handleAddRowAt(0)}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-muted-foreground/30 py-4 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary active:bg-accent"
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
