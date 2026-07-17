'use client';

import { useState, useRef, useEffect } from 'react';
import { X, ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, Circle, GripHorizontal } from 'lucide-react';
import type { RoundTrip } from '@/lib/replay/round-trips';
import { pnlColorClass, formatVolume } from '@/lib/utils/format';
import { useAccount } from '@/contexts/AccountContext';
import { formatCurrency } from '@/lib/currency';

interface FloatingTradePanelProps {
  symbol: string;
  roundTrips: RoundTrip[];
  activeTrip: RoundTrip | null;
  dayNetPnL: number;
  currentPrice?: number;
  symbols?: string[];
  onSymbolChange?: (sym: string) => void;
  onClose?: () => void;
}

export default function FloatingTradePanel({
  symbol,
  roundTrips,
  activeTrip,
  dayNetPnL,
  currentPrice,
  symbols,
  onSymbolChange,
  onClose,
}: FloatingTradePanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const { accounts, selectedAccountId } = useAccount();
  const activeAccount = accounts.find((a) => a.accountId === selectedAccountId);
  const currency = activeAccount?.currency || 'USD';

  // ── Drag state ──
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const isDragging = useRef(false);
  const dragOrigin = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPosition({
        x: window.innerWidth - 364,
        y: window.innerHeight - 520,
      });
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const newX = Math.max(0, Math.min(window.innerWidth - 340, dragOrigin.current.px + (e.clientX - dragOrigin.current.mx)));
      const newY = Math.max(0, Math.min(window.innerHeight - 48, dragOrigin.current.py + (e.clientY - dragOrigin.current.my)));
      setPosition({ x: newX, y: newY });
    };
    const onUp = () => { isDragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onDragStart = (e: React.MouseEvent) => {
    if (!position) return;
    e.preventDefault();
    isDragging.current = true;
    dragOrigin.current = { mx: e.clientX, my: e.clientY, px: position.x, py: position.y };
  };

  // ── Unrealized P&L ──
  const unrealizedPnL =
    activeTrip && currentPrice != null && activeTrip.currentQty > 0
      ? activeTrip.side === 'LONG'
        ? (currentPrice - activeTrip.currentAvgCost) * activeTrip.currentQty
        : (activeTrip.currentAvgCost - currentPrice) * activeTrip.currentQty
      : null;

  const totalRunningPnL =
    unrealizedPnL !== null ? activeTrip!.netPnL + unrealizedPnL : activeTrip?.netPnL ?? 0;

  const allTrips = [...roundTrips];
  if (activeTrip) allTrips.push(activeTrip);
  const totalTrips = allTrips.length;

  if (totalTrips === 0) return null;

  const showMultiSymbol = symbols && symbols.length > 1 && onSymbolChange;

  return (
    <div
      className="fixed z-50 w-[340px] rounded-2xl border border-card-border bg-card-bg/95 backdrop-blur-xl shadow-2xl shadow-black/20 overflow-hidden"
      style={
        position
          ? { left: position.x, top: position.y }
          : { right: 24, bottom: 96 }
      }
    >
      {/* Header — drag handle */}
      <div
        className="flex items-center justify-between px-3 py-2.5 border-b border-card-border bg-muted-bg/30 cursor-grab active:cursor-grabbing select-none"
        onMouseDown={onDragStart}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal size={12} className="text-muted/50 shrink-0" />
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-accent/10 shrink-0">
            <span className="text-[11px] font-black text-accent">{symbol}</span>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-muted tracking-wider">Round Trips</div>
            <div className="text-[11px] font-medium text-foreground">
              {totalTrips} trip{totalTrips !== 1 ? 's' : ''} today
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()}>
          {/* Inline symbol picker */}
          {showMultiSymbol && (
            <div className="flex gap-0.5 mr-1">
              {symbols.map((sym) => (
                <button
                  key={sym}
                  onClick={() => onSymbolChange(sym)}
                  className={`px-1.5 py-0.5 text-[9px] font-bold uppercase rounded transition-all ${
                    sym === symbol
                      ? 'bg-accent text-white'
                      : 'text-muted hover:text-foreground hover:bg-muted-bg'
                  }`}
                >
                  {sym}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded-md hover:bg-muted-bg transition-colors text-muted hover:text-foreground"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="p-1 rounded-md hover:bg-muted-bg transition-colors text-muted hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="max-h-[420px] overflow-y-auto">
          {/* Active Trip */}
          {activeTrip && (
            <div className="mx-3 mt-3 mb-2 rounded-xl border border-accent/30 bg-accent/5 p-3 relative overflow-hidden">
              {/* Live indicator */}
              <div className="absolute top-3 right-3 flex items-center gap-1.5">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-accent" />
                </span>
                <span className="text-[9px] font-bold uppercase text-accent tracking-wide">Open</span>
              </div>

              <div className="text-[10px] uppercase font-bold text-accent tracking-wider mb-2">
                Trip #{activeTrip.index} — Active
              </div>

              <div className="grid grid-cols-2 gap-2 mb-2">
                <MiniStat
                  label="Direction"
                  value={
                    <span className="flex items-center gap-1">
                      {activeTrip.side === 'LONG' ? (
                        <ArrowUpRight size={11} className="text-profit" />
                      ) : (
                        <ArrowDownRight size={11} className="text-loss" />
                      )}
                      <span className={activeTrip.side === 'LONG' ? 'text-profit' : 'text-loss'}>
                        {activeTrip.side}
                      </span>
                    </span>
                  }
                />
                <MiniStat label="Position" value={`${formatVolume(activeTrip.currentQty)} shares`} />
                <MiniStat label="Avg Entry" value={formatCurrency(activeTrip.entryAvgPrice, currency)} />
                <MiniStat
                  label="Cur Price"
                  value={currentPrice != null ? formatCurrency(currentPrice, currency) : '—'}
                />
              </div>

              {/* P&L breakdown */}
              <div className="space-y-1 pt-2 border-t border-accent/15">
                {unrealizedPnL !== null && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-muted font-medium">Realized</span>
                      <span className={`text-[10px] font-semibold ${pnlColorClass(activeTrip.netPnL)}`}>
                        {formatCurrency(activeTrip.netPnL, currency)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] text-muted font-medium">Unrealized</span>
                      <span className={`text-[10px] font-semibold ${pnlColorClass(unrealizedPnL)}`}>
                        {formatCurrency(unrealizedPnL, currency)}
                      </span>
                    </div>
                  </>
                )}
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[10px] text-muted font-medium">Running P&L</span>
                  <span className={`text-sm font-bold ${pnlColorClass(totalRunningPnL)}`}>
                    {formatCurrency(totalRunningPnL, currency)}
                  </span>
                </div>
              </div>

              {/* Execution ticks */}
              <div className="mt-2 flex flex-wrap gap-1">
                {activeTrip.executions.map((e, i) => {
                  const isBuy = e.side === 'BUYTOOPEN' || e.side === 'BUYTOCLOSE';
                  return (
                    <span
                      key={`${e.tradeId}-${i}`}
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                        isBuy ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
                      }`}
                      title={`${e.side} ${e.quantity}@${e.price.toFixed(2)} at ${e.time}`}
                    >
                      {isBuy ? 'B' : 'S'} {e.quantity}@{e.price.toFixed(2)}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

          {/* Completed Trips */}
          {roundTrips.length > 0 && (
            <div className="px-3 pb-3">
              {!activeTrip && <div className="h-3" />}
              <div className="text-[9px] uppercase font-bold text-muted tracking-wider mb-2">
                Completed Trips
              </div>
              <div className="space-y-1.5">
                {roundTrips.map((trip) => (
                  <CompletedTripRow key={trip.index} trip={trip} currency={currency} />
                ))}
              </div>
            </div>
          )}

          {/* Day Total */}
          {totalTrips > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-card-border bg-muted-bg/20">
              <span className="text-[10px] uppercase font-bold text-muted tracking-wider">
                {symbol} Day Total
              </span>
              <span className={`text-sm font-bold ${pnlColorClass(dayNetPnL)}`}>
                {formatCurrency(dayNetPnL, currency)}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[8px] uppercase text-muted font-bold tracking-wider">{label}</div>
      <div className="text-[11px] font-semibold text-foreground">{value}</div>
    </div>
  );
}

function CompletedTripRow({ trip, currency }: { trip: RoundTrip; currency: string }) {
  const [isOpen, setIsOpen] = useState(false);

  const formatTime12 = (time: string): string => {
    const [hStr, mStr] = time.split(':');
    let h = parseInt(hStr);
    const ampm = h >= 12 ? 'PM' : 'AM';
    if (h === 0) h = 12;
    else if (h > 12) h -= 12;
    return `${h}:${mStr} ${ampm}`;
  };

  return (
    <div className="rounded-lg border border-card-border bg-card-bg hover:bg-muted-bg/30 transition-colors">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Circle
            size={6}
            className={trip.netPnL >= 0 ? 'text-profit fill-profit' : 'text-loss fill-loss'}
          />
          <span className="text-[10px] font-bold text-muted">#{trip.index}</span>
          <span className="text-[10px] text-muted">
            {formatTime12(trip.startTime)}
            {trip.endTime && ` → ${formatTime12(trip.endTime)}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold ${pnlColorClass(trip.netPnL)}`}>
            {formatCurrency(trip.netPnL, currency)}
          </span>
          {isOpen ? <ChevronUp size={10} className="text-muted" /> : <ChevronDown size={10} className="text-muted" />}
        </div>
      </button>

      {isOpen && (
        <div className="px-3 pb-2 border-t border-card-border/50">
          <div className="grid grid-cols-3 gap-2 py-2">
            <MiniStat
              label="Side"
              value={
                <span className={trip.side === 'LONG' ? 'text-profit' : 'text-loss'}>{trip.side}</span>
              }
            />
            <MiniStat label="Entry Avg" value={formatCurrency(trip.entryAvgPrice, currency)} />
            <MiniStat
              label="Exit Avg"
              value={trip.exitAvgPrice != null ? formatCurrency(trip.exitAvgPrice, currency) : '—'}
            />
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {trip.executions.map((e, i) => {
              const isBuy = e.side === 'BUYTOOPEN' || e.side === 'BUYTOCLOSE';
              return (
                <span
                  key={`${e.tradeId}-${i}`}
                  className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${
                    isBuy ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'
                  }`}
                >
                  {isBuy ? 'B' : 'S'} {e.quantity}@{e.price.toFixed(2)}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
