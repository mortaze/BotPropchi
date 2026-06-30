"use client";

import { useEffect, useRef, useCallback } from "react";
import { Trophy, X } from "lucide-react";
import { Button } from "@/components/ui";
import type { LotteryWinner } from "@/types";

interface WheelWinnerModalProps {
  winner: LotteryWinner | null;
  show: boolean;
  onClose: () => void;
  onShow: () => void;
}

function fireConfetti() {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;";
  document.body.appendChild(canvas);
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) { document.body.removeChild(canvas); return; }

  const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7", "#DDA0DD", "#BB8FCE", "#F8C471", "#82E0AA", "#FF0000", "#FFD700", "#FF69B4"];
  const particles: Array<{
    x: number; y: number; vx: number; vy: number;
    size: number; color: string; rotation: number; rotSpeed: number;
    shape: "rect" | "circle"; opacity: number;
  }> = [];

  for (let i = 0; i < 150; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * 200,
      vx: (Math.random() - 0.5) * 8,
      vy: Math.random() * 4 + 2,
      size: Math.random() * 8 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 12,
      shape: Math.random() > 0.5 ? "rect" : "circle",
      opacity: 1,
    });
  }

  const startTime = Date.now();
  const duration = 4000;

  function frame() {
    const c = ctx;
    if (!c) return;
    const elapsed = Date.now() - startTime;
    if (elapsed > duration) {
      document.body.removeChild(canvas);
      return;
    }
    c.clearRect(0, 0, canvas.width, canvas.height);
    const fadeStart = duration * 0.7;
    for (const p of particles) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
      p.vx *= 0.99;
      p.rotation += p.rotSpeed;
      if (elapsed > fadeStart) {
        p.opacity = 1 - (elapsed - fadeStart) / (duration - fadeStart);
      }
      c.save();
      c.translate(p.x, p.y);
      c.rotate((p.rotation * Math.PI) / 180);
      c.globalAlpha = Math.max(0, p.opacity);
      c.fillStyle = p.color;
      if (p.shape === "rect") {
        c.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        c.beginPath();
        c.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        c.fill();
      }
      ctx.restore();
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

export default function WheelWinnerModal({ winner, show, onClose, onShow }: WheelWinnerModalProps) {
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const shownRef = useRef(false);

  useEffect(() => {
    if (show && winner && !shownRef.current) {
      shownRef.current = true;
      fireConfetti();
      timerRef.current = setTimeout(() => {
        onShow();
      }, 500);
    }
    if (!show) {
      shownRef.current = false;
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [show, winner, onShow]);

  if (!show || !winner) return null;

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

          <h2 className="text-2xl font-bold mb-2">🏆 برنده مشخص شد</h2>

          <div className="my-6">
            <p className="text-sm text-muted-foreground mb-1">نام:</p>
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
