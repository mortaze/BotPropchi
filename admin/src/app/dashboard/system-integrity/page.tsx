"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, EmptyState, StatCardSkeleton } from "@/components/ui";
import { systemIntegrityApi } from "@/services/api";
import { formatNumber } from "@/lib/utils";
import { Shield, ShieldCheck, ShieldAlert, AlertTriangle, CheckCircle, XCircle } from "lucide-react";

function ScoreGauge({ score }: { score: number }) {
  const color = score >= 90 ? "#22c55e" : score >= 70 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 45;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="relative w-32 h-32">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" className="text-muted/20" />
        <circle cx="50" cy="50" r="45" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} className="transition-all duration-1000" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-muted-foreground">از ۱۰۰</span>
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const styles: Record<string, string> = {
    CRITICAL: "bg-red-500/10 text-red-600",
    HIGH: "bg-orange-500/10 text-orange-600",
    MEDIUM: "bg-yellow-500/10 text-yellow-600",
    LOW: "bg-blue-500/10 text-blue-600",
  };
  const labels: Record<string, string> = {
    CRITICAL: "بحرانی",
    HIGH: "بالا",
    MEDIUM: "متوسط",
    LOW: "پایین",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[severity] ?? "bg-muted text-muted-foreground"}`}>
      {labels[severity] ?? severity}
    </span>
  );
}

export default function SystemIntegrityPage() {
  const query = useQuery({
    queryKey: ["system-integrity"],
    queryFn: () => systemIntegrityApi.getHealth(),
  });

  const report = query.data?.data;

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <div className="page-header"><div><h1 className="section-title">سلامت سیستم</h1></div></div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }
  if (!report) return <EmptyState />;

  const totalIssues = report.sections.reduce((a, s) => a + s.issues.length, 0);
  const criticalIssues = report.sections.flatMap(s => s.issues).filter(i => i.severity === 'CRITICAL').length;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="section-title">سلامت سیستم</h1>
          <p className="text-sm text-muted-foreground">گزارش جامع یکپارچگی داده‌ها و عملکرد سیستم</p>
        </div>
      </div>

      {/* Overall Score */}
      <Card>
        <CardContent className="pt-6 flex items-center gap-8">
          <ScoreGauge score={report.overallScore} />
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-foreground">
              {report.overallScore >= 90 ? "عالی" : report.overallScore >= 70 ? "قابل قبول" : "نیاز به تعمیر"}
            </h2>
            <p className="text-sm text-muted-foreground">
              {totalIssues} مشکل یافت شده — {criticalIssues} مورد بحرانی
            </p>
            <p className="text-xs text-muted-foreground">
              بروزرسانی: {new Date(report.timestamp).toLocaleString('fa-IR')}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Section Scores */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {report.sections.map((section, i) => {
          const sectionScore = section.maxScore > 0 ? Math.round((section.score / section.maxScore) * 100) : 100;
          const hasIssues = section.issues.length > 0;
          return (
            <Card key={i}>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-foreground">{section.name}</h3>
                  <span className={`text-lg font-bold ${sectionScore >= 90 ? "text-green-500" : sectionScore >= 70 ? "text-yellow-500" : "text-red-500"}`}>
                    {sectionScore}%
                  </span>
                </div>
                {hasIssues ? (
                  <div className="space-y-2">
                    {section.issues.map((issue, j) => (
                      <div key={j} className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2">
                          <SeverityBadge severity={issue.severity} />
                          <span className="text-muted-foreground">{issue.message}</span>
                        </div>
                        <span className="font-medium">{formatNumber(issue.count)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-green-500 text-sm">
                    <CheckCircle className="h-4 w-4" />
                    <span>بدون مشکل</span>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Critical Issues Alert */}
      {criticalIssues > 0 && (
        <Card className="border-2 border-red-500/30">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-6 w-6 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-700">مشکلات بحرانی یافت شده</p>
                <p className="text-sm text-red-600 mt-1">
                  {criticalIssues} مشکل بحرانی نیاز به بررسی فوری دارد.
                  این مشکلات ممکن است باعث خطا در ارسال پیام یا از دست رفتن داده شوند.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
