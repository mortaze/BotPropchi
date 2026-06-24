"use client";

import { useState } from "react";
import { Copy, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Badge, Button } from "@/components/ui";
import { formatNumber, safeDateFormat } from "@/lib/utils";
import type { LotteryWinner } from "@/types";

interface WinnerPanelProps {
  winners: LotteryWinner[];
  isLoading?: boolean;
}

export default function WinnerPanel({ winners, isLoading }: WinnerPanelProps) {
  const [copied, setCopied] = useState(false);

  const copyAllWinners = () => {
    const text = winners
      .map((w, i) => `${i + 1}. ${w.winnerFirstName} ${w.winnerLastName || ""} (${w.winnerUsername ? `@${w.winnerUsername}` : "-"})`)
      .join("\n");

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success("لیست برندگان کپی شد");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <h3 className="font-semibold">برندگان</h3>
        </div>
        {winners.length > 0 && (
          <Button size="sm" variant="outline" onClick={copyAllWinners}>
            <Copy className="h-4 w-4 ml-1" />
            {copied ? "کپی شد" : "کپی همه"}
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-12 rounded-lg" />
          ))}
        </div>
      ) : winners.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          <Trophy className="h-8 w-8 mx-auto mb-2 opacity-50" />
          <p>هنوز برنده‌ای انتخاب نشده</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[400px] overflow-y-auto">
          {winners.map((winner) => (
            <div
              key={winner.id}
              className="flex items-center justify-between rounded-lg bg-muted/40 p-3"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-yellow-500/20 text-yellow-600 font-bold text-sm">
                  {winner.roundNumber}
                </div>
                <div>
                  <p className="font-medium">
                    {winner.winnerFirstName} {winner.winnerLastName || ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {winner.winnerUsername ? `@${winner.winnerUsername}` : "-"}
                  </p>
                </div>
              </div>
              <div className="text-left">
                <Badge variant={winner.notified ? "success" : "warning"}>
                  {winner.notified ? "ارسال شده" : "در انتظار"}
                </Badge>
                <p className="text-xs text-muted-foreground mt-1">
                  {safeDateFormat(winner.wonAt, { timeStyle: "short" })}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
