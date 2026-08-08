'use client';

import { useState } from 'react';
import { Play, ChevronDown, ChevronUp, HelpCircle, CheckCircle2, FileSpreadsheet } from 'lucide-react';

export default function IBKRExportGuide() {
  const [isOpen, setIsOpen] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);

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
            <FileSpreadsheet size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-foreground">IBKR TradeLog Export Tutorial</h3>
              <span className="text-[10px] font-black uppercase text-accent bg-accent/10 px-2 py-0.5 rounded-full tracking-wider">
                Video Guide
              </span>
            </div>
            <p className="text-xs text-muted">
              Learn how to download your Interactive Brokers TradeLog file in 3 simple steps.
            </p>
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
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Video Player Box (7 cols) */}
            <div className="lg:col-span-7 space-y-2">
              <div className="relative rounded-xl overflow-hidden border border-card-border bg-black aspect-video group shadow-md">
                <video
                  src="/ibkr-tradelog-tutorial.mp4"
                  controls
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />
              </div>
              <p className="text-[11px] text-muted text-center flex items-center justify-center gap-1">
                <HelpCircle size={12} className="text-accent" />
                This short tutorial demonstrates selecting <strong className="text-foreground">TradeLog</strong> under IBKR Third-Party Reports.
              </p>
            </div>

            {/* Step-by-Step Instructions List (5 cols) */}
            <div className="lg:col-span-5 space-y-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted">
                Step-by-Step Instructions
              </h4>

              <div className="space-y-3">
                <div className="p-3.5 rounded-xl border border-card-border bg-muted-bg/40 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    1
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-foreground">Open IBKR Performance & Reports</h5>
                    <p className="text-[11px] text-muted leading-relaxed mt-0.5">
                      Log into IBKR portal, navigate to <strong className="text-foreground">Performance & Reports</strong> in the top bar, then select <strong className="text-foreground">Third-Party Reports</strong>.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-card-border bg-muted-bg/40 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-accent text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    2
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-foreground">Select Provider: TradeLog</h5>
                    <p className="text-[11px] text-muted leading-relaxed mt-0.5">
                      Under <strong className="text-foreground">Third-Party Downloads</strong> on the right, open the Provider dropdown and choose <strong className="text-accent font-bold">TradeLog</strong>.
                    </p>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl border border-card-border bg-muted-bg/40 flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-profit text-white font-black text-xs flex items-center justify-center shrink-0 mt-0.5">
                    3
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-foreground">Download & Drop File</h5>
                    <p className="text-[11px] text-muted leading-relaxed mt-0.5">
                      Click <strong className="text-foreground">Download</strong> to save your TradeLog file, then drag and drop or paste it into the box above!
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
