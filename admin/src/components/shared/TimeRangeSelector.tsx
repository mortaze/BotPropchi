"use client";

import { useMemo, useState } from "react";
import { Calendar, ChevronDown, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Persian Date Helpers ───────────────────────────────────
const PERSIAN_MONTHS_FA = [
  "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
  "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند",
];

function gregorianToJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let gy2 = gy;
  if (gm > 2) gy2 += 1;
  let days = 355666 + 365 * gy2 + Math.floor(gy2 / 4) - Math.floor(gy2 / 100) + Math.floor(gy2 / 400) + gd + g_d_m[gm - 1];
  let jy = -1595 + 33 * Math.floor(days / 12053);
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) { jy += Math.floor((days - 1) / 365); days = (days - 1) % 365; }
  let jm: number, jd: number;
  if (days < 186) { jm = 1 + Math.floor(days / 31); jd = 1 + (days % 31); }
  else { jm = 7 + Math.floor((days - 186) / 30); jd = 1 + ((days - 186) % 30); }
  return [jy, jm, jd];
}

function jalaliToGregorian(jy: number, jm: number, jd: number): Date {
  const j_d_m = [0, 31, 62, 93, 124, 155, 186, 216, 246, 276, 306, 336];
  const jd2 = jd + (jm < 7 ? 0 : j_d_m[jm - 7]);
  let gy = jy + 621;
  let gd: number; let gm: number;
  const daysFromJalaliEpoch = jd2 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + 4 + (jy > 0 ? -94 : -95);
  const g4 = daysFromJalaliEpoch + 79 + 1;
  const y1 = Math.floor((g4 - 1) / 146097);
  const y2 = Math.floor((g4 - 1 - y1 * 146097) / 36524);
  const y3 = Math.floor((g4 - 1 - y1 * 146097 - y2 * 36524) / 1461);
  const y4 = Math.floor((g4 - 1 - y1 * 146097 - y2 * 36524 - y3 * 1461) / 365);
  gy = y1 * 100 + y2 * 4 + y3 + y4;
  if (y4 === 4) { gm = 12; gd = 31; } else {
    const doy = g4 - 1 - y1 * 146097 - y2 * 36524 - y3 * 1461 - y4 * 365;
    const daysInMonth = [31, 28 + (y4 === 0 && (y1 !== 0 || y2 !== 0 || y3 % 4 !== 3) ? 0 : 1), 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let md = doy; gm = 1;
    for (let i = 0; i < 12; i++) { if (md < daysInMonth[i]) break; md -= daysInMonth[i]; gm = i + 2; }
    gd = md + 1;
  }
  return new Date(Date.UTC(gy, gm - 1, gd, 12, 0, 0, 0));
}

function isoToJalaliFull(iso: string): string {
  try {
    const d = new Date(iso + "T12:00:00.000Z");
    const [jy, jm, jd] = gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    return `${jy}/${String(jm).padStart(2, "0")}/${String(jd).padStart(2, "0")}`;
  } catch { return iso; }
}

// ─── JalaliDatePicker (inline) ──────────────────────────────
function JalaliDatePicker({ value, onChange, label }: { value: string; onChange: (iso: string) => void; label: string }) {
  const [jy, jm, jd] = useMemo(() => {
    try {
      const d = new Date(value + "T12:00:00.000Z");
      return gregorianToJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    } catch { return [1404, 1, 1]; }
  }, [value]);
  const [editY, setEditY] = useState(String(jy));
  const [editM, setEditM] = useState(String(jm));
  const [editD, setEditD] = useState(String(jd));
  const apply = () => {
    const y = parseInt(editY, 10), m = parseInt(editM, 10), d = parseInt(editD, 10);
    if (isNaN(y) || isNaN(m) || isNaN(d) || m < 1 || m > 12 || d < 1 || d > 31) return;
    onChange(jalaliToGregorian(y, m, d).toISOString().slice(0, 10));
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground whitespace-nowrap">{label}</span>
      <div className="flex items-center gap-1 rounded-lg border border-input bg-background px-2 py-1.5">
        <input type="text" value={editD} onChange={(e) => setEditD(e.target.value)} onBlur={apply} onKeyDown={(e) => e.key === "Enter" && apply()} className="w-8 text-center text-xs bg-transparent outline-none" maxLength={2} />
        <span className="text-xs text-muted-foreground">/</span>
        <input type="text" value={editM} onChange={(e) => setEditM(e.target.value)} onBlur={apply} onKeyDown={(e) => e.key === "Enter" && apply()} className="w-8 text-center text-xs bg-transparent outline-none" maxLength={2} />
        <span className="text-xs text-muted-foreground">/</span>
        <input type="text" value={editY} onChange={(e) => setEditY(e.target.value)} onBlur={apply} onKeyDown={(e) => e.key === "Enter" && apply()} className="w-12 text-center text-xs bg-transparent outline-none" maxLength={4} />
      </div>
      <span className="text-[10px] text-muted-foreground hidden sm:inline">
        {PERSIAN_MONTHS_FA[(parseInt(editM, 10) || 1) - 1] ?? ""}
      </span>
    </div>
  );
}

// ─── Types ──────────────────────────────────────────────────
interface Preset {
  start: string;
  end: string;
  label: string;
}

interface TimeRangeSelectorProps {
  presets: Preset[];
  startDate: string;
  endDate: string;
  activePreset: number | null;
  onStartChange: (iso: string) => void;
  onEndChange: (iso: string) => void;
  onPresetSelect: (index: number, preset: Preset) => void;
}

// ─── Component ──────────────────────────────────────────────
export function TimeRangeSelector({
  presets,
  startDate,
  endDate,
  activePreset,
  onStartChange,
  onEndChange,
  onPresetSelect,
}: TimeRangeSelectorProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);

  const selectedLabel = useMemo(() => {
    if (activePreset !== null && presets[activePreset]) {
      return presets[activePreset].label;
    }
    return `${isoToJalaliFull(startDate)} تا ${isoToJalaliFull(endDate)}`;
  }, [activePreset, presets, startDate, endDate]);

  return (
    <>
      {/* Desktop: inline layout */}
      <div className="hidden sm:flex items-center gap-3 flex-wrap">
        <div className="flex items-center rounded-lg border border-border bg-background p-0.5">
          {presets.map((p, i) => (
            <button
              key={i}
              onClick={() => onPresetSelect(i, p)}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-all duration-200",
                activePreset === i
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <JalaliDatePicker value={startDate} onChange={(v) => onStartChange(v)} label="از:" />
          <JalaliDatePicker value={endDate} onChange={(v) => onEndChange(v)} label="تا:" />
        </div>
      </div>

      {/* Mobile: button + selected range */}
      <div className="flex flex-col gap-2 sm:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center justify-between gap-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-all duration-200 hover:bg-muted active:scale-[0.98]"
        >
          <span className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            بازه زمانی
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
        <p className="px-1 text-xs text-muted-foreground">
          بازه: {selectedLabel}
        </p>
      </div>

      {/* Mobile Bottom Sheet */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 sm:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in"
            onClick={() => setMobileOpen(false)}
          />
          {/* Sheet */}
          <div className="absolute bottom-0 left-0 right-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border-t border-border bg-card p-5" style={{ animation: "slideUp 0.3s ease-out" }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-foreground">انتخاب بازه زمانی</h3>
              <button
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Presets */}
            <div className="space-y-2 mb-4">
              {presets.map((p, i) => (
                <button
                  key={i}
                  onClick={() => {
                    onPresetSelect(i, p);
                    setMobileOpen(false);
                  }}
                  className={cn(
                    "w-full rounded-xl px-4 py-3 text-sm font-medium text-right transition-all duration-200",
                    activePreset === i
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "bg-background border border-border text-foreground hover:bg-muted"
                  )}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom range toggle */}
            <button
              onClick={() => setShowCustom(!showCustom)}
              className={cn(
                "w-full rounded-xl px-4 py-3 text-sm font-medium text-right transition-all duration-200 border",
                activePreset === null
                  ? "bg-primary/10 border-primary/20 text-primary"
                  : "bg-background border-border text-foreground hover:bg-muted"
              )}
            >
              بازه دلخواه
            </button>

            {/* Custom date pickers */}
            {showCustom && (
              <div className="mt-4 space-y-3 rounded-xl border border-border bg-background p-4">
                <JalaliDatePicker value={startDate} onChange={(v) => onStartChange(v)} label="از:" />
                <JalaliDatePicker value={endDate} onChange={(v) => onEndChange(v)} label="تا:" />
                <button
                  onClick={() => {
                    onPresetSelect(-1, { start: startDate, end: endDate, label: "" });
                    setMobileOpen(false);
                  }}
                  className="w-full mt-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition-all duration-200 hover:shadow-md active:scale-[0.98]"
                >
                  اعمال بازه
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </>
  );
}
