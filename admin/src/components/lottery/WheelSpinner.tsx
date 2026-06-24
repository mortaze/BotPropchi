"use client";

import { useRef, useEffect, useState, useCallback } from "react";

interface WheelSegment {
  userId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  chances: number;
}

interface WheelSpinnerProps {
  segments: WheelSegment[];
  onSpinComplete: (winner: WheelSegment) => void;
  isSpinning: boolean;
  disabled?: boolean;
}

const COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
  "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
  "#F8C471", "#82E0AA", "#F1948A", "#AED6F1", "#D7BDE2",
];

export default function WheelSpinner({ segments, onSpinComplete, isSpinning, disabled }: WheelSpinnerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [rotation, setRotation] = useState(0);
  const [selectedWinner, setSelectedWinner] = useState<WheelSegment | null>(null);

  const drawWheel = useCallback((currentRotation: number) => {
    const canvas = canvasRef.current;
    if (!canvas || segments.length === 0) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 10;

    ctx.clearRect(0, 0, size, size);

    const totalSegments = segments.length;
    const segmentAngle = (2 * Math.PI) / totalSegments;

    segments.forEach((segment, index) => {
      const startAngle = currentRotation + index * segmentAngle;
      const endAngle = startAngle + segmentAngle;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();

      ctx.fillStyle = COLORS[index % COLORS.length];
      ctx.fill();

      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.stroke();

      const midAngle = startAngle + segmentAngle / 2;
      const textRadius = radius * 0.65;
      const x = center + textRadius * Math.cos(midAngle);
      const y = center + textRadius * Math.sin(midAngle);

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(midAngle + Math.PI / 2);

      ctx.fillStyle = "#000";
      ctx.font = "bold 14px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      const displayName = segment.firstName.length > 8
        ? segment.firstName.substring(0, 8) + "..."
        : segment.firstName;
      ctx.fillText(displayName, 0, 0);

      ctx.restore();
    });

    ctx.beginPath();
    ctx.arc(center, center, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(center - 15, 10);
    ctx.lineTo(center + 15, 10);
    ctx.lineTo(center, 30);
    ctx.closePath();
    ctx.fillStyle = "#FF0000";
    ctx.fill();
    ctx.strokeStyle = "#800000";
    ctx.lineWidth = 2;
    ctx.stroke();
  }, [segments]);

  useEffect(() => {
    drawWheel(rotation);
  }, [rotation, drawWheel]);

  const spin = useCallback(() => {
    if (isSpinning || disabled || segments.length === 0) return;

    const totalSegments = segments.length;
    const segmentAngle = (2 * Math.PI) / totalSegments;

    const randomIndex = Math.floor(Math.random() * totalSegments);
    const winner = segments[randomIndex];

    const targetAngle = -(randomIndex * segmentAngle + segmentAngle / 2);
    const spinAmount = 10 * 2 * Math.PI;
    const finalRotation = targetAngle - spinAmount;

    setSelectedWinner(winner);

    const startRotation = rotation;
    const duration = 5000;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      const eased = 1 - Math.pow(1 - progress, 3);
      const currentRotation = startRotation + (finalRotation - startRotation) * eased;

      setRotation(currentRotation);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        onSpinComplete(winner);
      }
    };

    requestAnimationFrame(animate);
  }, [isSpinning, disabled, segments, rotation, onSpinComplete]);

  if (segments.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8">
        <div className="w-64 h-64 rounded-full bg-muted flex items-center justify-center">
          <p className="text-muted-foreground text-center">شرکت‌کننده‌ای وجود ندارد</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative">
        <canvas
          ref={canvasRef}
          width={400}
          height={400}
          className="rounded-full shadow-lg"
        />
        <button
          onClick={spin}
          disabled={isSpinning || disabled}
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-primary text-primary-foreground font-bold text-sm shadow-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
        >
          {isSpinning ? "..." : "چرخش"}
        </button>
      </div>
    </div>
  );
}
