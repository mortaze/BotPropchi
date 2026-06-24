"use client";

import { Trophy, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { LotteryWinner } from "@/types";

interface WinnerModalProps {
  winner: LotteryWinner | null;
  onClose: () => void;
}

export default function WinnerModal({ winner, onClose }: WinnerModalProps) {
  if (!winner) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative bg-card rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl animate-in fade-in zoom-in duration-300">
        <button
          onClick={onClose}
          className="absolute top-4 left-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="text-center">
          <div className="mb-4">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-yellow-500/20 animate-bounce">
              <Trophy className="h-10 w-10 text-yellow-500" />
            </div>
          </div>

          <h2 className="text-2xl font-bold mb-2">🏆 برنده!</h2>

          <div className="my-6">
            <p className="text-4xl font-bold text-primary">
              {winner.winnerFirstName} {winner.winnerLastName || ""}
            </p>
            {winner.winnerUsername && (
              <p className="text-lg text-muted-foreground mt-2">
                @{winner.winnerUsername}
              </p>
            )}
          </div>

          <div className="bg-muted/40 rounded-lg p-4 mb-6">
            <p className="text-sm text-muted-foreground">جایزه</p>
            <p className="font-semibold">{winner.prize}</p>
          </div>

          <Button onClick={onClose} className="w-full">
            بستن
          </Button>
        </div>
      </div>
    </div>
  );
}
