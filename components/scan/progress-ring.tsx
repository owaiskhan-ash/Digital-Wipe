"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type RingStage = { short: string };

/**
 * The scan's progress as a checkpoint ring: the arc fills, and the three stages
 * sit on the ring itself, so twenty seconds of waiting has structure to look at
 * instead of a bar creeping to the right.
 *
 * The whole ring is decoration to a screen reader: the visible percentage
 * changes several times a second, so only the stage names are announced, via
 * the caller's live region.
 */
export function ProgressRing({
  progress,
  stages,
  activeIndex,
  label,
}: {
  progress: number;
  stages: readonly RingStage[];
  activeIndex: number;
  label?: string;
}) {
  const radius = 86;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, progress));
  const offset = circumference * (1 - clamped / 100);
  const step = 360 / stages.length;
  // Where the ring sits inside the box, as a percentage of its width.
  const ringRadiusPct = 43;

  return (
    <div className="relative mx-auto mb-2 mt-9 h-[184px] w-[184px] sm:h-[212px] sm:w-[212px]">
      <svg viewBox="0 0 200 200" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="var(--color-line)"
          strokeWidth="6"
        />
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="var(--color-moss)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>

      <div className="absolute inset-0 grid place-content-center text-center">
        <p className="font-display text-[2.5rem] leading-none tabular-nums text-ink">
          {Math.round(clamped)}
          <span className="text-lg text-muted">%</span>
        </p>
        <p className="mt-1.5 text-[0.625rem] uppercase tracking-[0.18em] text-muted">
          {label ?? "searched"}
        </p>
      </div>

      {stages.map((stage, index) => {
        const angle = ((-90 + index * step) * Math.PI) / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const dotX = 50 + ringRadiusPct * cos;
        const dotY = 50 + ringRadiusPct * sin;
        // Labels sit a little further out along the same spoke.
        const out = 30;
        const done = clamped >= (index + 1) * (100 / stages.length) - 0.5;
        const active = index === activeIndex && !done;

        return (
          <span key={`${stage.short}-${index}`}>
            <span
              style={{ left: `${dotX}%`, top: `${dotY}%` }}
              className={cn(
                "absolute grid size-[1.6rem] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border text-[0.625rem] font-medium tabular-nums transition-colors duration-500",
                done
                  ? "border-moss bg-moss text-paper"
                  : active
                    ? "animate-pulse-soft border-moss bg-surface text-moss-deep"
                    : "border-line bg-surface text-muted"
              )}
            >
              {done ? (
                <Check className="size-3.5" strokeWidth={2.6} aria-hidden />
              ) : active ? (
                <span className="size-2 rounded-full bg-moss" aria-hidden />
              ) : (
                index + 1
              )}
            </span>
            <span
              style={{
                left: `calc(${dotX}% + ${cos * out}px)`,
                top: `calc(${dotY}% + ${sin * out}px)`,
              }}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[0.625rem] uppercase tracking-[0.12em] transition-colors duration-500",
                done || active ? "text-ink" : "text-muted"
              )}
            >
              {stage.short}
            </span>
          </span>
        );
      })}
    </div>
  );
}
