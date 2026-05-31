// src/components/ui/index.tsx
"use client";
import { cn } from "@/lib/utils";
import { ChevronRight, ChevronLeft, Inbox } from "lucide-react";

// ─── Badge ─────────────────────────────────────────────────
type BadgeVariant = "default" | "success" | "warning" | "danger" | "info" | "outline";
const badgeStyles: Record<BadgeVariant, string> = {
  default: "bg-secondary text-secondary-foreground",
  success: "bg-green-500/10 text-green-500 border-green-500/20",
  warning: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  danger: "bg-red-500/10 text-red-500 border-red-500/20",
  info: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  outline: "border border-border text-muted-foreground",
};

export function Badge({ children, variant = "default", className }: {
  children: React.ReactNode; variant?: BadgeVariant; className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border border-transparent", badgeStyles[variant], className)}>
      {children}
    </span>
  );
}

// ─── Skeleton ──────────────────────────────────────────────
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton", className)} />;
}

export function StatCardSkeleton() {
  return (
    <div className="stat-card space-y-3">
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3.5 border-b border-border/50">
          <Skeleton className="h-4 w-full max-w-[120px]" />
        </td>
      ))}
    </tr>
  );
}

// ─── Empty State ───────────────────────────────────────────
export function EmptyState({ title = "چیزی یافت نشد", description, icon }: { title?: string; description?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        {icon || <Inbox className="w-6 h-6 text-muted-foreground" />}
      </div>
      <p className="font-medium text-foreground">{title}</p>
      {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────
export function Pagination({ page, pages, onChange }: { page: number; pages: number; onChange: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border">
      <p className="text-sm text-muted-foreground">صفحه {page} از {pages}</p>
      <div className="flex items-center gap-1">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
        {Array.from({ length: Math.min(pages, 5) }, (_, i) => i + 1).map((p) => (
          <button key={p} onClick={() => onChange(p)}
            className={cn("w-8 h-8 rounded-lg text-sm font-medium transition-colors",
              p === page ? "bg-primary text-primary-foreground" : "hover:bg-accent text-muted-foreground")}>
            {p}
          </button>
        ))}
        <button onClick={() => onChange(page + 1)} disabled={page === pages}
          className="p-1.5 rounded-lg hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Card ──────────────────────────────────────────────────
export function Card({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("bg-card border border-border rounded-xl", className)}>{children}</div>;
}

export function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-5 border-b border-border", className)}>{children}</div>;
}

export function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

// ─── Button ────────────────────────────────────────────────
type BtnVariant = "primary" | "secondary" | "danger" | "ghost" | "outline";
const btnStyles: Record<BtnVariant, string> = {
  primary: "bg-primary hover:bg-primary/90 text-primary-foreground",
  secondary: "bg-secondary hover:bg-secondary/80 text-secondary-foreground",
  danger: "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
  ghost: "hover:bg-accent text-foreground",
  outline: "border border-input hover:bg-accent text-foreground",
};

export function Button({ children, variant = "primary", size = "md", className, loading, ...props }: {
  children: React.ReactNode; variant?: BtnVariant; size?: "sm" | "md" | "lg";
  className?: string; loading?: boolean; [k: string]: any;
}) {
  const sizeClass = { sm: "px-3 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-base" }[size];
  return (
    <button className={cn("inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed", btnStyles[variant], sizeClass, className)}
      disabled={loading || props.disabled} {...props}>
      {loading && <span className="w-3.5 h-3.5 border-2 border-current/30 border-t-current rounded-full animate-spin" />}
      {children}
    </button>
  );
}

// ─── Input ─────────────────────────────────────────────────
export function Input({ label, error, className, ...props }: {
  label?: string; error?: string; className?: string; [k: string]: any;
}) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-foreground">{label}</label>}
      <input className={cn(
        "w-full px-3 py-2.5 rounded-lg border bg-background text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
        error ? "border-destructive" : "border-input", className
      )} {...props} />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}


// ─── Textarea ──────────────────────────────────────────────
export function Textarea({ label, error, className, ...props }: {
  label?: string; error?: string; className?: string; [k: string]: any;
}) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-foreground">{label}</label>}
      <textarea className={cn(
        "w-full px-3 py-2.5 rounded-lg border bg-background text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
        error ? "border-destructive" : "border-input", className
      )} {...props} />
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

// ─── Select ────────────────────────────────────────────────
export function Select({ label, error, children, className, ...props }: {
  label?: string; error?: string; children: React.ReactNode; className?: string; [k: string]: any;
}) {
  return (
    <div className="space-y-1.5">
      {label && <label className="block text-sm font-medium text-foreground">{label}</label>}
      <select className={cn(
        "w-full px-3 py-2.5 rounded-lg border bg-background text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary",
        error ? "border-destructive" : "border-input", className
      )} {...props}>{children}</select>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

// ─── Toggle Switch ─────────────────────────────────────────
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <div className="flex items-center gap-2">
      <button onClick={() => onChange(!checked)} type="button"
        className={cn("relative w-10 h-5.5 h-[22px] rounded-full transition-colors duration-200", checked ? "bg-primary" : "bg-muted")}>
        <span className={cn("absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-all duration-200",
          checked ? "right-0.5" : "right-[calc(100%-20px)]")} />
      </button>
      {label && <span className="text-sm text-foreground">{label}</span>}
    </div>
  );
}

// ─── Modal ─────────────────────────────────────────────────
export function Modal({ open, onClose, title, children, size = "md" }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode; size?: "sm" | "md" | "lg" | "xl";
}) {
  if (!open) return null;
  const sizeClass = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("relative bg-card border border-border rounded-2xl shadow-2xl w-full animate-fade-in", sizeClass)}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h3 className="font-semibold text-foreground">{title}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}