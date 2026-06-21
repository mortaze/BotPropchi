"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X, ChevronDown, ChevronUp, ArrowUpDown } from "lucide-react";
import { Card, CardContent, EmptyState, Pagination, TableRowSkeleton } from "@/components/ui";
import { cn } from "@/lib/utils";

export interface SearchColumn<T> {
  key: string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  render: (item: T) => React.ReactNode;
  filterType?: "text" | "select";
  filterOptions?: { label: string; value: string }[];
}

export interface SearchAction<T> {
  label: string;
  onClick: (item: T) => void;
  variant?: "primary" | "danger" | "ghost";
  icon?: React.ReactNode;
}

export interface SearchFetcherParams {
  page: number;
  limit: number;
  q: string;
  sortKey: string;
  sortDir: "asc" | "desc";
  filters: Record<string, string>;
}

export interface SearchFetcherResult<T> {
  items: T[];
  total: number;
  pages: number;
}

interface SearchConsoleProps<T> {
  title: string;
  description?: string;
  queryKey: string;
  fetcher: (params: SearchFetcherParams) => Promise<SearchFetcherResult<T>>;
  columns: SearchColumn<T>[];
  actions?: SearchAction<T>[];
  defaultSortKey?: string;
  defaultSortDir?: "asc" | "desc";
  pageSize?: number;
  globalSearchPlaceholder?: string;
  syncUrl?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onTotalChange?: (total: number) => void;
}

export default function SearchConsole<T extends { id: number | string }>({
  title,
  description,
  queryKey,
  fetcher,
  columns,
  actions,
  defaultSortKey = "id",
  defaultSortDir = "desc",
  pageSize = 20,
  globalSearchPlaceholder = "جستجو...",
  syncUrl = true,
  emptyTitle = "چیزی یافت نشد",
  emptyDescription,
  onTotalChange,
}: SearchConsoleProps<T>) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [page, setPage] = useState(() => syncUrl ? Number(searchParams.get("page") || "1") : 1);
  const [q, setQ] = useState(() => syncUrl ? searchParams.get("q") || "" : "");
  const [debouncedQ, setDebouncedQ] = useState(q);
  const [sortKey, setSortKey] = useState(() => syncUrl ? searchParams.get("sortKey") || defaultSortKey : defaultSortKey);
  const [sortDir, setSortDir] = useState<"asc" | "desc">(() => {
    if (syncUrl) {
      const dir = searchParams.get("sortDir");
      return dir === "asc" || dir === "desc" ? dir : defaultSortDir;
    }
    return defaultSortDir;
  });
  const [filters, setFilters] = useState<Record<string, string>>(() => {
    if (!syncUrl) return {};
    const f: Record<string, string> = {};
    for (const col of columns) {
      if (col.filterable) {
        const val = searchParams.get(`filter_${col.key}`);
        if (val) f[col.key] = val;
      }
    }
    return f;
  });

  const debounceTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 400);
    return () => { if (debounceTimer.current) clearTimeout(debounceTimer.current); };
  }, [q]);

  const queryParams: SearchFetcherParams = useMemo(() => ({
    page, limit: pageSize, q: debouncedQ, sortKey, sortDir, filters,
  }), [page, pageSize, debouncedQ, sortKey, sortDir, filters]);

  const query = useQuery({
    queryKey: [queryKey, queryParams],
    queryFn: () => fetcher(queryParams),
    placeholderData: (prev: any) => prev,
  });

  useEffect(() => {
    if (query.data?.total !== undefined) onTotalChange?.(query.data.total);
  }, [query.data?.total, onTotalChange]);

  useEffect(() => {
    if (!syncUrl) return;
    const params = new URLSearchParams();
    if (page > 1) params.set("page", String(page));
    if (debouncedQ) params.set("q", debouncedQ);
    if (sortKey !== defaultSortKey) params.set("sortKey", sortKey);
    if (sortDir !== defaultSortDir) params.set("sortDir", sortDir);
    for (const [k, v] of Object.entries(filters)) {
      if (v) params.set(`filter_${k}`, v);
    }
    const qs = params.toString();
    const newUrl = qs ? `?${qs}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [page, debouncedQ, sortKey, sortDir, filters, syncUrl, router, defaultSortKey, defaultSortDir]);

  const handleSort = (key: string) => {
    if (key === sortKey) setSortDir((p) => (p === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };

  const clearFilters = useCallback(() => {
    setQ(""); setDebouncedQ(""); setPage(1); setFilters({});
    searchInputRef.current?.focus();
  }, []);

  const hasActiveFilters = q || Object.values(filters).some(Boolean);

  return (
    <Card>
      <div className="p-5 border-b border-border">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-semibold text-foreground">{title}</h2>
            {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
          </div>
          {query.data && (
            <p className="text-sm text-muted-foreground whitespace-nowrap">
              مجموع: {new Intl.NumberFormat("fa-IR").format(query.data.total)} مورد
            </p>
          )}
        </div>

        <div className="flex flex-col gap-3 mt-4 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={searchInputRef}
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={globalSearchPlaceholder}
              className="w-full pr-9 pl-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {q && (
              <button onClick={() => { setQ(""); setDebouncedQ(""); }}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {columns.filter((c) => c.filterable).map((col) => (
            col.filterType === "select" ? (
              <select key={col.key} value={filters[col.key] || ""}
                onChange={(e) => { setFilters((p) => ({ ...p, [col.key]: e.target.value })); setPage(1); }}
                className="min-w-[140px] px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30">
                <option value="">همه {col.label}</option>
                {col.filterOptions?.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input key={col.key} type="text" value={filters[col.key] || ""}
                onChange={(e) => { setFilters((p) => ({ ...p, [col.key]: e.target.value })); setPage(1); }}
                placeholder={`فیلتر ${col.label}`}
                className="min-w-[140px] px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            )
          ))}

          {hasActiveFilters && (
            <button onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
              <X className="w-4 h-4" /> پاک کردن فیلترها
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              {columns.map((col) => (
                <th key={col.key}
                  className={cn("px-4 py-3 text-right font-medium", col.sortable && "cursor-pointer hover:text-foreground")}
                  onClick={() => col.sortable && handleSort(col.key)}>
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      <ArrowUpDown className={cn("w-3.5 h-3.5", sortKey === col.key && "text-primary")} />
                    )}
                  </span>
                </th>
              ))}
              {actions && actions.length > 0 && <th className="px-4 py-3 text-left font-medium">عملیات</th>}
            </tr>
          </thead>
          <tbody>
            {query.isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRowSkeleton key={i} cols={columns.length + (actions ? 1 : 0)} />
              ))
            ) : query.data?.items.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (actions ? 1 : 0)}>
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              query.data?.items.map((item) => (
                <tr key={item.id} className="border-b border-border/50 transition-colors hover:bg-muted/40">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">{col.render(item)}</td>
                  ))}
                  {actions && actions.length > 0 && (
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {actions.map((action, idx) => (
                          <button key={idx} onClick={() => action.onClick(item)}
                            className={cn(
                              "px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                              action.variant === "danger" ? "text-red-500 hover:bg-red-500/10" :
                              action.variant === "ghost" ? "text-muted-foreground hover:bg-accent" :
                              "text-primary hover:bg-primary/10"
                            )}>
                            {action.label}
                          </button>
                        ))}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {query.data && (
        <Pagination page={page} pages={query.data.pages} onChange={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }} />
      )}
    </Card>
  );
}
