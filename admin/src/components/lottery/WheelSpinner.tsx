"use client";

import { useRef, useEffect, useCallback, forwardRef } from "react";

export interface WheelSegment {
  userId: number;
  firstName: string;
  lastName: string | null;
  username: string | null;
  chances: number;
}

interface WheelSpinnerProps {
  segments: WheelSegment[];
  onSpinComplete: (finalRotationDegrees: number) => void;
  onSlowing?: () => void;
  isSpinning: boolean;
  disabled?: boolean;
}

const COLORS = [
  "#FF6B6B", "#4ECDC4", "#45B7D1", "#96CEB4", "#FFEAA7",
  "#DDA0DD", "#98D8C8", "#F7DC6F", "#BB8FCE", "#85C1E9",
  "#F8C471", "#82E0AA", "#F1948A", "#AED6F1", "#D7BDE2",
];

function easeOutQuint(t: number): number {
  return 1 - Math.pow(1 - t, 5);
}

const WheelSpinner = forwardRef<HTMLDivElement, WheelSpinnerProps>(
  function WheelSpinner({ segments, onSpinComplete, onSlowing, isSpinning, disabled }, _ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const animFrameRef = useRef<number>(0);
    const rotationRef = useRef(0);
    const hasCalledSlowing = useRef(false);
    const prevRotationRef = useRef(0);

    const drawWheel = useCallback((currentRotation: number) => {
      const canvas = canvasRef.current;
      if (!canvas || segments.length === 0) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const size = canvas.width;
      const center = size / 2;
      const radius = center - 12;

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
        const textRadius = radius * 0.62;
        const x = center + textRadius * Math.cos(midAngle);
        const y = center + textRadius * Math.sin(midAngle);

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(midAngle + Math.PI / 2);
        ctx.fillStyle = "#000";
        ctx.font = "bold 13px Arial";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const name = segment.firstName.length > 10
          ? segment.firstName.substring(0, 10) + "…"
          : segment.firstName;
        ctx.fillText(name, 0, 0);
        ctx.restore();
      });

      ctx.beginPath();
      ctx.arc(center, center, radius, 0, 2 * Math.PI);
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(center - 18, 8);
      ctx.lineTo(center + 18, 8);
      ctx.lineTo(center, 34);
      ctx.closePath();
      ctx.fillStyle = "#FF0000";
      ctx.fill();
      ctx.strokeStyle = "#800000";
      ctx.lineWidth = 2;
      ctx.stroke();
    }, [segments]);

    useEffect(() => {
      drawWheel(rotationRef.current);
    }, [drawWheel]);

    useEffect(() => {
      if (isSpinning && segments.length > 0) {
        hasCalledSlowing.current = false;
        prevRotationRef.current = rotationRef.current;

        const extraRotations = (6 + Math.random() * 3) * 2 * Math.PI;
        const randomAngle = Math.random() * 2 * Math.PI;
        const finalRotation = rotationRef.current + extraRotations + randomAngle;
        const startRotation = rotationRef.current;
        const totalDelta = finalRotation - startRotation;
        const duration = 5000 + Math.random() * 2000;
        const startTime = performance.now();

        const animate = (now: number) => {
          const elapsed = now - startTime;
          const rawProgress = Math.min(elapsed / duration, 1);
          const eased = easeOutQuint(rawProgress);
          const currentRotation = startRotation + totalDelta * eased;
          const velocity = Math.abs(currentRotation - prevRotationRef.current);
          prevRotationRef.current = currentRotation;
          rotationRef.current = currentRotation;
          drawWheel(currentRotation);

          if (rawProgress >= 0.3 && !hasCalledSlowing.current) {
            hasCalledSlowing.current = true;
            onSlowing?.();
          }

          const isDone = rawProgress >= 1;
          if (isDone) {
            rotationRef.current = finalRotation;
            drawWheel(finalRotation);
            const finalDegrees = ((finalRotation * 180) / Math.PI) % 360;
            onSpinComplete(finalDegrees < 0 ? finalDegrees + 360 : finalDegrees);
            return;
          }

          animFrameRef.current = requestAnimationFrame(animate);
        };

        animFrameRef.current = requestAnimationFrame(animate);
      }

      return () => {
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      };
    }, [isSpinning, segments, drawWheel, onSpinComplete, onSlowing]);

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
        <div className="relative w-full aspect-square max-w-[500px]" style={{ minHeight: "300px" }}>
          <canvas
            ref={canvasRef}
            width={500}
            height={500}
            className="w-full h-full rounded-full shadow-2xl"
          />
        </div>
      </div>
    );
  }
);

export default WheelSpinner;
