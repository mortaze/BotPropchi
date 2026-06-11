"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Eye, EyeOff, Save, RotateCcw, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button, Card, CardContent, CardHeader } from "@/components/ui";
import { getApiError, menuApi } from "@/services/api";
import type { MenuLayoutButton } from "@/types";

export default function MenuPage() {
  const [layout, setLayout] = useState<MenuLayoutButton[][]>([]);
  const [version, setVersion] = useState(0);

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
    mutationFn: () => menuApi.saveLayout(layout),
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

  function moveRow(fromIndex: number, toIndex: number) {
    if (toIndex < 0 || toIndex >= layout.length) return;
    const next = [...layout];
    [next[fromIndex], next[toIndex]] = [next[toIndex], next[fromIndex]];
    setLayout(next);
  }

  function deleteRow(index: number) {
    const next = layout.filter((_, i) => i !== index);
    setLayout(next);
  }

  function resizeRow(index: number, cols: number) {
    const next = [...layout];
    const row = next[index];
    if (row.length <= cols) return;
    const keep = row.slice(0, cols);
    const overflow = row.slice(cols);
    next[index] = keep;
    next.splice(index + 1, 0, overflow);
    setLayout(next);
  }

  function moveButton(rowIndex: number, fromIndex: number, toIndex: number) {
    const next = [...layout];
    const row = [...next[rowIndex]];
    if (toIndex < 0 || toIndex >= row.length) return;
    [row[fromIndex], row[toIndex]] = [row[toIndex], row[fromIndex]];
    next[rowIndex] = row;
    setLayout(next);
  }

  function toggleVisibility(rowIndex: number, btnIndex: number) {
    const next = [...layout];
    const row = [...next[rowIndex]];
    row[btnIndex] = { ...row[btnIndex], visible: !(row[btnIndex].visible ?? true) };
    next[rowIndex] = row;
    setLayout(next);
  }

  function isPostRef(ref: string) {
    return ref.startsWith("post_");
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">مدیریت منو</h1>
          <p className="text-sm text-muted-foreground">ویرایش چیدمان دکمه‌های منوی ربات</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>نسخه {version}</Badge>
          <Button variant="outline" size="sm" onClick={() => rollbackMutation.mutate()} loading={rollbackMutation.isPending}><RotateCcw className="h-4 w-4" />بازگشت</Button>
          <Button variant="outline" size="sm" onClick={() => syncMutation.mutate()} loading={syncMutation.isPending}><RefreshCw className="h-4 w-4" />همگام‌سازی پست‌ها</Button>
          <Button size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}><Save className="h-4 w-4" />ذخیره</Button>
        </div>
      </div>

      {layoutQuery.isLoading ? <div className="skeleton h-64" /> : (
        <>
          <Card>
            <CardHeader><h2 className="font-semibold">پیش‌نمایش</h2></CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-xl border border-border bg-background/60 p-4 font-mono text-sm" dir="ltr">
                {layout.length === 0 ? (
                  <p className="text-center text-muted-foreground">منو خالی است</p>
                ) : (
                  <div className="space-y-1">
                    {layout.map((row, ri) => (
                      <div key={ri} className="flex gap-1">
                        {row.map((btn, bi) => (
                          <span key={bi} className={`flex-1 rounded border px-2 py-1 text-center text-xs ${
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

          <div className="space-y-4">
            {layout.map((row, ri) => (
              <Card key={ri}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">ردیف {ri + 1}</h3>
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" disabled={ri === 0} onClick={() => moveRow(ri, ri - 1)}><ArrowUp className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" disabled={ri === layout.length - 1} onClick={() => moveRow(ri, ri + 1)}><ArrowDown className="h-4 w-4" /></Button>
                      {[1, 2, 3].map((c) => (
                        <Button key={c} size="sm" variant={row.length <= c ? "secondary" : "ghost"} onClick={() => resizeRow(ri, c)}>{c}</Button>
                      ))}
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => deleteRow(ri)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {row.map((btn, bi) => (
                      <div key={bi} className="flex min-w-[120px] flex-1 items-center gap-2 rounded-xl border border-border bg-background/60 p-3">
                        <Badge variant={isPostRef(btn.ref) ? "info" : "outline"} className="shrink-0">
                          {isPostRef(btn.ref) ? "پست" : "سیستم"}
                        </Badge>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{btn.text}</p>
                          <p className="truncate text-xs text-muted-foreground" dir="ltr">{btn.ref}</p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button size="sm" variant="ghost" disabled={bi === 0} onClick={() => moveButton(ri, bi, bi - 1)}><ArrowUp className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" disabled={bi === row.length - 1} onClick={() => moveButton(ri, bi, bi + 1)}><ArrowDown className="h-3.5 w-3.5" /></Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleVisibility(ri, bi)}>
                            {(btn.visible ?? true) ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
