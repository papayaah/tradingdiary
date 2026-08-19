'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, HelpCircle, type LucideIcon } from 'lucide-react';

export interface GuideStep {
  title: string;
  body: ReactNode;
  /** Number-badge tint. Defaults to accent; use 'profit' for the final "done" step. */
  accent?: 'accent' | 'profit';
}

export interface BrokerExportGuideProps {
  title: string;
  subtitle: string;
  /** Small pill next to the title, e.g. "Video Guide" or "Import Guide". */
  badge: string;
  icon: LucideIcon;
  steps: GuideStep[];
  /** Optional demo video. Omit for brokers without a recorded walkthrough. */
  video?: { src: string; caption: ReactNode };
  /** Optional format note shown above the steps (e.g. the exact file the parser expects). */
  formatNote?: ReactNode;
  /** Collapsed by default so guides never dominate the import page. */
  defaultOpen?: boolean;
}

/**
 * Reusable expandable broker export guide. A single presentational accordion so
 * every broker guide (IBKR, eSignal, …) shares one layout instead of copying
 * markup. Collapsed by default — the tutorial only expands when a user asks for
 * it by clicking the header.
 */
export default function BrokerExportGuide({
  title,
  subtitle,
  badge,
  icon: Icon,
  steps,
  video,
  formatNote,
  defaultOpen = false,
}: BrokerExportGuideProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="rounded-2xl border border-card-border bg-card-bg/60 overflow-hidden shadow-sm transition-all">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-5 py-4 flex items-center justify-between bg-card-bg hover:bg-sidebar-hover transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-accent/10 text-accent flex items-center justify-center font-bold">
            <Icon size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">{title}</h3>
              <span className="text-[10px] font-black uppercase text-accent bg-accent/10 px-2 py-0.5 rounded-full tracking-wider">
                {badge}
              </span>
            </div>
            <p className="text-xs text-muted">{subtitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-muted">
          <span className="text-xs font-semibold">{isOpen ? 'Hide Tutorial' : 'View Tutorial'}</span>
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </div>
      </button>

      {/* Accordion Content */}
      {isOpen && (
        <div className="p-5 border-t border-card-border space-y-6 animate-in fade-in duration-200">
          {formatNote && (
            <div className="rounded-xl border border-card-border bg-muted-bg/40 px-4 py-3 text-[11px] text-muted leading-relaxed">
              {formatNote}
            </div>
          )}

          <div className={`grid grid-cols-1 gap-6 items-start ${video ? 'lg:grid-cols-12' : ''}`}>
            {/* Video Player Box (7 cols) — only when a walkthrough exists. */}
            {video && (
              <div className="lg:col-span-7 space-y-2">
                <div className="relative rounded-xl overflow-hidden border border-card-border bg-black aspect-video group shadow-md">
                  <video
                    src={video.src}
                    controls
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                  />
                </div>
                <p className="text-[11px] text-muted text-center flex items-center justify-center gap-1">
                  <HelpCircle size={12} className="text-accent" />
                  {video.caption}
                </p>
              </div>
            )}

            {/* Step-by-Step Instructions List */}
            <div className={`${video ? 'lg:col-span-5' : ''} space-y-4`}>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                Step-by-Step Instructions
              </h4>

              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div
                    key={index}
                    className="p-3.5 rounded-xl border border-card-border bg-muted-bg/40 flex items-start gap-3"
                  >
                    <div
                      className={`w-6 h-6 rounded-full text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5 ${
                        step.accent === 'profit' ? 'bg-profit' : 'bg-accent'
                      }`}
                    >
                      {index + 1}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h5 className="text-xs font-bold text-foreground">{step.title}</h5>
                      <div className="text-[11px] text-muted leading-relaxed mt-0.5">
                        {step.body}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
