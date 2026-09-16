'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { LoaderCircle } from 'lucide-react';

interface DashboardWidgetLoadingProps {
  label: string;
  className?: string;
}

export function DashboardWidgetLoading({
  label,
  className = 'min-h-[14rem]',
}: DashboardWidgetLoadingProps) {
  return (
    <div
      role="status"
      aria-label={`Loading ${label}`}
      className={`flex h-full items-center justify-center rounded-2xl border border-card-border bg-card-bg/50 ${className}`}
    >
      <div className="flex items-center gap-2 text-xs font-normal text-muted">
        <LoaderCircle size={16} className="animate-spin text-accent" aria-hidden="true" />
        <span>Loading {label}&hellip;</span>
      </div>
    </div>
  );
}

interface ProgressiveDashboardWidgetProps {
  visible: boolean;
  label: string;
  children: ReactNode;
  className?: string;
  loadingClassName?: string;
}

export function ProgressiveDashboardWidget({
  visible,
  label,
  children,
  className = '',
  loadingClassName,
}: ProgressiveDashboardWidgetProps) {
  return (
    <div className={className}>
      {visible ? (
        <div className="h-full animate-in fade-in duration-300">{children}</div>
      ) : (
        <DashboardWidgetLoading label={label} className={loadingClassName} />
      )}
    </div>
  );
}

/**
 * Keeps the cheap summary cards visible immediately, then starts one heavier
 * dashboard widget per animation frame. That guarantees the browser can paint
 * the widget above before mounting the next chart, without a perceptible delay.
 */
export function useProgressiveWidgetReveal(
  total: number,
  sequenceKey: string | null,
  initiallyVisible = 4,
): number {
  const [progress, setProgress] = useState({ key: '', visibleCount: 0 });
  const progressRef = useRef(progress);

  useEffect(() => {
    if (!sequenceKey || total <= 0) return;

    let cancelled = false;
    let timer = 0;
    let visibleCount = progressRef.current.key === sequenceKey
      ? Math.max(progressRef.current.visibleCount, initiallyVisible)
      : Math.min(initiallyVisible, total);

    if (visibleCount >= total) return;

    const revealNext = () => {
      if (cancelled) return;
      visibleCount += 1;
      const nextProgress = { key: sequenceKey, visibleCount };
      progressRef.current = nextProgress;
      setProgress(nextProgress);

      if (visibleCount < total) {
        timer = window.requestAnimationFrame(revealNext);
      }
    };

    timer = window.requestAnimationFrame(revealNext);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(timer);
    };
  }, [initiallyVisible, sequenceKey, total]);

  if (!sequenceKey) return 0;
  return progress.key === sequenceKey
    ? Math.max(progress.visibleCount, Math.min(initiallyVisible, total))
    : Math.min(initiallyVisible, total);
}
