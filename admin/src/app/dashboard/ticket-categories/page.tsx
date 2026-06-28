"use client";

import { useEffect, useState, useRef, useCallback, type ChangeEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GripVertical, Trash2, Eye, EyeOff, Plus, Pencil, Save } from "lucide-react";
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
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Badge, Button, Card, CardContent, CardHeader, Input } from "@/components/ui";
import { getApiError, ticketCategoryApi } from "@/services/api";

interface TicketCategory {
  id: number;
  title: string;
  enabled: boolean;
  order: number;
  createdAt: string;
  updatedAt: string;
  _count?: { tickets: number };
}

function SortableCategory({
  cat,
  onToggleEnabled,
  onDelete,
  onEdit,
  isDragging,
}: {
  cat: TicketCategory;
  onToggleEnabled: (cat: TicketCategory) => void;
  onDelete: (cat: TicketCategory) => void;
  onEdit: (cat: TicketCategory) => void;
  isDragging: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isItemDragging,
  } = useSortable({ id: `cat-${cat.id}` });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-3 rounded-xl border bg-background/60 p-3 ${
        isItemDragging
          ? "border-primary/50 shadow-md ring-2 ring-primary/20"
          : "border-border"
      } ${!cat.enabled ? "opacity-60" : ""}`}
    >
      <button className="cursor-grab touch-none rounded p-1 hover:bg-accent" {...attributes} {...listeners}>
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </button>
      <Badge variant={cat.enabled ? "info" : "outline"} className="shrink-0">
        {cat.enabled ? "فعال" : "غیرفعال"}
      </Badge>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{cat.title}</p>
        <p className="text-xs text-muted-foreground">
          ترتیب: {cat.order}
          {cat._count && cat._count.tickets > 0 && ` · ${cat._count.tickets} تیکت`}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="sm" variant="ghost" onClick={() => onEdit(cat)} title="ویرایش">
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onToggleEnabled(cat)} title={cat.enabled ? "غیرفعال‌سازی" : "فعال‌سازی"}>
          {cat.enabled ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </Button>
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onDelete(cat)} title="حذف">
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

export default function TicketCategoriesPage() {
  const queryClient = useQueryClient();
  const [categories, setCategories] = useState<TicketCategory[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [editingCat, setEditingCat] = useState<TicketCategory | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const categoriesRef = useRef(categories);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  categoriesRef.current = categories;

  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const categoriesQuery = useQuery({
    queryKey: ["ticket-categories"],
    queryFn: ticketCategoryApi.listAll,
  });

  useEffect(() => {
    if (categoriesQuery.data) {
      setCategories(categoriesQuery.data);
    }
  }, [categoriesQuery.data]);

  const createMutation = useMutation({
    mutationFn: (title: string) => ticketCategoryApi.create(title),
    onSuccess: (data) => {
      toast.success("دسته‌بندی ایجاد شد");
      setCategories((prev) => [...prev, data]);
      setNewTitle("");
      setShowAddForm(false);
    },
    onError: (e: any) => toast.error(getApiError(e)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { title?: string; enabled?: boolean } }) =>
      ticketCategoryApi.update(id, payload),
    onSuccess: (data) => {
      toast.success("دسته‌بندی به‌روزرسانی شد");
      setCategories((prev) => prev.map((c) => (c.id === data.id ? { ...c, ...data } : c)));
    },
    onError: (e: any) => toast.error(getApiError(e)),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => ticketCategoryApi.remove(id),
    onSuccess: (data) => {
      if (data.disabled) {
        toast.success(`دسته‌بندی غیرفعال شد (${data.ticketCount} تیکت فعال)`);
        setCategories((prev) => prev.map((c) => (c.id === data.id ? { ...c, enabled: false } : c)));
      } else {
        toast.success("دسته‌بندی حذف شد");
        setCategories((prev) => prev.filter((c) => c.id !== data.id));
      }
    },
    onError: (e: any) => toast.error(getApiError(e)),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => ticketCategoryApi.reorder(ids),
    onError: (e: any) => toast.error(getApiError(e)),
  });

  function handleCreate() {
    if (!newTitle.trim()) return;
    createMutation.mutate(newTitle.trim());
  }

  function handleToggleEnabled(cat: TicketCategory) {
    updateMutation.mutate({ id: cat.id, payload: { enabled: !cat.enabled } });
  }

  function handleDelete(cat: TicketCategory) {
    const confirmed = window.confirm(`آیا از حذف دسته‌بندی "${cat.title}" اطمینان دارید؟`);
    if (!confirmed) return;
    deleteMutation.mutate(cat.id);
  }

  function handleEditStart(cat: TicketCategory) {
    setEditingCat(cat);
    setEditTitle(cat.title);
  }

  function handleEditSave() {
    if (!editingCat || !editTitle.trim()) return;
    updateMutation.mutate({ id: editingCat.id, payload: { title: editTitle.trim() } });
    setEditingCat(null);
    setEditTitle("");
  }

  function handleEditCancel() {
    setEditingCat(null);
    setEditTitle("");
  }

  const autoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      const ids = categoriesRef.current.map((c) => c.id);
      reorderMutation.mutate(ids);
    }, 1000);
  }, [reorderMutation]);

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categoriesRef.current.findIndex((c) => `cat-${c.id}` === String(active.id));
    const newIndex = categoriesRef.current.findIndex((c) => `cat-${c.id}` === String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    setCategories((prev) => arrayMove(prev, oldIndex, newIndex));
    autoSave();
  }

  return (
    <div className="w-full max-w-full space-y-6 px-1 lg:max-w-none xl:max-w-none">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">دسته‌بندی تیکت</h1>
          <p className="text-sm text-muted-foreground">مدیریت دسته‌بندی‌های سیستم پشتیبانی تیکت</p>
        </div>
        <Button size="sm" onClick={() => setShowAddForm(true)} disabled={showAddForm}>
          <Plus className="h-4 w-4 ml-1" /> دسته‌بندی جدید
        </Button>
      </div>

      {showAddForm && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <Input
                value={newTitle}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setNewTitle(e.target.value)}
                placeholder="نام دسته‌بندی جدید..."
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && handleCreate()}
                autoFocus
              />
              <Button size="sm" onClick={handleCreate} loading={createMutation.isPending}>
                <Save className="h-4 w-4 ml-1" /> ذخیره
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setShowAddForm(false); setNewTitle(""); }}>
                انصراف
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {editingCat && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-2">
              <Input
                value={editTitle}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setEditTitle(e.target.value)}
                placeholder="نام جدید..."
                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => e.key === "Enter" && handleEditSave()}
                autoFocus
              />
              <Button size="sm" onClick={handleEditSave} loading={updateMutation.isPending}>
                <Save className="h-4 w-4 ml-1" /> ذخیره
              </Button>
              <Button size="sm" variant="outline" onClick={handleEditCancel}>
                انصراف
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {categoriesQuery.isLoading ? (
        <div className="skeleton h-64" />
      ) : (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">
                لیست دسته‌بندی‌ها
                <Badge variant="outline" className="mr-2">{categories.length}</Badge>
              </h2>
            </div>
          </CardHeader>
          <CardContent>
            {categories.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">هنوز دسته‌بندی تعریف نشده است</p>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
              >
                <SortableContext items={categories.map((c) => `cat-${c.id}`)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-3">
                    {categories.map((cat) => (
                      <SortableCategory
                        key={cat.id}
                        cat={cat}
                        onToggleEnabled={handleToggleEnabled}
                        onDelete={handleDelete}
                        onEdit={handleEditStart}
                        isDragging={activeId === `cat-${cat.id}`}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
